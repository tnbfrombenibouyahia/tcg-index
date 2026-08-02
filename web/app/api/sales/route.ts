import { NextRequest, NextResponse } from "next/server";
import { getSales, type SalesFilterParams } from "@/lib/queries/sales";
import { GRADES } from "@/lib/constants";

const TCGS = ["pokemon", "one-piece"];
const SORTS = [
  "date_desc",
  "date_asc",
  "price_desc",
  "price_asc",
  "language_asc",
  "language_desc",
  "rarity_asc",
  "rarity_desc",
];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const tcg = params.get("tcg") ?? undefined;
  if (tcg && !TCGS.includes(tcg)) {
    return NextResponse.json({ error: `tcg must be one of ${TCGS.join(", ")}` }, { status: 400 });
  }

  const grade = params.get("grade") ?? undefined;
  if (grade && !(GRADES as readonly string[]).includes(grade)) {
    return NextResponse.json({ error: `grade must be one of ${GRADES.join(", ")}` }, { status: 400 });
  }

  const sort = (params.get("sort") ?? "date_desc") as SalesFilterParams["sort"];
  if (!SORTS.includes(sort!)) {
    return NextResponse.json({ error: `sort must be one of ${SORTS.join(", ")}` }, { status: 400 });
  }

  const itemIdParam = params.get("item_id");
  const itemId = itemIdParam ? parseInt(itemIdParam, 10) : undefined;
  if (itemIdParam && !Number.isFinite(itemId)) {
    return NextResponse.json({ error: "item_id must be an integer" }, { status: 400 });
  }

  const pageParam = params.get("page");
  const page = pageParam ? parseInt(pageParam, 10) : 1;
  if (pageParam && (!Number.isFinite(page) || page < 1)) {
    return NextResponse.json({ error: "page must be a positive integer" }, { status: 400 });
  }

  const pageSizeParam = params.get("pageSize");
  const pageSize = pageSizeParam ? parseInt(pageSizeParam, 10) : 25;
  if (pageSizeParam && (!Number.isFinite(pageSize) || pageSize < 1 || pageSize > 100)) {
    return NextResponse.json({ error: "pageSize must be between 1 and 100" }, { status: 400 });
  }

  try {
    const data = await getSales({
      tcg,
      setCode: params.get("set_code") ?? undefined,
      itemId,
      grade,
      rarity: params.get("rarity") ?? undefined,
      sort,
      page,
      pageSize,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error("GET /api/sales failed:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
