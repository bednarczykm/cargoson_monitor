export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

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
        const name = row["Nazwa odbiorcy"] || row["name"] || "";
        const street = row["Ulica"] || row["street"] || "";
        const city = row["Miejscowość"] || row["city"] || "";
        const postalCode = row["Kod pocztowy"] || row["postalCode"] || "";
        const country = row["Kraj"] || row["country"] || "";

        if (name && street && city && postalCode && country) {
          await prisma.recipient.create({
            data: { name, street, city, postalCode, country: country.toUpperCase() },
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
