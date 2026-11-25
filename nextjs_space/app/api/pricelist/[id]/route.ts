export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import {
  changedEntry,
  deleteItemsWithHistory,
  samePrice,
  sameRoute,
  sessionEmail,
} from "@/lib/price-history";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { length, width, height, weight, carrier, serviceMethod, destinationCountry, basePrice, currency, isActive } = await req.json();

    const item = await prisma.$transaction(async (tx) => {
      const before = await tx.priceListItem.findUnique({ where: { id: params.id } });
      if (!before) return null;

      const next = {
        length: parseFloat(length),
        width: parseFloat(width),
        height: parseFloat(height),
        weight: parseFloat(weight),
        carrier,
        serviceMethod: serviceMethod || "Standard",
        destinationCountry: destinationCountry.toUpperCase(),
        basePrice: parseFloat(basePrice),
        currency: currency !== undefined ? (currency || "PLN").toUpperCase() : before.currency,
      };
      // Zmiana kwoty, waluty albo samej trasy (wymiary, przewoźnik, kraj…)
      // to nowa cena dla tej pozycji: przesuwa „Cena od” i trafia do historii.
      const priceChanged =
        !samePrice(before.basePrice, before.currency, next.basePrice, next.currency) ||
        !sameRoute(before, next);

      const after = await tx.priceListItem.update({
        where: { id: params.id },
        data: {
          ...next,
          isActive: isActive !== undefined ? isActive : true,
          ...(priceChanged && { priceSetAt: new Date() }),
        },
      });
      if (priceChanged) {
        await tx.priceHistory.create({
          data: changedEntry(before, after, "manual", sessionEmail(session)),
        });
      }
      return after;
    });

    if (!item) {
      return NextResponse.json({ error: "Nie ma takiej pozycji" }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (error) {
    console.error("Error updating pricelist item:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { isActive } = await req.json();

    const item = await prisma.priceListItem.update({
      where: { id: params.id },
      data: { isActive },
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error("Error toggling pricelist item:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.$transaction((tx) =>
      deleteItemsWithHistory(tx, { id: params.id }, "manual", sessionEmail(session)),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting pricelist item:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
