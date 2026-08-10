"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { GradingRoiCandidate, GradingRoiResult } from "@/lib/gradingRoi";
import { GRADES, GRADE_LABELS } from "@/lib/constants";
import type { ItemDetail, LiquidityCalc, PopulationCalc, SaleRow, SealedEvCalc, UndervaluedCalc } from "@/lib/types";
import { formatDate, formatUsd } from "@/lib/format";
import { InterestTierBadge } from "@/components/ui/InterestTierBadge";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatDelta } from "@/components/ui/StatDelta";
import { ReliabilityBars } from "@/components/sealed-ev/ReliabilityBars";
import { SalesHistoryChart } from "@/components/undervalued/SalesHistoryChart";
import { PriceHistoryPanel } from "@/components/catalog/PriceHistoryPanel";
import { DivergencePanel } from "@/components/catalog/DivergencePanel";
import { StockFlowBar } from "@/components/liquidity/StockFlowBar";
import { SourceBadge } from "@/components/ui/SourceBadge";

// ─────────────────────────────────────────────────────────────────────────────
// Corps de la fiche carte / "analyse totale" -- extrait de la page
// /catalog/[id] pour être partagé avec ItemDetailModal (popup verre ouverte
// depuis la grille de résultats du catalogue, cf. CatalogSearch), afin que
// cliquer une carte n'oblige plus à quitter la page de recherche (demande
// utilisateur, même logique que CardDetailModal/GradingRoiModal pour
// Undervalued/Grading ROI). Version client de la page (useTranslations au
// lieu de getTranslations) : PriceHistoryPanel/DivergencePanel se
// rechargent eux-mêmes depuis `itemId`, seul le reste (prix courants,
// undervalued/sealedEv/liquidity/grading ROI/ventes) est passé en props
// depuis l'appelant (page serveur ou /api/items/[id]/detail pour la modale).
// ─────────────────────────────────────────────────────────────────────────────

export interface GradingRoiBundle {
  candidate: GradingRoiCandidate;
  result: GradingRoiResult;
}

export function ItemDetailBody({
  item,
  sales,
  gradingRoi,
}: {
  item: ItemDetail;
  sales: SaleRow[];
  gradingRoi: GradingRoiBundle | null;
}) {
  const t = useTranslations("itemDetail");
  const tPrices = useTranslations("itemDetail.pricesTable");
  const tUndervalued = useTranslations("undervalued.modal");
  const tSealedEv = useTranslations("sealedEv.table");

  const orderedPrices = [...item.latestPrices].sort((a, b) => GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade));
  const availableGrades = orderedPrices.map((p) => p.grade);

  return (
    <div>
      {/* Header */}
      <div className="card-glass flex flex-col gap-5 rounded-2xl p-6 sm:flex-row">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- hôtes CDN externes (TCGPlayer/PriceCharting), cf. plan §5
          <img
            src={item.imageUrl}
            alt={item.name}
            className="h-48 w-36 flex-shrink-0 self-center rounded-xl object-contain shadow-sm sm:self-start"
            style={{ aspectRatio: "3/4", background: "var(--surface-alt)" }}
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
            <InterestTierBadge tier={item.interestTier} />
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
                      <td className="py-1.5 text-xs text-muted-foreground">
                        <SourceBadge source={p.source} />
                      </td>
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
        <Section title={t("undervaluedTitle")} link={{ href: "/undervalued", label: t("seeMethodology") }} sources={["pricecharting"]}>
          <UndervaluedBlock calc={item.undervalued} t={tUndervalued} />
        </Section>
      )}

      {/* Sealed EV ratio (tracked Booster Box only) */}
      {item.sealedEv && (
        <Section title={t("sealedEvTitle")} link={{ href: "/sealed-ev", label: t("seeMethodology") }} sources={["pricecharting"]}>
          <SealedEvBlock calc={item.sealedEv} t={tSealedEv} />
        </Section>
      )}

      {/* Liquidité : stock (annonces eBay actives) vs flux (ventes récentes) --
          scellé EN uniquement pour l'instant, et seulement si les deux
          signaux existent (cf. getItemById), pas de section vide affichée. */}
      {item.liquidity && (
        <Section title={t("liquidityTitle")} sources={["ebay", "pricecharting"]}>
          <LiquidityBlock calc={item.liquidity} t={t} />
        </Section>
      )}

      {/* Population PSA/CGC réelle : comptage par grade, pas un prix -- cf.
          [[project_population_analysis]]. N'existe jamais pour le scellé
          (PSA/CGC ne gradent pas de boîtes de TCG). */}
      {item.population && (
        <Section title={t("populationTitle")} link={{ href: "/population-analysis", label: t("seeMethodology") }} sources={["pricecharting"]}>
          <PopulationBlock calc={item.population} t={t} />
        </Section>
      )}

      {/* Grading ROI teaser (singles gradables uniquement) */}
      {gradingRoi && (
        <Section title={t("gradingRoiTitle")} link={{ href: `/grading-roi/${item.id}`, label: t("openCalculator") }} sources={["pricecharting"]}>
          <GradingRoiTeaser candidate={gradingRoi.candidate} result={gradingRoi.result} t={t} />
        </Section>
      )}

      {/* Volume/Price divergence signal */}
      <Section title={t("divergenceTitle")} link={{ href: "/divergence", label: t("seeMethodology") }} sources={["pricecharting"]}>
        <p className="mb-4 text-xs text-muted-foreground">{t("divergenceDescription")}</p>
        <DivergencePanel itemId={item.id} />
      </Section>

      {/* Sales history */}
      <Section title={t("salesHistoryTitle")} sources={["pricecharting"]}>
        {sales.length === 0 ? (
          <EmptyState title={tUndervalued("noSales")} />
        ) : (
          <SalesHistoryChart sales={sales} tcg={item.tcg} name={item.name} rarity={item.rarity} language={item.language} />
        )}
      </Section>
    </div>
  );
}

