// Port fidèle de design-system/components/market/LiquidityMeter.jsx (handoff
// CardQuant, cf. mémoire projet "cardquant-rebrand").
export interface LiquidityMeterProps {
  value?: number;
  steps?: number;
  label?: string;
  showValue?: boolean;
}

export function LiquidityMeter({ value = 62, steps = 12, label = "Liquidity", showValue = true }: LiquidityMeterProps) {
  const on = Math.round((value / 100) * steps);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", gap: 2, flex: 1 }}>
          {Array.from({ length: steps }).map((_, i) => (
            <span
              key={i}
              style={{
                flex: 1,
                height: 14,
                borderRadius: 1,
                background: i < on ? (i > steps * 0.66 ? "var(--green-400)" : "var(--ink-000)") : "var(--grey-200)",
                transition: "background var(--dur-base) var(--ease-out)",
              }}
            />
          ))}
        </div>
        {showValue ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-strong)" }}>{value}</span> : null}
      </div>
      {label ? (
        <span style={{ fontSize: "var(--type-micro-size)", color: "var(--text-muted)", letterSpacing: "var(--type-micro-track)", textTransform: "uppercase" }}>
          {label}
        </span>
      ) : null}
    </div>
  );
}
