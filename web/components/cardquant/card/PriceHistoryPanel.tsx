import type { PriceHistoryPoint } from "@/lib/queries/itemDetail";

// "Historique du prix" de la Fiche carte CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- une ligne par grade avec un historique réel
// (lib/queries/itemDetail.ts::getItemPriceHistory, appelé une fois par
// grade côté page.tsx). Échelle log sur l'axe des prix comme dans le mockup
// -- les prix brut/psa10 d'une même carte peuvent être séparés d'un facteur
// 10-50, une échelle linéaire écraserait les grades bas.
export interface PriceSeries {
  grade: string;
  label: string;
  color: string;
  points: PriceHistoryPoint[];
}

export function PriceHistoryPanel({ series }: { series: PriceSeries[] }) {
  const withData = series.filter((s) => s.points.length > 0);

  if (withData.length === 0) {
    return (
      <section style={{ flex: "2.2 1 360px", background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "12px 16px 10px", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Pas d&apos;historique de prix disponible pour cette carte.</span>
      </section>
    );
  }

  const allDates = withData.flatMap((s) => s.points.map((p) => new Date(p.capturedAt).getTime()));
  const allPrices = withData.flatMap((s) => s.points.map((p) => p.price)).filter((p) => p > 0);
  const minDate = Math.min(...allDates);
  const maxDate = Math.max(...allDates);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const logMin = Math.log(Math.max(minPrice, 0.01));
  const logMax = Math.log(Math.max(maxPrice, minPrice * 1.01));
  const dateSpan = Math.max(1, maxDate - minDate);

  const toX = (t: number) => ((t - minDate) / dateSpan) * 640;
  const toY = (price: number) => 240 - ((Math.log(Math.max(price, 0.01)) - logMin) / Math.max(0.001, logMax - logMin)) * 232 - 4;

  const ticks = [maxPrice, Math.exp((logMax + logMin) / 2), minPrice];

  const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" });
  const monthTicks = Array.from({ length: 6 }, (_, i) => new Date(minDate + (dateSpan * i) / 5));

  return (
    <section style={{ flex: "2.2 1 360px", background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "12px 16px 10px", display: "flex", flexDirection: "column", gap: 10, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, rowGap: 6, flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 170, fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Historique du prix</span>
        {withData.map((s) => (
          <div key={s.grade} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 15, height: 0, borderTop: `2px solid ${s.color}` }} />
            <span style={{ fontSize: 11, color: "var(--text-body)" }}>{s.label}</span>
          </div>
        ))}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-muted)" }}>Échelle log · agrégé</span>
      </div>
      <div style={{ flex: 1, minHeight: 150, display: "grid", gridTemplateColumns: "48px minmax(0, 1fr)", gridTemplateRows: "minmax(0, 1fr) auto", columnGap: 8 }}>
        <div style={{ position: "relative", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
          {ticks.map((v, i) => (
            <span key={i} style={{ position: "absolute", right: 0, top: `${(i / (ticks.length - 1)) * 100}%`, transform: "translateY(-50%)", whiteSpace: "nowrap" }}>
              ${v >= 100 ? Math.round(v) : v.toFixed(1)}
            </span>
          ))}
        </div>
        <div style={{ position: "relative", minWidth: 0, borderLeft: "1px solid var(--border-hairline)", borderBottom: "1px solid var(--border-strong)" }}>
          <svg viewBox="0 0 640 240" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}>
            {ticks.map((v, i) => (
              <line key={i} x1="0" y1={toY(v)} x2="640" y2={toY(v)} stroke="var(--viz-grid)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            {withData.map((s) => (
              <polyline
                key={s.grade}
                points={s.points.map((p) => `${toX(new Date(p.capturedAt).getTime())},${toY(p.price)}`).join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth={s.grade === "ungraded" ? 2 : 1.4}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        </div>
        <div />
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-muted)", paddingTop: 6 }}>
          {monthTicks.map((d, i) => (
            <span key={i}>{monthFmt.format(d)}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
