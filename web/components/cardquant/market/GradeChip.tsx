// Port fidèle de design-system/components/market/GradeChip.jsx (handoff
// CardQuant, cf. mémoire projet "cardquant-rebrand").
const GRADERS: Record<string, string> = {
  PSA: "var(--grade-psa)",
  CGC: "var(--grade-cgc)",
  RAW: "var(--grade-raw)",
  BGS: "var(--ink-600)",
};

export interface GradeChipProps {
  grader?: string;
  grade?: string | number;
  size?: "sm" | "md";
}

export function GradeChip({ grader = "PSA", grade = 10, size = "md" }: GradeChipProps) {
  const c = GRADERS[grader] ?? "var(--ink-600)";
  const h = size === "sm" ? 18 : 22;
  return (
    <span style={{ display: "inline-flex", alignItems: "stretch", height: h, borderRadius: "var(--radius-xs)", overflow: "hidden", border: `1px solid ${c}` }}>
      <span
        style={{
          display: "grid", placeItems: "center", padding: "0 5px", background: c, color: "var(--white)",
          fontFamily: "var(--font-mono)", fontSize: size === "sm" ? 9.5 : 10.5, fontWeight: 600, letterSpacing: "0.06em",
        }}
      >
        {grader}
      </span>
      <span
        style={{
          display: "grid", placeItems: "center", padding: "0 6px", background: "var(--white)", color: "var(--text-strong)",
          fontFamily: "var(--font-mono)", fontSize: size === "sm" ? 10.5 : 12, fontWeight: 600,
        }}
      >
        {grade}
      </span>
    </span>
  );
}
