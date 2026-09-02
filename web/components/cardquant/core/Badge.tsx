import { Icon } from "./Icon";

// Port fidèle de design-system/components/core/Badge.jsx (handoff CardQuant,
// cf. mémoire projet "cardquant-rebrand").
const TONES = {
  neutral: { background: "var(--grey-100)", color: "var(--text-body)", border: "transparent" },
  strong: { background: "var(--ink-000)", color: "var(--white)", border: "var(--ink-000)" },
  accent: { background: "var(--green-300)", color: "var(--ink-000)", border: "transparent" },
  up: { background: "rgba(33,201,78,.14)", color: "var(--up-600)", border: "transparent" },
  down: { background: "rgba(248,14,53,.12)", color: "var(--down-700)", border: "transparent" },
  warn: { background: "rgba(238,223,16,.28)", color: "#6B6000", border: "transparent" },
  outline: { background: "transparent", color: "var(--text-body)", border: "var(--border-strong)" },
} as const;

export interface BadgeProps {
  children: React.ReactNode;
  tone?: keyof typeof TONES;
  icon?: string;
  mono?: boolean;
  style?: React.CSSProperties;
}

export function Badge({ children, tone = "neutral", icon, mono, style }: BadgeProps) {
  const t = TONES[tone] ?? TONES.neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 20,
        padding: "0 8px",
        borderRadius: "var(--radius-pill)",
        background: t.background,
        color: t.color,
        border: `1px solid ${t.border}`,
        fontFamily: mono ? "var(--font-mono)" : "var(--font-core)",
        fontSize: "var(--type-micro-size)",
        fontWeight: "var(--weight-medium)",
        letterSpacing: "var(--type-micro-track)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {icon ? <Icon name={icon} size={11} /> : null}
      {children}
    </span>
  );
}
