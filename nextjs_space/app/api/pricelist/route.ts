export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { createdEntry, deleteItemsWithHistory, priceSince, sessionEmail } from "@/lib/price-history";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const items = await prisma.priceListItem.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(items.map((i) => ({ ...i, ...priceSince(i) })));
  } catch (error) {
    console.error("Error fetching pricelist:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// Bulk delete pricelist rows by id list (UI passes currently-filtered items).
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : null;
    const scope = body?.scope as string | undefined;

    const who = sessionEmail(session);

    if (scope === "all") {
      const deleted = await prisma.$transaction((tx) =>
        deleteItemsWithHistory(tx, {}, "manual", who),
      );
      return NextResponse.json({ success: true, deleted });
    }

    if (!ids || ids.length === 0) {
      return NextResponse.json(
        { error: "Pass either { scope: 'all' } or { ids: [...] }" },
        { status: 400 },
      );
    }

    const deleted = await prisma.$transaction((tx) =>
      deleteItemsWithHistory(tx, { id: { in: ids } }, "manual", who),
    );
    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    console.error("Error bulk-deleting pricelist:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { length, width, height, weight, carrier, serviceMethod, destinationCountry, basePrice, currency } = await req.json();

    if (!length || !width || !height || !weight || !carrier || !destinationCountry || basePrice === undefined) {
      return NextResponse.json(
        { error: "Wszystkie pola są wymagane" },
        { status: 400 }
      );
    }

    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.priceListItem.create({
        data: {
          length: parseFloat(length),
          width: parseFloat(width),
          height: parseFloat(height),
          weight: parseFloat(weight),
          carrier,
          serviceMethod: serviceMethod || "Standard",
          destinationCountry: destinationCountry.toUpperCase(),
          basePrice: parseFloat(basePrice),
          currency: (currency || "PLN").toUpperCase(),
          source: "manual",
          priceSetAt: new Date(),
        },
      });
      await tx.priceHistory.create({ data: createdEntry(created, "manual", sessionEmail(session)) });
      return created;
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error("Error creating pricelist item:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
