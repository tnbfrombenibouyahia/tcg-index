import { Icon } from "../core/Icon";

// Port fidèle de design-system/components/data/Delta.jsx (handoff CardQuant,
// cf. mémoire projet "cardquant-rebrand").
export interface DeltaProps {
  value?: number;
  suffix?: string;
  size?: number;
  showIcon?: boolean;
}

export function Delta({ value = 0, suffix = "%", size = 12, showIcon = true }: DeltaProps) {
  const up = value >= 0;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: size,
        fontFamily: "var(--font-mono)",
        fontWeight: 500,
        color: up ? "var(--up-600)" : "var(--down-500)",
      }}
    >
      {showIcon ? <Icon name={up ? "trending-up" : "trending-down"} size={size} /> : null}
      {up ? "+" : ""}
      {value}
      {suffix}
    </span>
  );
}
