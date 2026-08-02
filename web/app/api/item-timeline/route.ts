import { NextRequest, NextResponse } from "next/server";
import { getItemDailyTimeline } from "@/lib/queries/itemTimeline";
import { DIVERGENCE_WINDOWS } from "@/lib/queries/divergence";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const itemIdParam = params.get("item_id");
  const itemId = itemIdParam ? parseInt(itemIdParam, 10) : NaN;
  if (!itemIdParam || !Number.isFinite(itemId)) {
    return NextResponse.json({ error: "item_id must be an integer" }, { status: 400 });
  }

  const windowParam = Number(params.get("window"));
  const windowDays = (DIVERGENCE_WINDOWS as readonly number[]).includes(windowParam) ? windowParam : 30;

  try {
    const points = await getItemDailyTimeline(itemId, windowDays);
    return NextResponse.json({ points });
  } catch (err) {
    console.error("GET /api/item-timeline failed:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
