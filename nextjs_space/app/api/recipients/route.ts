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

    const recipients = await prisma.recipient.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(recipients);
  } catch (error) {
    console.error("Error fetching recipients:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, street, city, postalCode, country } = await req.json();

    if (!name || !street || !city || !postalCode || !country) {
      return NextResponse.json(
        { error: "Wszystkie pola są wymagane" },
        { status: 400 }
      );
    }

    const recipient = await prisma.recipient.create({
      data: { name, street, city, postalCode, country },
    });

    return NextResponse.json(recipient);
  } catch (error) {
    console.error("Error creating recipient:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
