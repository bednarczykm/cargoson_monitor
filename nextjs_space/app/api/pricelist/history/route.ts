export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

const MAX_LIMIT = 2000;

// GET /api/pricelist/history?itemId=&carrier=&country=&action=&from=ISO&to=ISO&limit=
// Najnowsze wpisy najpierw.
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const q = new URL(req.url).searchParams;
    const where: Prisma.PriceHistoryWhereInput = {};
    const itemId = q.get("itemId");
    const carrier = q.get("carrier");
    const country = q.get("country");
    const action = q.get("action");
    const from = q.get("from");
    const to = q.get("to");

    if (itemId) {
      // Historia pozycji = wpisy tej pozycji ORAZ wcześniejszych pozycji o tej
      // samej trasie (np. skasowanej i dodanej ponownie importem CSV).
      const item = await prisma.priceListItem.findUnique({ where: { id: itemId } });
      where.OR = [
        { priceListItemId: itemId },
        ...(item
          ? [
              {
                length: item.length,
                width: item.width,
                height: item.height,
                weight: item.weight,
                carrier: item.carrier,
                serviceMethod: item.serviceMethod,
                destinationCountry: item.destinationCountry,
              },
            ]
          : []),
      ];
    }
    if (carrier) where.carrier = carrier;
    if (country) where.destinationCountry = country.toUpperCase();
    if (action && ["created", "changed", "deleted"].includes(action)) where.action = action;

    // Granice dnia liczy przeglądarka (czas polski), tu przychodzą gotowe
    // znaczniki ISO: from włącznie, to wyłącznie.
    const changedAt: Prisma.DateTimeFilter = {};
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if (fromDate && !isNaN(fromDate.getTime())) changedAt.gte = fromDate;
    if (toDate && !isNaN(toDate.getTime())) changedAt.lt = toDate;
    if (changedAt.gte || changedAt.lt) where.changedAt = changedAt;

    const limit = Math.min(Math.max(parseInt(q.get("limit") || "500", 10) || 500, 1), MAX_LIMIT);

    const [entries, total, carriers, countries] = await Promise.all([
      prisma.priceHistory.findMany({
        where,
        orderBy: [{ changedAt: "desc" }, { id: "desc" }],
        take: limit,
      }),
      prisma.priceHistory.count({ where }),
      // Listy do filtrów: wszystko, co kiedykolwiek pojawiło się w historii.
      prisma.priceHistory.findMany({ distinct: ["carrier"], select: { carrier: true }, orderBy: { carrier: "asc" } }),
      prisma.priceHistory.findMany({
        distinct: ["destinationCountry"],
        select: { destinationCountry: true },
        orderBy: { destinationCountry: "asc" },
      }),
    ]);

    return NextResponse.json({
      entries,
      total,
      limit,
      carriers: carriers.map((c) => c.carrier),
      countries: countries.map((c) => c.destinationCountry),
    });
  } catch (error) {
    console.error("Error fetching price history:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
