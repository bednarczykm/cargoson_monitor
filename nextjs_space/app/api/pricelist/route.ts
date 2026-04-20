export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const items = await prisma.priceListItem.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error("Error fetching pricelist:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { length, width, height, weight, carrier, serviceMethod, destinationCountry, basePrice } = await req.json();

    if (!length || !width || !height || !weight || !carrier || !destinationCountry || basePrice === undefined) {
      return NextResponse.json(
        { error: "Wszystkie pola są wymagane" },
        { status: 400 }
      );
    }

    const item = await prisma.priceListItem.create({
      data: {
        length: parseFloat(length),
        width: parseFloat(width),
        height: parseFloat(height),
        weight: parseFloat(weight),
        carrier,
        serviceMethod: serviceMethod || "Standard",
        destinationCountry: destinationCountry.toUpperCase(),
        basePrice: parseFloat(basePrice),
      },
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error("Error creating pricelist item:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
