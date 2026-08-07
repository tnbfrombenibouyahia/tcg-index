import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getItemById } from "@/lib/queries/itemDetail";
import { getSales } from "@/lib/queries/sales";
import { getGradingRoiCandidate } from "@/lib/queries/gradingRoi";
import {
  computeGradingRoi,
  DEFAULT_GRADING_ROI_ASSUMPTIONS,
  type GradingRoiCandidate,
  type GradingRoiResult,
} from "@/lib/gradingRoi";
import { GRADES, GRADE_LABELS } from "@/lib/constants";
import type { LiquidityCalc, SealedEvCalc, UndervaluedCalc } from "@/lib/types";
import { formatDate, formatUsd } from "@/lib/format";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatDelta } from "@/components/ui/StatDelta";
import { ReliabilityBars } from "@/components/sealed-ev/ReliabilityBars";
import { SalesHistoryChart } from "@/components/undervalued/SalesHistoryChart";
import { PriceHistoryPanel } from "@/components/catalog/PriceHistoryPanel";
import { DivergencePanel } from "@/components/catalog/DivergencePanel";

// ─────────────────────────────────────────────────────────────────────────────
// Fiche carte / "analyse totale" (demande utilisateur) : point d'arrivée de
// la recherche catalogue (/catalog). Rassemble tout ce que l'app sait déjà
// calculer sur UN item -- prix courant par grade, historique de prix,
// signal volume/prix (Divergence), score de sous-évaluation (singles) et
// ratio EV scellé (Booster Box) quand ils existent, plus l'historique de
// ventes. Chaque section réutilise un composant déjà éprouvé ailleurs dans
// l'app (IndexChart, PriceVolumeChart, SalesHistoryChart, ReliabilityBars)
// plutôt que d'en réinventer une variante.
// ─────────────────────────────────────────────────────────────────────────────

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itemId = parseInt(id, 10);
  if (!Number.isFinite(itemId)) notFound();

  const item = await getItemById(itemId);
  if (!item) notFound();

  const [salesResult, gradingRoiCandidate, t, tPrices, tUndervalued, tSealedEv] = await Promise.all([
    getSales({ itemId, pageSize: 100, sort: "date_asc" }),
    getGradingRoiCandidate(itemId),
    getTranslations("itemDetail"),
    getTranslations("itemDetail.pricesTable"),
    getTranslations("undervalued.modal"),
    getTranslations("sealedEv.table"),
  ]);

  // null pour le scellé et les singles sans (ungraded + ≥1 prix gradé) --
  // section omise plutôt qu'un lien mort (cf. lib/queries/gradingRoi.ts).
  const gradingRoiResult = gradingRoiCandidate
    ? computeGradingRoi(gradingRoiCandidate, DEFAULT_GRADING_ROI_ASSUMPTIONS)
    : null;

  const orderedPrices = [...item.latestPrices].sort((a, b) => GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade));
  const availableGrades = orderedPrices.map((p) => p.grade);

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

      {/* Header */}
      <div className="card-glass flex flex-col gap-5 rounded-2xl p-6 sm:flex-row">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- hôtes CDN externes (TCGPlayer/PriceCharting), cf. plan §5
          <img
            src={item.imageUrl}
            alt={item.name}
            className="h-48 w-36 flex-shrink-0 self-center rounded-xl object-contain bg-white shadow-sm sm:self-start"
            style={{ aspectRatio: "3/4" }}
          />
        ) : (
          <div className="h-48 w-36 flex-shrink-0 self-center rounded-xl bg-muted sm:self-start" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <LanguageFlag language={item.language} />
            <h1 className="truncate text-xl font-bold tracking-tight">{item.name}</h1>
          </div>
          <p className="mt-1 text-sm capitalize text-muted-foreground">
            {item.tcg} {item.setCode ? `· ${item.setCode}` : ""} {item.code ? `· #${item.code}` : ""}
          </p>
          {item.releaseDate && <p className="text-xs text-muted-foreground">{formatDate(item.releaseDate)}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
              {t(`category.${item.category}`)}
            </span>
            {item.rarity && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                {item.rarity}
              </span>
            )}
          </div>

          {/* Current price by grade */}
          <h2 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("pricesTitle")}
          </h2>
          {orderedPrices.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("noPrices")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground">
                    <th className="pr-4 pb-1 font-medium">{tPrices("grade")}</th>
                    <th className="pr-4 pb-1 font-medium">{tPrices("price")}</th>
                    <th className="pr-4 pb-1 font-medium">{tPrices("updated")}</th>
                    <th className="pb-1 font-medium">{tPrices("source")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedPrices.map((p) => (
                    <tr key={p.grade} className="border-t border-border">
                      <td className="py-1.5 pr-4 font-medium">{GRADE_LABELS[p.grade]}</td>
                      <td className="py-1.5 pr-4 tabular-nums font-semibold">{formatUsd(p.price)}</td>
                      <td className="py-1.5 pr-4 text-xs text-muted-foreground">{formatDate(p.capturedAt)}</td>
                      <td className="py-1.5 text-xs text-muted-foreground">{p.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Price history */}
      {orderedPrices.length > 0 && (
        <Section title={t("priceHistoryTitle")}>
          <PriceHistoryPanel itemId={item.id} availableGrades={availableGrades} />
        </Section>
      )}

      {/* Undervalued score (singles only) */}
      {item.undervalued && (
        <Section title={t("undervaluedTitle")} link={{ href: "/undervalued", label: t("seeMethodology") }}>
          <UndervaluedBlock calc={item.undervalued} t={tUndervalued} />
        </Section>
      )}

      {/* Sealed EV ratio (tracked Booster Box only) */}
      {item.sealedEv && (
        <Section title={t("sealedEvTitle")} link={{ href: "/sealed-ev", label: t("seeMethodology") }}>
          <SealedEvBlock calc={item.sealedEv} t={tSealedEv} />
        </Section>
      )}

      {/* Liquidité : stock (annonces eBay actives) vs flux (ventes récentes) --
          scellé EN uniquement pour l'instant, et seulement si les deux
          signaux existent (cf. getItemById), pas de section vide affichée. */}
      {item.liquidity && (
        <Section title={t("liquidityTitle")}>
          <LiquidityBlock calc={item.liquidity} t={t} />
        </Section>
      )}

      {/* Grading ROI teaser (singles gradables uniquement) */}
      {gradingRoiCandidate && gradingRoiResult && (
        <Section title={t("gradingRoiTitle")} link={{ href: `/grading-roi/${item.id}`, label: t("openCalculator") }}>
          <GradingRoiTeaser candidate={gradingRoiCandidate} result={gradingRoiResult} t={t} />
        </Section>
      )}

      {/* Volume/Price divergence signal */}
      <Section title={t("divergenceTitle")} link={{ href: "/divergence", label: t("seeMethodology") }}>
        <p className="mb-4 text-xs text-muted-foreground">{t("divergenceDescription")}</p>
        <DivergencePanel itemId={item.id} />
      </Section>

      {/* Sales history */}
      <Section title={t("salesHistoryTitle")}>
        {salesResult.sales.length === 0 ? (
          <EmptyState title={tUndervalued("noSales")} />
        ) : (
          <SalesHistoryChart sales={salesResult.sales} tcg={item.tcg} name={item.name} rarity={item.rarity} language={item.language} />
        )}
      </Section>
    </div>
  );
}

// ── Section wrapper ─────────────────────────────────────────────────────────
function Section({
  title,
  link,
  children,
}: {
  title: string;
  link?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="card-glass mt-4 rounded-2xl p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {link && (
          <Link href={link.href} className="text-xs text-muted-foreground hover:text-foreground">
            {link.label} →
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Undervalued calculation breakdown -- même contenu que CardDetailModal ──────
function UndervaluedBlock({
  calc,
  t,
}: {
  calc: UndervaluedCalc;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const stats: { label: string; value: string }[] = [
    { label: t("packPrice"), value: calc.packPrice != null ? formatUsd(calc.packPrice) : "—" },
    { label: t("pullRateLabel"), value: calc.pullRate != null ? `1/${Math.round(1 / calc.pullRate)}` : "—" },
    { label: t("pullCost"), value: calc.pullCost != null ? formatUsd(calc.pullCost) : "—" },
    {
      label: t("characterMultiplier"),
      value: calc.characterMultiplier != null ? `×${calc.characterMultiplier.toFixed(2)}` : "—",
    },
    { label: t("theoreticalValue"), value: formatUsd(calc.theoreticalValue) },
    { label: t("marketPrice"), value: formatUsd(calc.marketPrice) },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
            <p className="text-sm font-semibold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
        <span className="text-xs text-muted-foreground">{t("scoreLabel")}</span>
        <span className="text-base font-bold tabular-nums">{calc.undervaluedScore.toFixed(1)}×</span>
      </div>
    </div>
  );
}

// ── Grading ROI teaser -- hypothèses par défaut, ajustables sur /grading-roi/[id] ──
function GradingRoiTeaser({
  candidate,
  result,
  t,
}: {
  candidate: GradingRoiCandidate;
  result: GradingRoiResult;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const stats: { label: string; value: string }[] = [
    { label: t("gradingRoiUngraded"), value: formatUsd(candidate.ungradedPrice) },
    { label: t("gradingRoiExpectedValue"), value: formatUsd(result.expectedValueNet) },
    { label: t("gradingRoiCost"), value: formatUsd(result.totalCost) },
    { label: t("gradingRoiProfit"), value: formatUsd(result.netProfit) },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
            <p className="text-sm font-semibold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
        <span className="text-xs text-muted-foreground">{t("gradingRoiLabel")}</span>
        <StatDelta changePct={result.roiPct} />
      </div>
    </div>
  );
}

// ── Sealed EV breakdown -- mêmes champs que la table /sealed-ev ────────────────
function SealedEvBlock({
  calc,
  t,
}: {
  calc: SealedEvCalc;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const stats: { label: string; value: string }[] = [
    { label: t("boxPrice"), value: formatUsd(calc.boxPrice) },
    { label: t("valueTotal"), value: formatUsd(calc.singlesTotalValue) },
    { label: t("valueTop10"), value: formatUsd(calc.singlesTop10Value) },
    { label: t("cards"), value: String(calc.singlesCount) },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
            <p className="text-sm font-semibold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
          <span className="text-xs text-muted-foreground">{t("ratio")}</span>
          <span className="text-base font-bold tabular-nums">{calc.evRatioTotal.toFixed(2)}×</span>
        </div>
        <ReliabilityBars score={calc.boxReliabilityScore} salesUsed={calc.boxSalesUsed} />
      </div>
    </div>
  );
}

// ── Liquidité : taux d'écoulement (stock eBay vs ventes récentes) ──────────
function LiquidityBlock({
  calc,
  t,
}: {
  calc: LiquidityCalc;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const stats: { label: string; value: string }[] = [
    { label: t("liquidityListingCount"), value: String(calc.listingCount) },
    { label: t("liquiditySales30d"), value: String(calc.salesCount30d) },
    { label: t("liquiditySales90d"), value: String(calc.salesCount90d) },
  ];

  return (
    <div>
      <p className="mb-4 text-xs text-muted-foreground">{t("liquidityDescription")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
            <p className="text-sm font-semibold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>
      {calc.sellThroughRate30d != null && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
          <span className="text-xs text-muted-foreground">{t("liquiditySellThrough")}</span>
          <span className="text-base font-bold tabular-nums">{(calc.sellThroughRate30d * 100).toFixed(0)}%</span>
        </div>
      )}
    </div>
  );
}
