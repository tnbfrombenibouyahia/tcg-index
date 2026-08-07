"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ItemSummary } from "@/lib/types";
import type { Tcg } from "@/lib/constants";
import { ItemSwatch } from "@/components/dashboard/ItemSwatch";
import { LanguageFlag } from "@/components/ui/LanguageFlag";

// ─────────────────────────────────────────────────────────────────────────────
// Widget Catalogue -- recherche live sur /api/items/search (même debounce +
// AbortController que CatalogSearch.tsx), repli sur `initialItems` (top
// items alphabétiques de l'univers actif, déjà chargés côté serveur) tant
// que la recherche est vide ou trop courte.
//
// Pas de prix par ligne : searchItems() (lib/queries/items.ts) ne retourne
// que l'identité de l'item, pas de cotation -- honnête plutôt que d'en
// inventer une. Cliquer une ligne ouvre la fiche complète (/catalog/[id])
// qui, elle, a le prix.
// ─────────────────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

export function CatalogueWidget({ tcg, initialItems }: { tcg: Tcg; initialItems: ItemSummary[] }) {
  const t = useTranslations("dashboard.catalogue");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ItemSummary[] | null>(null);
  const [loading, setLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const trimmed = query.trim();
  const searched = trimmed.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!searched) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      fetch(`/api/items/search?q=${encodeURIComponent(trimmed)}&tcg=${tcg}&limit=8`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : { items: [] }))
        .then((data) => setResults(data.items ?? []))
        .catch((err) => {
          if (err?.name !== "AbortError") setResults([]);
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, tcg]);

  const items = searched ? (results ?? []) : initialItems;

  return (
    <>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchPlaceholder")}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "9px 12px",
          borderRadius: "7px",
          border: "1px solid var(--border)",
          background: "var(--surface-alt)",
          color: "var(--foreground)",
          fontSize: "13px",
          outline: "none",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", overflowY: "auto", flex: 1 }}>
        {items.length === 0 && !loading && (
          <p style={{ fontSize: "12px", color: "var(--foreground-subtle)", padding: "10px 0" }}>
            {searched ? t("noResults") : t("empty")}
          </p>
        )}
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/catalog/${item.id}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "10px 0",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <ItemSwatch imageUrl={item.imageUrl} name={item.name} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: "13.5px",
                  color: "var(--foreground)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {item.name}
              </div>
              <div style={{ fontSize: "11.5px", color: "var(--foreground-muted)" }}>
                {[item.setCode, item.rarity].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            <LanguageFlag language={item.language} size={16} />
          </Link>
        ))}
      </div>
    </>
  );
}
