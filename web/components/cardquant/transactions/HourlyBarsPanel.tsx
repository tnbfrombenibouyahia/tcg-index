import type { HourlyVolume } from "@/lib/queries/transactionsOverview";
import { BarSeries } from "../data/BarSeries";

// "Volume par heure" / "Valeur échangée par heure" de l'écran Transactions
// CardQuant (cf. mémoire projet "cardquant-rebrand") --
// lib/queries/transactionsOverview.ts::getHourlyVolume. Important : `sales`
// n'a qu'une DATE de vente, pas d'heure (cf. db/schema.sql) -- ce graphique
// bucket donc par heure d'INGESTION (created_at), pas par heure réelle de
// vente sur le marché. Légende explicite plutôt qu'un sous-titre qui
// laisserait croire à une vraie tape seconde par seconde.
export function HourlyBarsPanel({ hours }: { hours: HourlyVolume[] }) {
  const buckets = buildLastNHours(24);
  const counts = buckets.map((h) => hours.find((x) => x.hour === h)?.count ?? 0);
  const values = buckets.map((h) => hours.find((x) => x.hour === h)?.value ?? 0);
  const axis = [buckets[0].slice(-2) + "h", buckets[buckets.length - 1].slice(-2) + "h"];

  const countNow = counts[counts.length - 1];
  const countPrev = counts[counts.length - 2] ?? 0;
  const countDeltaPct = countPrev > 0 ? ((countNow - countPrev) / countPrev) * 100 : null;
  const totalValue = values.reduce((a, b) => a + b, 0);

  return (
    <>
      <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Ventes ingérées par heure · 24h</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: countDeltaPct == null ? "var(--text-muted)" : countDeltaPct >= 0 ? "var(--up-400)" : "var(--down-500)" }}>
            {countDeltaPct != null ? `${countDeltaPct >= 0 ? "+" : ""}${countDeltaPct.toFixed(0)}% vs heure précédente` : "pas assez d'historique"}
          </span>
        </div>
        <div style={{ flex: 1, minHeight: 0, width: "100%" }}>
          <BarSeries data={counts} height={104} axis={axis} />
        </div>
      </section>
      <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Valeur ingérée par heure · 24h</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>${Math.round(totalValue).toLocaleString("fr-FR")} sur 24h</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, width: "100%" }}>
          <BarSeries data={values} height={104} axis={axis} />
        </div>
      </section>
    </>
  );
}

function buildLastNHours(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  now.setMinutes(0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(d.getHours() - i);
    const pad = (v: number) => String(v).padStart(2, "0");
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}`);
  }
  return out;
}
