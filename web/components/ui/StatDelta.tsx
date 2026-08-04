import { formatPct } from "@/lib/format";

export function StatDelta({ changePct }: { changePct: number | null }) {
  if (changePct === null) {
    return (
      <span
        className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
        style={{
          background: "var(--tint-neutral)",
          color: "var(--foreground-muted)",
        }}
      >
        New
      </span>
    );
  }

  const positive = changePct >= 0;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        background: positive
          ? "rgba(21, 128, 61, 0.08)"
          : "rgba(220, 38, 38, 0.08)",
        color: positive ? "var(--positive)" : "var(--negative)",
      }}
    >
      {/* SVG arrow — plus élégant que les caractères unicode ▲▼ */}
      {positive ? (
        <svg
          width="9"
          height="9"
          viewBox="0 0 10 10"
          fill="currentColor"
          aria-hidden
        >
          <path d="M5 1.5l4 7H1l4-7z" />
        </svg>
      ) : (
        <svg
          width="9"
          height="9"
          viewBox="0 0 10 10"
          fill="currentColor"
          aria-hidden
        >
          <path d="M5 8.5L1 1.5h8L5 8.5z" />
        </svg>
      )}
      {formatPct(changePct)}
    </span>
  );
}
