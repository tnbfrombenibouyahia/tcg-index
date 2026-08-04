"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  computeGradingRoi,
  DEFAULT_GRADING_ROI_ASSUMPTIONS,
  suggestServiceTier,
  type GradingRoiCandidate,
} from "@/lib/gradingRoi";
import { GRADE_LABELS, PSA_SERVICE_TIERS } from "@/lib/constants";
import { formatUsd } from "@/lib/format";
import { StatDelta } from "@/components/ui/StatDelta";

// ─────────────────────────────────────────────────────────────────────────────
// Corps interactif du calculateur ROI de gradation (demande utilisateur) --
// réutilisé tel quel dans la modale du classement (/grading-roi) et dans la
// page dédiée (/grading-roi/[id]). Tout le recalcul se fait client-side
// (computeGradingRoi est pur, cf. lib/gradingRoi.ts) : aucun aller-retour
// réseau à chaque ajustement de curseur, les ingrédients (prix + mix de
// grades) sont déjà dans `candidate`, fournis par le Server Component parent.
// ─────────────────────────────────────────────────────────────────────────────

const LOW_GRADE_RISK_MAX = 40;
const LOW_GRADE_VALUE_MIN = 50;
const LOW_GRADE_VALUE_MAX = 120;
const RESALE_FEE_MAX = 20;

