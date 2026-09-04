// Port fidèle de design-system/components/data/SegmentBar.jsx (handoff
// CardQuant, cf. mémoire projet "cardquant-rebrand").
export interface SegmentBarSegment {
  value: number;
  color: string;
}

export interface SegmentBarProps {
  segments?: SegmentBarSegment[];
  hatchFrom?: number | null;
  height?: number;
  radius?: string;
}

export function SegmentBar({
  segments = [
    { value: 20, color: "var(--ink-000)" },
    { value: 12, color: "var(--green-400)" },
  ],
  hatchFrom = 60,
  height = 9,
  radius = "var(--radius-pill)",
}: SegmentBarProps) {
  const total = 100;
  return (
    <div
      style={{
        position: "relative",
        height,
        borderRadius: radius,
        background: "var(--grey-200)",
        boxShadow: "var(--shadow-inset-track)",
        overflow: "hidden",
        display: "flex",
      }}
    >
      {segments.map((s, i) => (
        <span key={i} style={{ width: `${(s.value / total) * 100}%`, background: s.color, transition: "width var(--dur-slow) var(--ease-out)" }} />
      ))}
      {hatchFrom != null ? (
        <span
          style={{
            position: "absolute",
            inset: 0,
            left: `${hatchFrom}%`,
            backgroundImage: "var(--hatch)",
            backgroundSize: "3px 100%",
            opacity: 0.9,
          }}
        />
      ) : null}
    </div>
  );
}
