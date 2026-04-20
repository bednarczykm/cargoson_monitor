export const dynamic = "force-dynamic";
// Allow the check to run long enough to hit Cargoson for every active
// recipient × dimension combination (currently ~27 calls @ 1–5s each).
// Default Next.js Route Handler timeout is 10s which is too short.
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { getFreightPrices, formatCollectionDate, calculateCBM } from "@/lib/cargoson";
import { carrierNamesMatch, normalizeCarrierName } from "@/lib/carriers";
import { sendSlackNotification } from "@/lib/slack";

// EUR to PLN conversion rate
const EUR_TO_PLN = 4.3;

interface PriceResult {
  recipientName: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  carrier: string;
  serviceMethod: string;
  dimensions: string;
  weight: number;
  apiPrice: number;
  apiCurrency: string;
  apiPricePLN: number;
  priceListPrice: number | null;
}

// Key for unique dimension/weight combination
function getDimensionKey(length: number, width: number, height: number, weight: number): string {
  return `${length}x${width}x${height}_${weight}`;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { testOnly } = await req.json().catch(() => ({ testOnly: false }));

    const recipients = await prisma.recipient.findMany({
      where: { isActive: true }
    });
    const priceList = await prisma.priceListItem.findMany({
      where: { isActive: true }
    });
    const settings = await prisma.settings.findFirst();

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "Brak adresów do sprawdzenia. Najpierw dodaj adresy odbiorców." },
        { status: 400 }
      );
    }

    if (priceList.length === 0) {
      return NextResponse.json(
        { error: "Brak pozycji w cenniku. Najpierw dodaj cennik." },
        { status: 400 }
      );
    }

    // Get unique dimension/weight combinations from pricelist
    const uniqueDimensions = new Map<string, { length: number; width: number; height: number; weight: number }>();
    for (const item of priceList) {
      const key = getDimensionKey(item.length, item.width, item.height, item.weight);
      if (!uniqueDimensions.has(key)) {
        uniqueDimensions.set(key, {
          length: item.length,
          width: item.width,
          height: item.height,
          weight: item.weight,
        });
      }
    }

    const collectionPostcode = settings?.collectionPostcode || "43-300";
    const collectionCountry = settings?.collectionCountry || "PL";
    const collectionDate = formatCollectionDate();

    const results: PriceResult[] = [];
    const errors: string[] = [];

    // For each recipient and each dimension/weight combination
    for (const recipient of recipients) {
      for (const [dimKey, dims] of uniqueDimensions) {
        try {
          const response = await getFreightPrices({
            collection_date: collectionDate,
            collection_postcode: collectionPostcode,
            collection_country: collectionCountry,
            delivery_postcode: recipient.postalCode,
            delivery_country: recipient.country,
            rows_attributes: {
              "0": {
                quantity: "1",
                package_type: "CTN",
                weight: dims.weight.toString(),
                length: dims.length.toString(),
                width: dims.width.toString(),
                height: dims.height.toString(),
                cbm: calculateCBM(dims.length, dims.width, dims.height),
                ldm: "0",
                description: "Goods",
              },
            },
          });

          const prices = response?.object?.prices ?? [];

          if (prices.length === 0) {
            // No API prices - add result with pricelist info only
            const matchingPriceItems = priceList.filter(
              (p) =>
                p.destinationCountry.toUpperCase() === recipient.country.toUpperCase() &&
                p.length === dims.length &&
                p.width === dims.width &&
                p.height === dims.height &&
                p.weight === dims.weight
            );

            for (const priceItem of matchingPriceItems) {
              results.push({
                recipientName: recipient.name,
                street: recipient.street,
                city: recipient.city,
                postalCode: recipient.postalCode,
                country: recipient.country,
                carrier: priceItem.carrier,
                serviceMethod: priceItem.serviceMethod,
                dimensions: `${dims.length}x${dims.width}x${dims.height}`,
                weight: dims.weight,
                apiPrice: -1, // -1 means no API data
                apiCurrency: "N/A",
                apiPricePLN: -1,
                priceListPrice: priceItem.basePrice,
              });
            }
          } else {
            for (const price of prices) {
              const rawCarrierName = price.carrier || "Unknown";
              const carrierName = normalizeCarrierName(rawCarrierName);
              const serviceMethod = price.service || "Standard";
              const apiCurrency = price.currency || "PLN";
              
              // Extract BASE PRICE (transport_price) from surcharges, not total price
              // This excludes fuel surcharges (BAF), energy fees, MAUT, etc.
              let apiPrice = 0;
              const surcharges = price.surcharges ?? [];
              const transportPriceSurcharge = surcharges.find(
                (s) => s.identifier === "transport_price"
              );
              
              if (transportPriceSurcharge) {
                apiPrice = parseFloat(transportPriceSurcharge.amount || "0");
              } else {
                // Fallback: if no transport_price found, use total price
                apiPrice = parseFloat(price.price || "0");
              }
              
              // Convert to PLN if needed
              const apiPricePLN = apiCurrency === "EUR" ? apiPrice * EUR_TO_PLN : apiPrice;

              // Match pricelist by carrier, service method, country and dimensions
              const matchingPriceItem = priceList.find(
                (p) =>
                  carrierNamesMatch(p.carrier, carrierName) &&
                  p.serviceMethod === serviceMethod &&
                  p.destinationCountry.toUpperCase() === recipient.country.toUpperCase() &&
                  p.length === dims.length &&
                  p.width === dims.width &&
                  p.height === dims.height &&
                  p.weight === dims.weight
              );

              results.push({
                recipientName: recipient.name,
                street: recipient.street,
                city: recipient.city,
                postalCode: recipient.postalCode,
                country: recipient.country,
                carrier: carrierName,
                serviceMethod,
                dimensions: `${dims.length}x${dims.width}x${dims.height}`,
                weight: dims.weight,
                apiPrice,
                apiCurrency,
                apiPricePLN: Math.round(apiPricePLN * 100) / 100,
                priceListPrice: matchingPriceItem?.basePrice ?? null,
              });
            }
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : "Unknown error";
          errors.push(`${recipient.name} (${dimKey}): ${errMsg}`);
        }
      }
    }

    // Check for price discrepancies and create alerts
    const tolerancePercent = settings?.tolerancePercent ?? 0;
    const alertsToCreate: {
      recipientId: string;
      recipientName: string;
      city: string;
      carrier: string;
      apiPrice: number;
      priceListPrice: number;
      difference: number;
      percentDiff: number;
    }[] = [];

    for (const result of results) {
      // Skip if no API price or no pricelist price
      if (result.apiPricePLN <= 0 || result.priceListPrice === null) {
        continue;
      }

      const difference = result.apiPricePLN - result.priceListPrice;
      const percentDiff = (difference / result.priceListPrice) * 100;

      // Check if difference exceeds tolerance (either direction)
      if (Math.abs(percentDiff) > tolerancePercent) {
        // Find recipient ID
        const recipient = recipients.find(r => r.name === result.recipientName);
        if (recipient) {
          alertsToCreate.push({
            recipientId: recipient.id,
            recipientName: result.recipientName,
            city: result.city,
            carrier: `${result.carrier} - ${result.serviceMethod}`,
            apiPrice: result.apiPricePLN,
            priceListPrice: result.priceListPrice,
            difference: Math.round(difference * 100) / 100,
            percentDiff: Math.round(percentDiff * 100) / 100,
          });
        }
      }
    }

    // Create alerts in database (avoiding duplicates from same day)
    let alertsCreated = 0;
    const createdAlerts: Array<{
      id: string;
      recipientName: string;
      city: string;
      carrier: string;
      apiPrice: number;
      priceListPrice: number;
      difference: number;
      percentDiff: number;
    }> = [];

    if (!testOnly && alertsToCreate.length > 0) {
      // Get today's date range for duplicate checking
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      for (const alertData of alertsToCreate) {
        // Check if similar UNRESOLVED alert already exists today
        // If previous alert was resolved, we should create a new one since the issue persists
        const existingAlert = await prisma.alert.findFirst({
          where: {
            recipientId: alertData.recipientId,
            carrier: alertData.carrier,
            status: "unresolved", // Only skip if there's an active unresolved alert
            createdAt: {
              gte: todayStart,
              lte: todayEnd,
            },
          },
        });

        if (!existingAlert) {
          const newAlert = await prisma.alert.create({
            data: alertData,
          });
          alertsCreated++;
          createdAlerts.push({
            id: newAlert.id,
            recipientName: alertData.recipientName,
            city: alertData.city,
            carrier: alertData.carrier,
            apiPrice: alertData.apiPrice,
            priceListPrice: alertData.priceListPrice,
            difference: alertData.difference,
            percentDiff: alertData.percentDiff,
          });
        }
      }

      // Send Slack notification if alerts were created
      if (createdAlerts.length > 0 && settings?.slackWebhook) {
        await sendSlackNotification(settings.slackWebhook, createdAlerts);
      }
    }

    if (!testOnly) {
      const checkHistory = await prisma.checkHistory.create({
        data: {
          recipientsCount: recipients.length,
          alertsCount: alertsCreated,
          discrepanciesCount: alertsToCreate.length,
          status: "completed",
          csvData: JSON.stringify(results),
        },
      });

      return NextResponse.json({
        results,
        errors,
        checkHistoryId: checkHistory.id,
        recipientsChecked: recipients.length,
        alertsCreated,
        discrepanciesFound: alertsToCreate.length,
      });
    }

    return NextResponse.json({
      results,
      errors,
      recipientsChecked: recipients.length,
      discrepanciesFound: alertsToCreate.length,
    });
  } catch (error) {
    console.error("Check prices error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
