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

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(todayStart);
    monthStart.setDate(monthStart.getDate() - 30);

    const [recipientsCount, priceListCount, settings, lastCheck] = await Promise.all([
      prisma.recipient.count(),
      prisma.priceListItem.count(),
      prisma.settings.findFirst(),
      prisma.checkHistory.findFirst({ orderBy: { checkDate: "desc" } }),
    ]);

    const [alertsToday, alertsWeek, alertsMonth, unresolvedAlerts] = await Promise.all([
      prisma.alert.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.alert.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.alert.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.alert.count({ where: { status: "unresolved" } }),
    ]);

    const recentAlerts = await prisma.alert.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const alertsByDay = await prisma.$queryRaw<{ date: Date; count: bigint }[]>`
      SELECT DATE("createdAt") as date, COUNT(*) as count 
      FROM "Alert" 
      WHERE "createdAt" >= ${monthStart}
      GROUP BY DATE("createdAt") 
      ORDER BY date ASC
    `;

    return NextResponse.json({
      recipientsCount,
      priceListCount,
      alertsToday,
      alertsWeek,
      alertsMonth,
      unresolvedAlerts,
      monitoringEnabled: settings?.monitoringEnabled ?? false,
      lastCheck: lastCheck?.checkDate ?? null,
      recentAlerts,
      alertsByDay: alertsByDay.map((a) => ({
        date: a.date.toISOString().split("T")[0],
        count: Number(a.count),
      })),
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
