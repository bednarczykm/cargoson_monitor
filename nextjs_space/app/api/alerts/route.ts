export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const where = status && status !== "all" ? { status } : {};

    const alerts = await prisma.alert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return NextResponse.json(alerts);
  } catch (error) {
    console.error("Error fetching alerts:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await req.json();

    const alert = await prisma.alert.create({
      data: {
        recipientId: data.recipientId,
        recipientName: data.recipientName,
        city: data.city,
        carrier: data.carrier,
        apiPrice: data.apiPrice,
        priceListPrice: data.priceListPrice,
        difference: data.difference,
        percentDiff: data.percentDiff,
        status: "unresolved",
      },
    });

    return NextResponse.json(alert);
  } catch (error) {
    console.error("Error creating alert:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// Bulk resolve all unresolved alerts
export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { action } = await req.json();

    if (action === "resolve-all") {
      const result = await prisma.alert.updateMany({
        where: { status: "unresolved" },
        data: { status: "resolved" },
      });

      return NextResponse.json({ 
        success: true, 
        resolved: result.count,
        message: `Rozwiązano ${result.count} alertów` 
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Error bulk updating alerts:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
