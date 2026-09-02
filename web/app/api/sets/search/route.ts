import { NextRequest, NextResponse } from "next/server";
import { searchSets } from "@/lib/queries/setAnalysis";

// Recherche de sets pour l'écran Analyse set CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- même forme que /api/items/search, un cran plus
// haut (set_code plutôt qu'item).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = params.get("q") ?? "";
  if (q.trim().length < 1) return NextResponse.json({ sets: [] });

  try {
    const sets = await searchSets(q.trim(), 8);
    return NextResponse.json({ sets });
  } catch (err) {
    console.error("GET /api/sets/search failed:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
