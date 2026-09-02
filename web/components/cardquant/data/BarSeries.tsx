// Port fidèle de design-system/components/data/BarSeries.jsx (handoff
// CardQuant, cf. mémoire projet "cardquant-rebrand").
export interface BarSeriesProps {
  data?: number[];
  height?: number;
  highlight?: number;
  axis?: string[] | null;
  line?: boolean;
}

export function BarSeries({ data = [], height = 74, highlight, axis = ["Jun", "Jul"], line = true }: BarSeriesProps) {
  const max = Math.max(...data, 1);
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * 100},${100 - (d / max) * 80}`).join(" ");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ position: "relative", height }}>
        {line ? (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <polyline points={pts} fill="none" stroke="var(--ink-000)" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : null}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: 1 }}>
          {data.map((d, i) => (
            <span
              key={i}
              style={{
                flex: 1,
                height: `${(d / max) * 100}%`,
                minHeight: 1,
                background: i === highlight ? "var(--green-400)" : i > data.length * 0.62 ? "var(--grey-300)" : "var(--ink-700)",
                opacity: i > data.length * 0.62 ? 0.55 : 1,
              }}
            />
          ))}
        </div>
      </div>
      {axis ? (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--type-micro-size)", color: "var(--text-muted)" }}>
          {axis.map((a) => (
            <span key={a}>{a}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
