export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

const DEFAULT_SLACK_WEBHOOK = "alerty-aaaarvngzarvl2wcifn23htopi@eurofrance-workspace.slack.com";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let settings = await prisma.settings.findFirst();

    if (!settings) {
      settings = await prisma.settings.create({
        data: {
          tolerancePercent: 0,
          checkIntervalMinutes: 60,
          pauseStart: "23:00",
          pauseEnd: "05:00",
          alertEmail: session.user?.email || "",
          slackWebhook: DEFAULT_SLACK_WEBHOOK,
          monitoringEnabled: false,
          collectionPostcode: "10115",
          collectionCountry: "DE",
        },
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await req.json();
    let settings = await prisma.settings.findFirst();

    if (settings) {
      settings = await prisma.settings.update({
        where: { id: settings.id },
        data: {
          tolerancePercent: data.tolerancePercent ?? settings.tolerancePercent,
          checkIntervalMinutes: data.checkIntervalMinutes ?? settings.checkIntervalMinutes,
          pauseStart: data.pauseStart ?? settings.pauseStart,
          pauseEnd: data.pauseEnd ?? settings.pauseEnd,
          alertEmail: data.alertEmail ?? settings.alertEmail,
          slackWebhook: data.slackWebhook ?? settings.slackWebhook,
          monitoringEnabled: data.monitoringEnabled ?? settings.monitoringEnabled,
          collectionPostcode: data.collectionPostcode ?? settings.collectionPostcode,
          collectionCountry: data.collectionCountry ?? settings.collectionCountry,
        },
      });
    } else {
      settings = await prisma.settings.create({ data });
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
