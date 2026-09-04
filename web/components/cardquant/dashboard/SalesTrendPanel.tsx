import type { MonthlySalesPoint } from "@/lib/types";

// "Ventes eBay · 12 mois" du Dashboard CardQuant (cf. mémoire projet
// "cardquant-rebrand"). `points` vient de
// lib/queries/dashboardOverview.ts::getMonthlyEbaySales -- Server Component
// pur, pas de tooltip au survol pour ce premier passage (pas d'interactivité
// dans le prototype d'origine non plus au-delà du survol natif du path).
export function SalesTrendPanel({ points }: { points: MonthlySalesPoint[] }) {
  const months = buildLastNMonths(12);
  const pokemon = months.map((m) => points.find((p) => p.tcg === "pokemon" && p.month === m)?.salesCount ?? 0);
  const onePiece = months.map((m) => points.find((p) => p.tcg === "one-piece" && p.month === m)?.salesCount ?? 0);
  const max = Math.max(1, ...pokemon, ...onePiece);

  const toPolyline = (series: number[]) =>
    series.map((v, i) => `${(i / (series.length - 1)) * 100},${100 - (v / max) * 100}`).join(" ");

  const yTicks = [1, 0.75, 0.5, 0.25].map((f) => Math.round(max * f));

  const last = pokemon.length - 1;
  const pkmLastMonth = pokemon[last] ?? 0;
  const pkmPrevMonth = pokemon[last - 1] ?? 0;
  const opLastMonth = onePiece[last] ?? 0;
  const opPrevMonth = onePiece[last - 1] ?? 0;
  const pkmDeltaPct = pkmPrevMonth > 0 ? ((pkmLastMonth - pkmPrevMonth) / pkmPrevMonth) * 100 : null;
  const opDeltaPct = opPrevMonth > 0 ? ((opLastMonth - opPrevMonth) / opPrevMonth) * 100 : null;

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 150, fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          Ventes eBay · 12 mois
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 12, height: 2, background: "var(--green-400)" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-body)" }}>Pokémon</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 12, height: 2, background: "var(--text-strong)" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-body)" }}>One Piece</span>
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 190, display: "flex", gap: 8 }}>
        <div style={{ flex: "0 0 30px", display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "flex-end", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
          {yTicks.map((t, i) => (
            <span key={i} style={{ lineHeight: 1 }}>{formatCompact(t)}</span>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <line x1="0" y1="0.5" x2="100" y2="0.5" stroke="var(--border-hairline)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <line x1="0" y1="33.3" x2="100" y2="33.3" stroke="var(--border-hairline)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <line x1="0" y1="66.7" x2="100" y2="66.7" stroke="var(--border-hairline)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <line x1="0" y1="99.5" x2="100" y2="99.5" stroke="var(--border-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <polyline points={toPolyline(pokemon)} fill="none" stroke="var(--green-400)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <polyline points={toPolyline(onePiece)} fill="none" stroke="var(--text-strong)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: 38 }}>
        {months.map((m) => (
          <span key={m} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{formatMonthLabel(m)}</span>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <SummaryBox label="POKÉMON · MOIS EN COURS" count={pkmLastMonth} deltaPct={pkmDeltaPct} />
        <SummaryBox label="ONE PIECE · MOIS EN COURS" count={opLastMonth} deltaPct={opDeltaPct} />
      </div>
    </section>
  );
}

function SummaryBox({ label, count, deltaPct }: { label: string; count: number; deltaPct: number | null }) {
  return (
    <div style={{ flex: "1 1 140px", display: "flex", flexDirection: "column", gap: 3, padding: "8px 10px", border: "1px solid var(--border-hairline)", borderRadius: 8 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-strong)" }}>
        {count} ventes{" "}
        {deltaPct != null ? (
          <span style={{ color: deltaPct >= 0 ? "var(--up-600)" : "var(--down-500)" }}>
            {deltaPct >= 0 ? "+" : ""}
            {deltaPct.toFixed(1).replace(".", ",")}%
          </span>
        ) : null}
      </span>
    </div>
  );
}

function buildLastNMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(new Date(y, m - 1, 1)).replace(".", "");
}

function formatCompact(n: number): string {
  if (n >= 1000) return `${Math.round(n / 100) / 10}k`;
  return String(n);
}
