export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { length, width, height, weight, carrier, serviceMethod, destinationCountry, basePrice, currency, isActive } = await req.json();

    const item = await prisma.priceListItem.update({
      where: { id: params.id },
      data: {
        length: parseFloat(length),
        width: parseFloat(width),
        height: parseFloat(height),
        weight: parseFloat(weight),
        carrier,
        serviceMethod: serviceMethod || "Standard",
        destinationCountry: destinationCountry.toUpperCase(),
        basePrice: parseFloat(basePrice),
        ...(currency !== undefined && { currency: (currency || "PLN").toUpperCase() }),
        isActive: isActive !== undefined ? isActive : true,
      },
    });

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

    await prisma.priceListItem.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting pricelist item:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
