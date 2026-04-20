export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { runCheckPrices, shouldRunNow } from "@/lib/check-prices-job";

// Bearer-auth'd endpoint hit by the systemd timer every 5 min. Returns 200
// even when nothing was done (gated by Settings) so the timer doesn't flap.
//
// curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//      -X POST https://cargoson.efapp.pl/api/cron/check-prices
async function handle(req: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET || "";
  const authHeader = req.headers.get("authorization") || "";
  const provided = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured on server" },
      { status: 500 },
    );
  }
  if (!provided || provided !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Allow ?force=1 to bypass the gate (useful for manual runs).
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  if (!force) {
    const gate = await shouldRunNow();
    if (!gate.shouldRun) {
      return NextResponse.json({
        ok: true,
        ran: false,
        reason: gate.reason,
        lastRunAt: gate.lastRunAt,
        nextRunAt: gate.nextRunAt,
      });
    }
  }

  const summary = await runCheckPrices({ testOnly: false });
  return NextResponse.json({
    ok: true,
    ran: summary.ok,
    reason: summary.ok ? undefined : summary.reason,
    recipientsChecked: summary.recipientsChecked,
    discrepanciesFound: summary.discrepanciesFound,
    alertsCreated: summary.alertsCreated,
    checkHistoryId: summary.checkHistoryId,
    errors: summary.errors,
  });
}

export async function POST(req: Request) {
  return handle(req);
}
// Allow GET too — easier for `curl -H Authorization: Bearer …` from a timer.
export async function GET(req: Request) {
  return handle(req);
}