// ── Section wrapper ─────────────────────────────────────────────────────────
// La ligne "Source : X, Y" est réimplémentée ici plutôt que via
// SourceBadges (components/ui/SourceBadge) : ce composant-là est un Server
// Component async (getTranslations), et un Client Component (ce fichier) ne
// peut pas en rendre un directement -- SourceBadge (singulier) reste lui
// client-safe.
function Section({
  title,
  link,
  sources,
  children,
}: {
  title: string;
  link?: { href: string; label: string };
  sources?: string[];
  children: React.ReactNode;
}) {
  const tCommon = useTranslations("common");
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
      {sources && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{tCommon("sourceLabel")}</span>
          {sources.map((s) => (
            <SourceBadge key={s} source={s} />
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Undervalued calculation breakdown -- même contenu que CardDetailModal ──────
function UndervaluedBlock({ calc, t }: { calc: UndervaluedCalc; t: ReturnType<typeof useTranslations> }) {
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
  t: ReturnType<typeof useTranslations>;
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
function SealedEvBlock({ calc, t }: { calc: SealedEvCalc; t: ReturnType<typeof useTranslations> }) {
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
function LiquidityBlock({ calc, t }: { calc: LiquidityCalc; t: ReturnType<typeof useTranslations> }) {
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
      <StockFlowBar listingCount={calc.listingCount} salesCount30d={calc.salesCount30d} />
    </div>
  );
}

// ── Population PSA/CGC : comptage par grade (pas un prix) ──────────────────
function PopulationBlock({ calc, t }: { calc: PopulationCalc; t: ReturnType<typeof useTranslations> }) {
  const stats: { label: string; value: string }[] = [
    { label: t("populationGrade6"), value: calc.popGrade6.toLocaleString() },
    { label: t("populationGrade7"), value: calc.popGrade7.toLocaleString() },
    { label: t("populationGrade8"), value: calc.popGrade8.toLocaleString() },
    { label: t("populationGrade9"), value: calc.popGrade9.toLocaleString() },
    { label: t("populationGrade10"), value: calc.popGrade10.toLocaleString() },
  ];

  return (
    <div>
      <p className="mb-4 text-xs text-muted-foreground">{t("populationDescription")}</p>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
            <p className="text-sm font-semibold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
        <span className="text-xs text-muted-foreground">{t("populationTotal")}</span>
        <span className="text-base font-bold tabular-nums">{calc.popTotal.toLocaleString()}</span>
      </div>
    </div>
  );
}