export function GradingRoiCalculator({ candidate }: { candidate: GradingRoiCandidate }) {
  const t = useTranslations("gradingRoi.calculator");
  const tGrades = useTranslations("gradingRoi.calculator.distributionLevels");

  const [serviceTierId, setServiceTierId] = useState(() => suggestServiceTier(candidate));
  const [extraCostsUsd, setExtraCostsUsd] = useState(DEFAULT_GRADING_ROI_ASSUMPTIONS.extraCostsUsd);
  const [lowGradeProbabilityPct, setLowGradeProbabilityPct] = useState(
    DEFAULT_GRADING_ROI_ASSUMPTIONS.lowGradeProbabilityPct
  );
  const [lowGradeValueFactor, setLowGradeValueFactor] = useState(
    Math.round(DEFAULT_GRADING_ROI_ASSUMPTIONS.lowGradeValueFactor * 100)
  );
  const [resaleFeePct, setResaleFeePct] = useState(DEFAULT_GRADING_ROI_ASSUMPTIONS.resaleFeePct);

  const result = useMemo(
    () =>
      computeGradingRoi(candidate, {
        serviceTierId,
        extraCostsUsd,
        lowGradeProbabilityPct,
        lowGradeValueFactor: lowGradeValueFactor / 100,
        resaleFeePct,
      }),
    [candidate, serviceTierId, extraCostsUsd, lowGradeProbabilityPct, lowGradeValueFactor, resaleFeePct]
  );

  const selectedTier = PSA_SERVICE_TIERS.find((t) => t.id === serviceTierId) ?? PSA_SERVICE_TIERS[0];

  return (
    <div>
      {/* Résumé */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("expectedValueNet")} value={formatUsd(result.expectedValueNet)} />
        <Stat label={t("totalCost")} value={formatUsd(result.totalCost)} />
        <Stat label={t("netProfit")} value={formatUsd(result.netProfit)} accent={result.netProfit >= 0 ? "positive" : "negative"} />
        <div>
          <p className="text-[11px] text-muted-foreground">{t("roi")}</p>
          <StatDelta changePct={result.roiPct} />
        </div>
      </div>

      {/* Hypothèses */}
      <h3 className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("inputsTitle")}
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t("serviceTier")}</label>
          <select
            value={serviceTierId}
            onChange={(e) => setServiceTierId(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            {PSA_SERVICE_TIERS.map((tier) => (
              <option key={tier.id} value={tier.id}>
                {tier.label} — {formatUsd(tier.feeUsd)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("maxDeclaredValue", { value: formatUsd(selectedTier.maxDeclaredValue) })} ·{" "}
            {t("turnaround", { days: selectedTier.turnaroundBusinessDays })}
          </p>
        </div>

        <NumberField
          label={t("extraCosts")}
          value={extraCostsUsd}
          onChange={setExtraCostsUsd}
          min={0}
          step={5}
          prefix="$"
        />

        <SliderField
          label={t("lowGradeRisk")}
          note={t("lowGradeRiskNote")}
          value={lowGradeProbabilityPct}
          onChange={setLowGradeProbabilityPct}
          min={0}
          max={LOW_GRADE_RISK_MAX}
          suffix="%"
        />

        <SliderField
          label={t("lowGradeValue")}
          value={lowGradeValueFactor}
          onChange={setLowGradeValueFactor}
          min={LOW_GRADE_VALUE_MIN}
          max={LOW_GRADE_VALUE_MAX}
          suffix="%"
        />

        <SliderField
          label={t("resaleFee")}
          note={t("resaleFeeNote")}
          value={resaleFeePct}
          onChange={setResaleFeePct}
          min={0}
          max={RESALE_FEE_MAX}
          suffix="%"
        />
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">{t("serviceTierNote")}</p>

      {/* Détail EV */}
      <h3 className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("breakdownTitle")}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-muted-foreground">
              <th className="pb-1 pr-4 font-medium">{t("breakdownGrade")}</th>
              <th className="pb-1 pr-4 font-medium">{t("breakdownPrice")}</th>
              <th className="pb-1 pr-4 font-medium">{t("breakdownProbability")}</th>
              <th className="pb-1 font-medium">{t("breakdownContribution")}</th>
            </tr>
          </thead>
          <tbody>
            {result.breakdown.map((b) => (
              <tr key={b.key} className="border-t border-border">
                <td className="py-1.5 pr-4 font-medium">{b.key === "lowGrade" ? t("lowGradeRow") : GRADE_LABELS[b.key]}</td>
                <td className="py-1.5 pr-4 tabular-nums">{formatUsd(b.price)}</td>
                <td className="py-1.5 pr-4 tabular-nums text-muted-foreground">{(b.probability * 100).toFixed(1)}%</td>
                <td className="py-1.5 tabular-nums font-medium">{formatUsd(b.contribution)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border font-semibold">
              <td className="py-1.5 pr-4" colSpan={3}>
                {t("expectedValueGross")}
              </td>
              <td className="py-1.5 tabular-nums">{formatUsd(result.expectedValueGross)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Provenance de la distribution */}
      <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2">
        <ConfidenceDot level={candidate.distributionSourceLevel} />
        <p className="text-[11px] text-muted-foreground">
          {t("distributionNote", {
            count: candidate.distributionSampleSize,
            level:
              candidate.distributionSourceLevel === "card"
                ? tGrades("card")
                : candidate.distributionSourceLevel === "setRarity"
                ? tGrades("setRarity")
                : candidate.distributionSourceLevel === "set"
                ? tGrades("set")
                : tGrades("tcg", { tcg: candidate.tcg }),
          })}
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Stat({ label, value, accent }: { label: string; value: string; accent?: "positive" | "negative" }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className="text-sm font-semibold tabular-nums"
        style={accent ? { color: accent === "positive" ? "var(--positive)" : "var(--negative)" } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  step,
  prefix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  step: number;
  prefix?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {prefix}
          </span>
        )}
        <input
          type="number"
          value={value}
          min={min}
          step={step}
          onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
          className={`w-full rounded-lg border border-border bg-surface py-2 text-sm ${prefix ? "pl-7 pr-3" : "px-3"}`}
        />
      </div>
    </div>
  );
}

function SliderField({
  label,
  note,
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  label: string;
  note?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs text-muted-foreground">{label}</label>
        <span className="text-xs font-semibold tabular-nums">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      {note && <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}

function ConfidenceDot({ level }: { level: "card" | "setRarity" | "set" | "tcg" }) {
  const color =
    level === "card" ? "var(--positive)" : level === "setRarity" ? "#a16207" : level === "set" ? "#a16207" : "var(--negative)";
  return (
    <span
      aria-hidden
      className="mt-1 h-2 w-2 flex-shrink-0 rounded-full"
      style={{ background: color }}
    />
  );
}
