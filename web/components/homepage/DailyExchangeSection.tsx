import { getLocale, getTranslations } from "next-intl/server";
import { StatDelta } from "@/components/ui/StatDelta";
import { VOLUME_STABILIZATION_DAYS } from "@/lib/constants";
import { daysAgoIso, formatDate, formatUsd } from "@/lib/format";
import type { IndexSummary, VolumePoint } from "@/lib/types";
import { VolumeBarChart } from "./VolumeBarChart";

// `volume` est trié ASC par captured_at (cf. getAllIndices). On ignore les
// VOLUME_STABILIZATION_DAYS derniers jours avant de prendre les deux plus
// récents restants : ces jours-là sont encore en cours de recensement (scan
// par paliers tournants, cf. lib/constants.ts), donc bruts ils font
// systématiquement croire à une chute du marché qui n'existe pas (constaté
// le 2026-08-03 -- 424 ventes affichées le jour même contre ~2300 la veille,
// remonté à des dizaines de milliers une fois les paliers repassés dessus).
function latestTwo(volume: VolumePoint[]) {
  const stableCutoff = daysAgoIso(VOLUME_STABILIZATION_DAYS);
  const stable = volume.filter((p) => p.capturedAt <= stableCutoff);
  return {
    latest: stable[stable.length - 1] ?? null,
    previous: stable[stable.length - 2] ?? null,
  };
}

async function DailyExchangeTile({ summary }: { summary: IndexSummary }) {
  const { latest, previous } = latestTwo(summary.volume);
  const t = await getTranslations("home");
  const tIndices = await getTranslations("indices");
  const locale = await getLocale();

  const changePct =
    latest && previous && previous.salesCount !== 0
      ? ((latest.salesCount - previous.salesCount) / previous.salesCount) * 100
      : null;

  return (
    <div
      style={{
        background: "var(--surface-solid)",
        borderRadius: "20px",
        boxShadow: "var(--shadow-card)",
        border: "1px solid var(--border-soft)",
        padding: "24px 28px 28px",
      }}
    >
      <h3
        className="text-xs font-semibold uppercase"
        style={{ color: "var(--foreground-muted)", letterSpacing: "0.10em" }}
      >
        {tIndices(summary.code)}
      </h3>

      <div className="mt-2 flex items-baseline gap-2">
        <span
          className="text-2xl font-bold tracking-tight tabular-nums"
          style={{ color: "var(--foreground)", letterSpacing: "-0.02em" }}
        >
          {latest ? latest.salesCount.toLocaleString(locale) : "—"}
        </span>
        <span className="text-xs font-medium" style={{ color: "var(--foreground-muted)" }}>
          {t("salesUnit")}
        </span>
        {latest && <StatDelta changePct={changePct} />}
      </div>

      <p className="mt-1 text-xs" style={{ color: "var(--foreground-subtle)" }}>
        {latest
          ? t("exchangedOn", { price: formatUsd(latest.salesValue), date: formatDate(latest.capturedAt, locale) })
          : t("noDataYet")}
      </p>

      <div style={{ marginTop: "16px" }}>
        <VolumeBarChart volume={summary.volume} />
      </div>
    </div>
  );
}

export async function DailyExchangeSection({ indices }: { indices: IndexSummary[] }) {
  if (indices.length === 0) return null;
  const t = await getTranslations("home");

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t("marketExchanges")}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {indices.map((summary) => (
          <DailyExchangeTile key={summary.code} summary={summary} />
        ))}
      </div>
    </section>
  );
}
