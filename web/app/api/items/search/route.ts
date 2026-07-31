import { NextRequest, NextResponse } from "next/server";
import { searchItems } from "@/lib/queries/items";

const TCGS = ["pokemon", "one-piece"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const q = params.get("q") ?? "";
  if (q.trim().length < 2) {
    return NextResponse.json({ error: "q must be at least 2 characters" }, { status: 400 });
  }

  const tcg = params.get("tcg") ?? undefined;
  if (tcg && !TCGS.includes(tcg)) {
    return NextResponse.json({ error: `tcg must be one of ${TCGS.join(", ")}` }, { status: 400 });
  }

  const limitParam = params.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 20;
  if (limitParam && (!Number.isFinite(limit) || limit < 1 || limit > 50)) {
    return NextResponse.json({ error: "limit must be between 1 and 50" }, { status: 400 });
  }

  try {
    const items = await searchItems({ q: q.trim(), tcg, setCode: params.get("set_code") ?? undefined, limit });
    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/items/search failed:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
