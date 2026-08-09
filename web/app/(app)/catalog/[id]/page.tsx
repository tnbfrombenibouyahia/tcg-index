import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getItemById } from "@/lib/queries/itemDetail";
import { getSales } from "@/lib/queries/sales";
import { getGradingRoiCandidate } from "@/lib/queries/gradingRoi";
import { computeGradingRoi, DEFAULT_GRADING_ROI_ASSUMPTIONS } from "@/lib/gradingRoi";
import { ItemDetailBody } from "@/components/catalog/ItemDetailBody";

// ─────────────────────────────────────────────────────────────────────────────
// Fiche carte / "analyse totale" (demande utilisateur) : version pleine page,
// partageable par URL -- le point d'entrée normal reste désormais la popup
// verre ouverte depuis /catalog (cf. ItemDetailModal), cette page sert de
// lien profond direct (dashboard widgets, partage d'URL) et de repli sans
// JS. Le corps (tout sauf le fil d'ariane) est factorisé dans
// ItemDetailBody, réutilisé tel quel par la modale.
// ─────────────────────────────────────────────────────────────────────────────

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itemId = parseInt(id, 10);
  if (!Number.isFinite(itemId)) notFound();

  const item = await getItemById(itemId);
  if (!item) notFound();

  const [salesResult, gradingRoiCandidate, t] = await Promise.all([
    getSales({ itemId, pageSize: 100, sort: "date_asc" }),
    getGradingRoiCandidate(itemId),
    getTranslations("itemDetail"),
  ]);

  // null pour le scellé et les singles sans (ungraded + ≥1 prix gradé) --
  // section omise plutôt qu'un lien mort (cf. lib/queries/gradingRoi.ts).
  const gradingRoi = gradingRoiCandidate
    ? { candidate: gradingRoiCandidate, result: computeGradingRoi(gradingRoiCandidate, DEFAULT_GRADING_ROI_ASSUMPTIONS) }
    : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/catalog" className="hover:text-foreground">
          {t("breadcrumb")}
        </Link>
        <span>/</span>
        <span className="truncate font-medium text-foreground">{item.name}</span>
      </div>

      <ItemDetailBody item={item} sales={salesResult.sales} gradingRoi={gradingRoi} />
    </div>
  );
}
