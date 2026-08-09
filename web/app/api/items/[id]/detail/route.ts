import { NextRequest, NextResponse } from "next/server";
import { getItemById } from "@/lib/queries/itemDetail";
import { getSales } from "@/lib/queries/sales";
import { getGradingRoiCandidate } from "@/lib/queries/gradingRoi";
import { computeGradingRoi, DEFAULT_GRADING_ROI_ASSUMPTIONS } from "@/lib/gradingRoi";

// Bundle complet d'une fiche item (prix courants, undervalued/sealedEv/
// liquidity, grading ROI, historique de ventes) en un aller-retour --
// alimente ItemDetailModal (popup ouverte depuis /catalog sans quitter la
// page, demande utilisateur), pendant client de ce que /catalog/[id]
// assemble déjà côté serveur (cf. lib/queries/itemDetail.ts).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itemId = parseInt(id, 10);
  if (!Number.isFinite(itemId)) {
    return NextResponse.json({ error: "id must be an integer" }, { status: 400 });
  }

  try {
    const [item, salesResult, gradingRoiCandidate] = await Promise.all([
      getItemById(itemId),
      getSales({ itemId, pageSize: 100, sort: "date_asc" }),
      getGradingRoiCandidate(itemId),
    ]);

    if (!item) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const gradingRoi = gradingRoiCandidate
      ? { candidate: gradingRoiCandidate, result: computeGradingRoi(gradingRoiCandidate, DEFAULT_GRADING_ROI_ASSUMPTIONS) }
      : null;

    return NextResponse.json({ item, sales: salesResult.sales, gradingRoi });
  } catch (err) {
    console.error("GET /api/items/[id]/detail failed:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
