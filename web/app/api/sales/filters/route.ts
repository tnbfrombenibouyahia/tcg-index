import { NextRequest, NextResponse } from "next/server";
import { getSalesFilters } from "@/lib/queries/sales";

const TCGS = ["pokemon", "one-piece"];

export async function GET(request: NextRequest) {
  const tcg = request.nextUrl.searchParams.get("tcg");
  if (!tcg) {
    return NextResponse.json({ error: "tcg is required" }, { status: 400 });
  }
  if (!TCGS.includes(tcg)) {
    return NextResponse.json({ error: `tcg must be one of ${TCGS.join(", ")}` }, { status: 400 });
  }

  try {
    const data = await getSalesFilters(tcg);
    return NextResponse.json(data);
  } catch (err) {
    console.error("GET /api/sales/filters failed:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
