"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SetSummary } from "@/lib/queries/setAnalysis";

const TCG_LABEL: Record<string, string> = { pokemon: "Pokémon", "one-piece": "One Piece" };

// En-tête de l'écran Analyse set CardQuant (cf. mémoire projet
// "cardquant-rebrand") : recherche de set (debounce + /api/sets/search,
// même mécanique que CatalogSearch.tsx) + valeur du set + 5 KPI réels.
// Pas de bascule de langue (contrairement au mockup) : un set n'existe que
// dans une seule langue à la fois, cf. commentaire de getSetSummary.
export function SetSearchHeader({ summary }: { summary: SetSummary }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ setCode: string; tcg: string; language: string; itemCount: number }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim();

  // Pas de setResults([]) synchrone pour la requête vide (règle
  // react-hooks/set-state-in-effect) : `results` peut rester périmé en
  // state le temps que l'utilisateur retape quelque chose, ça ne se voit
  // jamais puisque le rendu ne montre le menu que si `trimmed` est non vide
  // (cf. plus bas) -- dérivé du render plutôt qu'un état à resynchroniser.
  useEffect(() => {
    if (trimmed.length < 1) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/sets/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { sets: [] }))
        .then((data) => setResults(data.sets ?? []))
        .catch(() => {});
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [trimmed]);

  function pick(setCode: string) {
    setQuery("");
    setResults([]);
    router.push(`/set-analysis?set=${encodeURIComponent(setCode)}`);
  }

  const kpis = [
    { label: "Cartes du set", value: summary.itemCount.toLocaleString("fr-FR"), unit: "" },
    { label: "Ventes 30j", value: summary.volume30d.toLocaleString("fr-FR"), unit: "" },
    { label: "Prix moyen brut", value: summary.avgRawPrice != null ? `$${summary.avgRawPrice.toFixed(2)}` : "—", unit: "" },
    { label: "Prix moyen PSA 10", value: summary.avgPsa10Price != null ? `$${summary.avgPsa10Price.toFixed(0)}` : "—", unit: "" },
    {
      label: "Variation valeur 30j",
      value: summary.valueChangePct30d != null ? `${summary.valueChangePct30d >= 0 ? "+" : ""}${summary.valueChangePct30d.toFixed(1)}%` : "—",
      unit: "",
      color: summary.valueChangePct30d == null ? undefined : summary.valueChangePct30d >= 0 ? "var(--up-600)" : "var(--down-500)",
    },
  ];

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px 12px", minWidth: 0, flexWrap: "wrap" }}>
          <span style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--text-strong)", whiteSpace: "nowrap" }}>{summary.setCode}</span>
          <span style={{ padding: "3px 9px", borderRadius: 999, border: "1px solid var(--border-strong)", fontSize: 10.5, letterSpacing: "0.02em", color: "var(--text-body)", whiteSpace: "nowrap" }}>
            {TCG_LABEL[summary.tcg] ?? summary.tcg}
          </span>
          <span style={{ padding: "3px 9px", borderRadius: 999, border: "1px solid var(--border-strong)", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-body)", whiteSpace: "nowrap" }}>{summary.language}</span>
          {summary.releaseYear ? (
            <span style={{ padding: "3px 9px", borderRadius: 999, border: "1px solid var(--border-strong)", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-body)", whiteSpace: "nowrap" }}>{summary.releaseYear}</span>
          ) : null}
        </div>
        <div style={{ flex: "1 1 auto", display: "flex", justifyContent: "center", minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Valeur du set</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 32, fontWeight: 300, letterSpacing: "-0.01em", lineHeight: 1, color: "var(--text-strong)", whiteSpace: "nowrap" }}>
              ${Math.round(summary.valueUsd).toLocaleString("fr-FR")}
            </span>
          </div>
        </div>
        <div style={{ position: "relative", minWidth: 210 }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un set ou un code…"
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 14px", borderRadius: 999, border: "1px solid var(--border-hairline)", background: "var(--surface-sunken)", color: "var(--text-strong)", font: "inherit", fontSize: 12, outline: "none" }}
          />
          {trimmed.length > 0 && results.length > 0 ? (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 20, background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 10, boxShadow: "var(--shadow-pop)", overflow: "hidden" }}>
              {results.map((r) => (
                <button
                  key={`${r.tcg}-${r.setCode}`}
                  type="button"
                  onClick={() => pick(r.setCode)}
                  style={{ appearance: "none", border: 0, width: "100%", textAlign: "left", font: "inherit", display: "flex", alignItems: "baseline", gap: 10, padding: "8px 12px", background: "transparent", color: "var(--text-strong)", fontSize: 12, cursor: "pointer" }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.setCode}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-muted)" }}>
                    {TCG_LABEL[r.tcg] ?? r.tcg} · {r.language} · {r.itemCount}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: "10px 18px", borderTop: "1px solid var(--border-hairline)", paddingTop: 10 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.label}</span>
            <span style={{ fontSize: 21, fontWeight: 400, lineHeight: 1.1, color: k.color ?? "var(--text-strong)", whiteSpace: "nowrap" }}>{k.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
