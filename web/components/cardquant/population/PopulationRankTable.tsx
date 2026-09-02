import Link from "next/link";
import type { PopulationRow } from "@/lib/types";
import type { Tcg } from "@/lib/constants";
import type { PopulationSort } from "@/lib/queries/populationAnalysis";

function buildHref(base: URLSearchParams, overrides: Record<string, string | undefined>): string {
  const params = new URLSearchParams(base);
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) params.delete(k);
    else params.set(k, v);
  }
  if (!("page" in overrides)) params.delete("page");
  const qs = params.toString();
  return `/population-analysis${qs ? `?${qs}` : ""}`;
}

function TabLink({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{ appearance: "none", border: 0, font: "inherit", padding: "4px 11px", borderRadius: 999, background: active ? "var(--ink-000)" : "transparent", color: active ? "var(--white)" : "var(--text-body)", fontSize: 11, whiteSpace: "nowrap" }}
    >
      {children}
    </Link>
  );
}

// "POP et prix par note" de l'écran Population PSA CardQuant (cf. mémoire
// projet "cardquant-rebrand") -- lib/queries/populationAnalysis.ts
// ::getPopulationRanking, déjà en prod sur /population-analysis, réel.
// Le filtre langue (`?lang=`) n'existe pas côté requête -- appliqué en JS sur
// les lignes déjà chargées (cf. page.tsx) plutôt qu'un nouveau paramètre SQL,
// même principe que le hardCap déjà en mémoire côté getPopulationRanking.
// Seules Pop/PSA10 sont triables (les seules colonnes couvertes par
// PopulationSort, cf. son type) -- PSA9/PSA8/Brut restent des en-têtes fixes.
export function PopulationRankTable({
  rows,
  totalCount,
  tcg,
  lang,
  sort,
  searchParams,
}: {
  rows: PopulationRow[];
  totalCount: number;
  tcg?: Tcg;
  lang?: string;
  sort?: PopulationSort;
  searchParams: URLSearchParams;
}) {
  const popSort = sort === "total_asc" ? "total_desc" : "total_asc";
  const psa10Sort = sort === "psa10_asc" ? "psa10_desc" : "psa10_asc";
  const maxPop = Math.max(1, ...rows.map((r) => r.population.popTotal));

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ flex: "1 1 auto", fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", minWidth: 110 }}>POP et prix par note</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{totalCount.toLocaleString("fr-FR")}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 3, padding: 3, borderRadius: 999, background: "var(--surface-sunken)", border: "1px solid var(--border-hairline)" }}>
          <TabLink active={!tcg} href={buildHref(searchParams, { tcg: undefined })}>Tous</TabLink>
          <TabLink active={tcg === "pokemon"} href={buildHref(searchParams, { tcg: "pokemon" })}>Pokémon</TabLink>
          <TabLink active={tcg === "one-piece"} href={buildHref(searchParams, { tcg: "one-piece" })}>One Piece</TabLink>
        </div>
        <div style={{ display: "flex", gap: 3, padding: 3, borderRadius: 999, background: "var(--surface-sunken)", border: "1px solid var(--border-hairline)" }}>
          <TabLink active={!lang} href={buildHref(searchParams, { lang: undefined })}>Toutes langues</TabLink>
          <TabLink active={lang === "EN"} href={buildHref(searchParams, { lang: "EN" })}>EN</TabLink>
          <TabLink active={lang === "JP"} href={buildHref(searchParams, { lang: "JP" })}>JP</TabLink>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 0", minHeight: 0, overflowY: "auto" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--white)", display: "grid", gridTemplateColumns: "minmax(96px, 1.35fr) 22px minmax(56px, 0.7fr) 52px 46px 46px 52px", gap: 5, alignItems: "center", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", borderBottom: "1px solid var(--border-hairline)", paddingBottom: 5, marginBottom: 2 }}>
          <span>Carte</span>
          <span>Lg</span>
          <Link href={buildHref(searchParams, { sort: popSort })} style={{ color: sort?.startsWith("total") ? "var(--text-strong)" : "inherit" }}>Pop</Link>
          <Link href={buildHref(searchParams, { sort: psa10Sort })} style={{ textAlign: "right", color: sort?.startsWith("psa10_") ? "var(--text-strong)" : "inherit" }}>PSA 10</Link>
          <span style={{ textAlign: "right" }}>PSA 9</span>
          <span style={{ textAlign: "right" }}>PSA 8</span>
          <span style={{ textAlign: "right" }}>Brut</span>
        </div>
        {rows.length === 0 ? (
          <span style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>Aucune carte ne correspond à ces filtres.</span>
        ) : (
          rows.map((r) => (
            <Link
              key={r.itemId}
              href={`/catalog/${r.itemId}`}
              style={{ display: "grid", gridTemplateColumns: "minmax(96px, 1.35fr) 22px minmax(56px, 0.7fr) 52px 46px 46px 52px", gap: 5, alignItems: "center", padding: "4px 0", color: "inherit" }}
            >
              <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                <span style={{ fontSize: 11.5, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                <span style={{ fontSize: 9.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.setCode ?? "—"}</span>
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{r.language}</span>
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-strong)" }}>{r.population.popTotal.toLocaleString("fr-FR")}</span>
                <span style={{ display: "block", height: 4, borderRadius: 2, background: "var(--grey-200)" }}>
                  <span style={{ display: "block", height: 4, borderRadius: 2, background: "var(--text-muted)", width: `${(r.population.popTotal / maxPop) * 100}%` }} />
                </span>
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-strong)", textAlign: "right", whiteSpace: "nowrap" }}>{r.psa10Price != null ? `$${r.psa10Price.toFixed(0)}` : "—"}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-muted)", textAlign: "right", whiteSpace: "nowrap" }}>{r.psa9Price != null ? `$${r.psa9Price.toFixed(0)}` : "—"}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-muted)", textAlign: "right", whiteSpace: "nowrap" }}>{r.psa8Price != null ? `$${r.psa8Price.toFixed(0)}` : "—"}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-muted)", textAlign: "right", whiteSpace: "nowrap" }}>{r.ungradedPrice != null ? `$${r.ungradedPrice.toFixed(2)}` : "—"}</span>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
