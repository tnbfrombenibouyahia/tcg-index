import { NextRequest, NextResponse } from "next/server";
import { getItemPriceHistory } from "@/lib/queries/itemDetail";
import { GRADES, type Grade } from "@/lib/constants";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const itemIdParam = params.get("item_id");
  const itemId = itemIdParam ? parseInt(itemIdParam, 10) : NaN;
  if (!itemIdParam || !Number.isFinite(itemId)) {
    return NextResponse.json({ error: "item_id must be an integer" }, { status: 400 });
  }

  const gradeParam = params.get("grade") ?? "ungraded";
  const grade = (GRADES as readonly string[]).includes(gradeParam) ? (gradeParam as Grade) : "ungraded";

  try {
    const points = await getItemPriceHistory(itemId, grade);
    return NextResponse.json({ points });
  } catch (err) {
    console.error("GET /api/item-price-history failed:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
