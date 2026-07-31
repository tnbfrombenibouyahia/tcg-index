import { StatDelta } from "@/components/ui/StatDelta";
import { formatDate, formatUsd } from "@/lib/format";
import type { IndexSummary, VolumePoint } from "@/lib/types";
import { VolumeBarChart } from "./VolumeBarChart";

// `volume` est trié ASC par captured_at (cf. getAllIndices) -- les deux
// derniers éléments sont donc le dernier jour de scraping de ventes et
// celui d'avant (pas forcément "hier" : le cron ventes tourne 3x/semaine,
// cf. mémoire projet "sales_volume_tracking", contrairement au prix qui est
// quotidien -- d'où la date affichée à côté du nombre plutôt qu'un "aujourd'hui" fixe).
function latestTwo(volume: VolumePoint[]) {
  return {
    latest: volume[volume.length - 1] ?? null,
    previous: volume[volume.length - 2] ?? null,
  };
}

function DailyExchangeTile({ summary }: { summary: IndexSummary }) {
  const { latest, previous } = latestTwo(summary.volume);

  const changePct =
    latest && previous && previous.salesCount !== 0
      ? ((latest.salesCount - previous.salesCount) / previous.salesCount) * 100
      : null;

  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: "20px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 8px 32px rgba(0,0,0,0.06)",
        border: "1px solid rgba(26,26,26,0.06)",
        padding: "24px 28px 28px",
      }}
    >
      <h3
        className="text-xs font-semibold uppercase"
        style={{ color: "var(--foreground-muted)", letterSpacing: "0.10em" }}
      >
        {summary.label}
      </h3>

      <div className="mt-2 flex items-baseline gap-2">
        <span
          className="text-2xl font-bold tracking-tight tabular-nums"
          style={{ color: "var(--foreground)", letterSpacing: "-0.02em" }}
        >
          {latest ? latest.salesCount.toLocaleString("fr-FR") : "—"}
        </span>
        <span className="text-xs font-medium" style={{ color: "var(--foreground-muted)" }}>
          ventes
        </span>
        {latest && <StatDelta changePct={changePct} />}
      </div>

      <p className="mt-1 text-xs" style={{ color: "var(--foreground-subtle)" }}>
        {latest
          ? `${formatUsd(latest.salesValue)} échangés · ${formatDate(latest.capturedAt)}`
          : "Pas encore de données"}
      </p>

      <div style={{ marginTop: "16px" }}>
        <VolumeBarChart volume={summary.volume} />
      </div>
    </div>
  );
}

export function DailyExchangeSection({ indices }: { indices: IndexSummary[] }) {
  if (indices.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Échanges du marché
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {indices.map((summary) => (
          <DailyExchangeTile key={summary.code} summary={summary} />
        ))}
      </div>
    </section>
  );
}
