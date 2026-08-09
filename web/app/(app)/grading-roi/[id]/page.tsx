import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getGradingRoiCandidate } from "@/lib/queries/gradingRoi";
import { getItemById } from "@/lib/queries/itemDetail";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { EmptyState } from "@/components/ui/EmptyState";
import { GradingRoiCalculator } from "@/components/grading-roi/GradingRoiCalculator";

// ─────────────────────────────────────────────────────────────────────────────
// Version pleine page du calculateur (demande utilisateur) : partageable par
// URL, point d'arrivée depuis la fiche carte (/catalog/[id], section
// "Grading ROI") et depuis la modale du classement (/grading-roi). Même
// GradingRoiCalculator que la modale -- pas de logique dupliquée.
//
// `getGradingRoiCandidate` renvoie null aussi bien pour "item inexistant"
// que "item existant mais inéligible" (pas d'ungraded, ou aucun prix
// gradé) -- on retombe sur getItemById pour distinguer les deux et donner
// un message utile plutôt qu'un 404 générique dans le second cas.
// ─────────────────────────────────────────────────────────────────────────────

export default async function GradingRoiItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itemId = parseInt(id, 10);
  if (!Number.isFinite(itemId)) notFound();

  const candidate = await getGradingRoiCandidate(itemId);
  const t = await getTranslations("gradingRoi");

  if (!candidate) {
    const item = await getItemById(itemId);
    if (!item) notFound();

    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <Breadcrumb name={item.name} />
        <EmptyState title={t("modal.ineligibleTitle")} description={t("modal.ineligibleDescription")} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Breadcrumb name={candidate.name} />

      <div className="card-glass rounded-2xl p-6">
        <div className="mb-5 flex items-center gap-3">
          {candidate.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- source PriceCharting plafonnée à 60px de large
            <img
              src={candidate.imageUrl}
              alt={candidate.name}
              className="h-20 w-[3.75rem] flex-shrink-0 rounded-lg object-contain shadow-sm"
              style={{ aspectRatio: "3/4", background: "var(--surface-alt)" }}
            />
          ) : (
            <div className="h-20 w-[3.75rem] flex-shrink-0 rounded-lg bg-muted" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <LanguageFlag language={candidate.language} />
              <h1 className="truncate text-lg font-bold tracking-tight">{candidate.name}</h1>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {candidate.tcg} {candidate.setCode ? `· ${candidate.setCode}` : ""} {candidate.code ? `· #${candidate.code}` : ""}
            </p>
          </div>
        </div>

        <GradingRoiCalculator candidate={candidate} />
      </div>
    </div>
  );
}

async function Breadcrumb({ name }: { name: string }) {
  const t = await getTranslations("gradingRoi");
  return (
    <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
      <Link href="/grading-roi" className="hover:text-foreground">
        {t("title")}
      </Link>
      <span>/</span>
      <span className="truncate font-medium text-foreground">{name}</span>
    </div>
  );
}
