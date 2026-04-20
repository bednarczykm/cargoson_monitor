export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { sendTestSlackNotification } from "@/lib/slack";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await prisma.settings.findFirst();
    
    if (!settings?.slackWebhook) {
      return NextResponse.json(
        { error: "Brak skonfigurowanego webhook Slack w ustawieniach" },
        { status: 400 }
      );
    }

    const result = await sendTestSlackNotification(settings.slackWebhook);

    if (result.success) {
      return NextResponse.json({ 
        success: true, 
        message: "Testowa wiadomość została wysłana na Slack" 
      });
    } else {
      return NextResponse.json(
        { error: result.error || "Nie udało się wysłać wiadomości" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Test Slack error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
