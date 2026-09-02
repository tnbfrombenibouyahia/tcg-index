// Port fidèle de design-system/components/data/GaugeArc.jsx (handoff
// CardQuant, cf. mémoire projet "cardquant-rebrand").
export interface GaugeArcProps {
  value?: number;
  unit?: string;
  size?: number;
  thickness?: number;
  label?: string;
}

export function GaugeArc({ value = 71.74, unit = "%", size = 150, thickness = 7, label }: GaugeArcProps) {
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const len = Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size * 0.62 }}>
      <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62}`}>
        <path
          d={`M ${thickness / 2} ${size * 0.55} A ${r} ${r} 0 0 1 ${size - thickness / 2} ${size * 0.55}`}
          fill="none"
          stroke="var(--grey-200)"
          strokeWidth={thickness}
          strokeLinecap="round"
        />
        <path
          d={`M ${thickness / 2} ${size * 0.55} A ${r} ${r} 0 0 1 ${size - thickness / 2} ${size * 0.55}`}
          fill="none"
          stroke="var(--ink-000)"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${len * pct} ${len}`}
          style={{ transition: "stroke-dasharray var(--dur-slow) var(--ease-out)" }}
        />
        <circle
          cx={cx + Math.cos(Math.PI * (1 - pct)) * r}
          cy={size * 0.55 - Math.sin(Math.PI * (1 - pct)) * r}
          r={thickness * 0.62}
          fill="var(--green-400)"
        />
      </svg>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, textAlign: "center" }}>
        <span style={{ fontSize: 26, letterSpacing: "-0.01em", color: "var(--text-strong)", fontVariantNumeric: "tabular-nums" }}>
          {String(value).replace(".", ",")}
        </span>
        <span style={{ fontSize: 11, verticalAlign: "top" }}>{unit}</span>
        {label ? <div style={{ fontSize: "var(--type-micro-size)", color: "var(--text-muted)" }}>{label}</div> : null}
      </div>
    </div>
  );
}
