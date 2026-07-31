// Barres façon signal téléphone : 1 barre rouge (peu fiable) -> 4 barres
// vertes (fiable). Score 0-100 calculé dans index/sealed_ev.py (médiane des
// 3 dernières ventes + dispersion + fraîcheur + volume de ventes trouvées).
const BAR_HEIGHTS = [5, 8, 11, 14];

function levelFor(score: number): { bars: number; color: string; label: string } {
  if (score < 25) return { bars: 1, color: "#dc2626", label: "Peu fiable" };
  if (score < 50) return { bars: 2, color: "#f97316", label: "Faible" };
  if (score < 75) return { bars: 3, color: "#eab308", label: "Correct" };
  return { bars: 4, color: "#15803d", label: "Fiable" };
}

export function ReliabilityBars({
  score,
  salesUsed,
}: {
  score: number | null;
  salesUsed: number;
}) {
  if (score === null) {
    return (
      <span className="text-xs" style={{ color: "var(--foreground-subtle)" }} title="Aucune vente individuelle trouvée -- agrégat PriceCharting non recoupé">
        Non recoupé
      </span>
    );
  }

  const level = levelFor(score);

  return (
    <div
      className="flex items-center gap-1.5"
      title={`Fiabilité ${score}/100 (${salesUsed} vente${salesUsed > 1 ? "s" : ""} utilisée${salesUsed > 1 ? "s" : ""})`}
    >
      <div className="flex items-end gap-0.5">
        {BAR_HEIGHTS.map((h, i) => (
          <div
            key={i}
            style={{
              width: 3,
              height: h,
              borderRadius: 1,
              background: i < level.bars ? level.color : "rgba(26,26,26,0.12)",
            }}
          />
        ))}
      </div>
      <span className="text-xs" style={{ color: "var(--foreground-muted)" }}>
        {level.label}
      </span>
    </div>
  );
}
