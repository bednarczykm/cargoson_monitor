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

    // Backfill country from Recipient for legacy rows (alerts created before
    // 2026-04-20 didn't persist country). We do it here rather than via a DB
    // migration so it's cheap and non-destructive.
    const missingCountry = alerts.filter((a) => !a.country);
    if (missingCountry.length > 0) {
      const recipientIds = Array.from(new Set(missingCountry.map((a) => a.recipientId)));
      const recipients = await prisma.recipient.findMany({
        where: { id: { in: recipientIds } },
        select: { id: true, country: true },
      });
      const idToCountry = new Map(recipients.map((r) => [r.id, r.country]));
      for (const a of alerts) {
        if (!a.country && idToCountry.has(a.recipientId)) {
          a.country = idToCountry.get(a.recipientId) || null;
        }
      }
    }

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

// Bulk delete: ?scope=all | resolved | unresolved (default: all)
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope") || "all";

    const where =
      scope === "resolved"
        ? { status: "resolved" }
        : scope === "unresolved"
        ? { status: "unresolved" }
        : {}; // all

    const result = await prisma.alert.deleteMany({ where });

    return NextResponse.json({
      success: true,
      deleted: result.count,
      scope,
      message: `Skasowano ${result.count} alertów`,
    });
  } catch (error) {
    console.error("Error deleting alerts:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
