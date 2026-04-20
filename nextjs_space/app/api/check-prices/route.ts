export const dynamic = "force-dynamic";
// Allow the check to run long enough to hit Cargoson for every active
// recipient × dimension combination (currently ~27 calls @ 1–5s each).
// Default Next.js Route Handler timeout is 10s which is too short.
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { runCheckPrices } from "@/lib/check-prices-job";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { testOnly } = await req.json().catch(() => ({ testOnly: false }));
    const summary = await runCheckPrices({ testOnly });

    if (!summary.ok) {
      const map: Record<string, string> = {
        "no-recipients": "Brak adresów do sprawdzenia. Najpierw dodaj adresy odbiorców.",
        "no-pricelist": "Brak pozycji w cenniku. Najpierw dodaj cennik.",
      };
      return NextResponse.json(
        { error: map[summary.reason || ""] || `Cannot run: ${summary.reason}` },
        { status: 400 },
      );
    }

    return NextResponse.json({
      results: summary.results,
      errors: summary.errors,
      checkHistoryId: summary.checkHistoryId,
      recipientsChecked: summary.recipientsChecked,
      alertsCreated: summary.alertsCreated,
      discrepanciesFound: summary.discrepanciesFound,
    });
  } catch (error) {
    console.error("Check prices error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
