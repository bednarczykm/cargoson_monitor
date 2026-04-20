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

    const { data } = await req.json();

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: "Brak danych do importu" },
        { status: 400 }
      );
    }

    const results = { success: 0, errors: 0 };

    for (const row of data) {
      try {
        const dimStr = row["Wymiary paczki (DxSxW cm)"] || row["dimensions"] || "";
        const dims = parseDimensions(dimStr);
        const weight = parseFloat(row["Waga (kg)"] || row["weight"] || 0);
        const carrier = row["Carrier"] || row["carrier"] || "";
        const serviceMethod = row["Metoda wysyłki"] || row["serviceMethod"] || "Standard";
        const destinationCountry = (row["Kraj docelowy"] || row["destinationCountry"] || "").toString().toUpperCase();
        const basePrice = parseFloat(row["Cena bazowa"] || row["basePrice"] || 0);

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
            update: { basePrice },
            create: {
              length: dims.length,
              width: dims.width,
              height: dims.height,
              weight,
              carrier,
              serviceMethod,
              destinationCountry,
              basePrice,
            },
          });
          results.success++;
        } else {
          results.errors++;
        }
      } catch {
        results.errors++;
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
