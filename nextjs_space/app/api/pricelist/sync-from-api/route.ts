export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { getFreightPrices, formatCollectionDate } from "@/lib/cargoson";
import { carrierNamesMatch, normalizeCarrierName } from "@/lib/carriers";

interface SyncRequest {
  countries?: string[];         // ISO-2 codes, e.g. ["DE", "FR"]; empty = all active recipients' countries
  carriers?: string[];          // carrier names from CARGOSON_CARRIERS; empty = all
  length?: number;              // cm, default 10
  width?: number;               // cm, default 10
  height?: number;              // cm, default 10
  weight?: number;              // kg, default 2
  overwrite?: boolean;          // if false, only create missing rows (default: false)
}

function cbm(l: number, w: number, h: number): string {
  return ((l * w * h) / 1_000_000).toFixed(6);
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as SyncRequest;

    const L = body.length ?? 10;
    const W = body.width ?? 10;
    const H = body.height ?? 10;
    const KG = body.weight ?? 2;
    const overwrite = body.overwrite === true;
    const carrierFilter = new Set(
      (body.carriers ?? []).map((c) => normalizeCarrierName(c).toLowerCase()),
    );

    const settings = await prisma.settings.findFirst();
    const collectionPostcode = settings?.collectionPostcode || "43-300";
    const collectionCountry = settings?.collectionCountry || "PL";
    const collectionDate = formatCollectionDate();

    // Resolve which countries to hit. If user didn't pick any, take all
    // destination countries from the active recipients (one rep per country).
    const recipients = await prisma.recipient.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
    });
    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "Brak aktywnych odbiorców — najpierw dodaj odbiorców." },
        { status: 400 },
      );
    }

    // group recipients by country, pick first as the rep
    const byCountry = new Map<string, typeof recipients[number]>();
    for (const r of recipients) {
      const cc = r.country.toUpperCase();
      if (!byCountry.has(cc)) byCountry.set(cc, r);
    }

    const countriesRequested = (body.countries ?? [])
      .map((c) => c.toUpperCase())
      .filter((c) => byCountry.has(c));
    const countriesToSync = countriesRequested.length
      ? countriesRequested
      : Array.from(byCountry.keys());

    let added = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    const perCountry: { country: string; fetched: number; saved: number }[] = [];

    for (const cc of countriesToSync) {
      const rep = byCountry.get(cc)!;
      try {
        const response = await getFreightPrices({
          collection_date: collectionDate,
          collection_postcode: collectionPostcode,
          collection_country: collectionCountry,
          delivery_postcode: rep.postalCode,
          delivery_country: rep.country,
          rows_attributes: {
            "0": {
              quantity: "1",
              package_type: "CTN",
              weight: String(KG),
              length: String(L),
              width: String(W),
              height: String(H),
              cbm: cbm(L, W, H),
              ldm: "0",
              description: "Goods",
            },
          },
        });

        const prices = response?.object?.prices ?? [];
        let savedThisCountry = 0;

        for (const price of prices) {
          const rawCarrier = price.carrier || "Unknown";
          const carrier = normalizeCarrierName(rawCarrier);
          const serviceMethod = price.service || "Standard";
          const currency = (price.currency || "PLN").toUpperCase();

          // If user restricted carriers, skip those not on the list
          if (
            carrierFilter.size > 0 &&
            !carrierFilter.has(carrier.toLowerCase()) &&
            !Array.from(carrierFilter).some((c) => carrierNamesMatch(c, carrier))
          ) {
            continue;
          }

          // Prefer "transport_price" surcharge as base, fall back to total price
          const surcharges = price.surcharges ?? [];
          const transport = surcharges.find(
            (s) => s.identifier === "transport_price",
          );
          const rawPrice = parseFloat(
            (transport?.amount ?? price.price ?? "0").replace(",", "."),
          );
          if (!Number.isFinite(rawPrice) || rawPrice <= 0) continue;

          const existing = await prisma.priceListItem.findUnique({
            where: {
              length_width_height_weight_carrier_serviceMethod_destinationCountry:
                {
                  length: L,
                  width: W,
                  height: H,
                  weight: KG,
                  carrier,
                  serviceMethod,
                  destinationCountry: cc,
                },
            },
          });

          if (existing && !overwrite) {
            skipped++;
            continue;
          }

          if (existing) {
            await prisma.priceListItem.update({
              where: { id: existing.id },
              data: {
                basePrice: rawPrice,
                currency,
                source: "cargoson_api",
                lastSyncedAt: new Date(),
                isActive: true,
              },
            });
            updated++;
          } else {
            await prisma.priceListItem.create({
              data: {
                length: L,
                width: W,
                height: H,
                weight: KG,
                carrier,
                serviceMethod,
                destinationCountry: cc,
                basePrice: rawPrice,
                currency,
                source: "cargoson_api",
                lastSyncedAt: new Date(),
                isActive: true,
              },
            });
            added++;
          }
          savedThisCountry++;
        }

        perCountry.push({
          country: cc,
          fetched: prices.length,
          saved: savedThisCountry,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        errors.push(`${cc}: ${msg}`);
        perCountry.push({ country: cc, fetched: 0, saved: 0 });
      }
    }

    return NextResponse.json({
      added,
      updated,
      skipped,
      errors,
      perCountry,
      dimensions: `${L}x${W}x${H} cm, ${KG} kg`,
      carriersFiltered: Array.from(carrierFilter),
      countriesProcessed: countriesToSync,
    });
  } catch (error) {
    console.error("sync-from-api error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
