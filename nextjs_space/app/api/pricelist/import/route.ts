export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

function parseDimensions(dimStr: string): { length: number; width: number; height: number } | null {
  const match = dimStr?.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
  if (match) {
    return {
      length: parseFloat(match[1]),
      width: parseFloat(match[2]),
      height: parseFloat(match[3]),
    };
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, replaceAll } = await req.json();

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: "Brak danych do importu" },
        { status: 400 }
      );
    }

    const results = { success: 0, errors: 0, deleted: 0 };

    // Track the keys we see in this CSV. When replaceAll=true we wipe every
    // DB row whose key isn't in the CSV at the end.
    type Key = string;
    const keyOf = (
      length: number,
      width: number,
      height: number,
      weight: number,
      carrier: string,
      serviceMethod: string,
      destinationCountry: string,
    ): Key =>
      `${length}|${width}|${height}|${weight}|${carrier}|${serviceMethod}|${destinationCountry}`;
    const seenKeys = new Set<Key>();

    for (const row of data) {
      try {
        const dimStr = row["Wymiary paczki (DxSxW cm)"] || row["dimensions"] || "";
        const dims = parseDimensions(dimStr);
        const weight = parseFloat(row["Waga (kg)"] || row["weight"] || 0);
        const carrier = row["Carrier"] || row["carrier"] || "";
        const serviceMethod = row["Metoda wysyłki"] || row["serviceMethod"] || "Standard";
        const destinationCountry = (row["Kraj docelowy"] || row["destinationCountry"] || "").toString().toUpperCase();
        const basePrice = parseFloat(row["Cena bazowa"] || row["basePrice"] || 0);
        const currency = ((row["Waluta"] || row["currency"] || "PLN") + "").toUpperCase();

        if (dims && weight && carrier && destinationCountry && basePrice) {
          await prisma.priceListItem.upsert({
            where: {
              length_width_height_weight_carrier_serviceMethod_destinationCountry: {
                length: dims.length,
                width: dims.width,
                height: dims.height,
                weight,
                carrier,
                serviceMethod,
                destinationCountry,
              },
            },
            update: { basePrice, currency },
            create: {
              length: dims.length,
              width: dims.width,
              height: dims.height,
              weight,
              carrier,
              serviceMethod,
              destinationCountry,
              basePrice,
              currency,
            },
          });
          seenKeys.add(
            keyOf(dims.length, dims.width, dims.height, weight, carrier, serviceMethod, destinationCountry),
          );
          results.success++;
        } else {
          results.errors++;
        }
      } catch {
        results.errors++;
      }
    }

    if (replaceAll === true && seenKeys.size > 0) {
      const existing = await prisma.priceListItem.findMany({
        select: {
          id: true,
          length: true,
          width: true,
          height: true,
          weight: true,
          carrier: true,
          serviceMethod: true,
          destinationCountry: true,
        },
      });
      const toDelete = existing
        .filter((e) => !seenKeys.has(
          keyOf(e.length, e.width, e.height, e.weight, e.carrier, e.serviceMethod, e.destinationCountry),
        ))
        .map((e) => e.id);
      if (toDelete.length > 0) {
        const del = await prisma.priceListItem.deleteMany({
          where: { id: { in: toDelete } },
        });
        results.deleted = del.count;
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
