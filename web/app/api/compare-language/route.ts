import { NextRequest, NextResponse } from "next/server";
import { getLanguageComparison } from "@/lib/queries/compareLanguage";
import { GRADES } from "@/lib/constants";
import type { Grade } from "@/lib/constants";

const TCGS = ["pokemon", "one-piece"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const tcg = params.get("tcg");
  if (!tcg || !TCGS.includes(tcg)) {
    return NextResponse.json({ error: `tcg must be one of ${TCGS.join(", ")}` }, { status: 400 });
  }

  const name = params.get("name");
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const language = params.get("language");
  if (!language) {
    return NextResponse.json({ error: "language is required" }, { status: 400 });
  }

  const grade = params.get("grade");
  if (!grade || !(GRADES as readonly string[]).includes(grade)) {
    return NextResponse.json({ error: `grade must be one of ${GRADES.join(", ")}` }, { status: 400 });
  }

  try {
    const data = await getLanguageComparison({
      tcg,
      name,
      rarity: params.get("rarity"),
      language,
      grade: grade as Grade,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error("GET /api/compare-language failed:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
