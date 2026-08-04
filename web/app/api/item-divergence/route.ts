import { NextRequest, NextResponse } from "next/server";
import { getDivergence, DIVERGENCE_WINDOWS, type DivergenceWindowDays } from "@/lib/queries/divergence";
import { GRADES, type Grade } from "@/lib/constants";

// Signal divergence volume/prix pour UNE carte (fiche /catalog/[id]) --
// même calcul que la page Divergence, restreint via `itemId`
// (cf. lib/queries/divergence.ts). Renvoie au plus une ligne : `null` si la
// carte n'a pas assez de ventes sur l'une des deux fenêtres pour un delta
// fiable (cf. MIN_SALES_PER_WINDOW).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const itemIdParam = params.get("item_id");
  const itemId = itemIdParam ? parseInt(itemIdParam, 10) : NaN;
  if (!itemIdParam || !Number.isFinite(itemId)) {
    return NextResponse.json({ error: "item_id must be an integer" }, { status: 400 });
  }

  const windowParam = Number(params.get("window"));
  const windowDays: DivergenceWindowDays = (DIVERGENCE_WINDOWS as readonly number[]).includes(windowParam)
    ? (windowParam as DivergenceWindowDays)
    : 30;

  const gradeParam = params.get("grade") ?? "ungraded";
  const grade = (GRADES as readonly string[]).includes(gradeParam) ? (gradeParam as Grade) : "ungraded";

  try {
    const rows = await getDivergence({ itemId, windowDays, grade, minPrice: 0, limit: 1 });
    return NextResponse.json({ row: rows[0] ?? null });
  } catch (err) {
    console.error("GET /api/item-divergence failed:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
