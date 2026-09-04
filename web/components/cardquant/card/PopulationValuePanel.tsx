import type { ItemPriceEntry, PopulationCalc } from "@/lib/types";

// "Population et valeur par note" de la Fiche carte CardQuant (cf. mémoire
// projet "cardquant-rebrand"). population_snapshots ne distingue que
// pop_grade6/7/8/9/10 (cf. db/schema.sql) -- pas de colonne psa9.5 séparée,
// donc pas de colonne 9.5 ici (contrairement au mockup qui en montrait une) :
// on ne fabrique pas un chiffre de population qui n'existe pas en base.
// "Brut" reste une colonne de référence de prix, sans barre de population
// (même logique que le mockup : "Brut sert de référence d'achat et n'entre
// pas dans la POP").
const GRADE_KEYS = ["psa7", "psa8", "psa9", "psa10"] as const;
const POP_KEYS: Record<(typeof GRADE_KEYS)[number], keyof PopulationCalc> = {
  psa7: "popGrade7",
  psa8: "popGrade8",
  psa9: "popGrade9",
  psa10: "popGrade10",
};

export function PopulationValuePanel({
  population,
  latestPrices,
  ungradedPrice,
}: {
  population: PopulationCalc | null;
  latestPrices: ItemPriceEntry[];
  ungradedPrice: number | null;
}) {
  const priceByGrade = new Map(latestPrices.map((p) => [p.grade, p.price]));

  if (!population && ungradedPrice == null) {
    return (
      <section style={{ flex: "3 1 380px", minWidth: 0, background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "12px 16px 10px", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 180 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Pas de données de population ou de prix gradé pour cette carte.</span>
      </section>
    );
  }

  const columns = [
    { label: "Brut", pop: null as number | null, price: ungradedPrice },
    ...GRADE_KEYS.map((g) => ({
      label: g === "psa10" ? "PSA 10" : `PSA ${g.replace("psa", "")}`,
      pop: population ? (population[POP_KEYS[g]] as number) : null,
      price: priceByGrade.get(g) ?? null,
    })),
  ];

  const maxPop = Math.max(1, ...columns.map((c) => c.pop ?? 0));
  const maxPrice = Math.max(1, ...columns.map((c) => c.price ?? 0));
  const gradedTotal = population?.popTotal ?? 0;

  return (
    <section style={{ flex: "3 1 380px", minWidth: 0, background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "12px 16px 10px", display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, rowGap: 6, flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 220, fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Population et valeur par note</span>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--grey-400)" }} />
          <span style={{ fontSize: 11.5, color: "var(--text-body)" }}>Population PSA</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--green-400)" }} />
          <span style={{ fontSize: 11.5, color: "var(--text-body)" }}>Dernier prix</span>
        </div>
        {population ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-muted)" }}>POP {gradedTotal.toLocaleString("fr-FR")}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 170, display: "flex", alignItems: "stretch", gap: 5 }}>
        {columns.map((c) => (
          <div key={c.label} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "stretch", gap: 4 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-muted)", textAlign: "center", whiteSpace: "nowrap" }}>
              {c.pop != null ? c.pop.toLocaleString("fr-FR") : "—"}
            </span>
            <div style={{ flex: 1, minHeight: 0, position: "relative", background: "var(--grey-050)", borderRadius: "3px 3px 0 0" }}>
              {c.pop != null ? (
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${(c.pop / maxPop) * 100}%`, background: "var(--grey-400)", borderRadius: "3px 3px 0 0" }} />
              ) : null}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "3px 0", background: "var(--grey-100)", borderRadius: 4 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-strong)" }}>{c.label}</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, position: "relative", background: "var(--grey-050)", borderRadius: "0 0 3px 3px" }}>
              {c.price != null ? (
                <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: `${(c.price / maxPrice) * 100}%`, background: "var(--green-400)", borderRadius: "0 0 3px 3px" }} />
              ) : null}
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-muted)", textAlign: "center", whiteSpace: "nowrap" }}>
              {c.price != null ? `$${c.price.toFixed(0)}` : "—"}
            </span>
          </div>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45, color: "var(--text-muted)" }}>
        Au-dessus de l&apos;axe : la population PSA connue par note. En dessous : le dernier prix connu de la même note. « Brut » sert de référence d&apos;achat et n&apos;entre pas dans la POP.
      </p>
    </section>
  );
}
