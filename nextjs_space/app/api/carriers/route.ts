export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { CARGOSON_CARRIERS } from "@/lib/carriers";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(CARGOSON_CARRIERS);
  } catch (error) {
    console.error("Error fetching carriers:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
