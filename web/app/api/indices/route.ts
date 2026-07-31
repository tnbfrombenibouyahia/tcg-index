import { NextRequest, NextResponse } from "next/server";
import { getAllIndices } from "@/lib/queries/indices";

export async function GET(request: NextRequest) {
  const daysParam = request.nextUrl.searchParams.get("days");
  const days = daysParam ? parseInt(daysParam, 10) : 180;

  if (daysParam && (!Number.isFinite(days) || days < 1 || days > 3650)) {
    return NextResponse.json({ error: "days must be an integer between 1 and 3650" }, { status: 400 });
  }

  try {
    const data = await getAllIndices(days);
    return NextResponse.json(data);
  } catch (err) {
    console.error("GET /api/indices failed:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
