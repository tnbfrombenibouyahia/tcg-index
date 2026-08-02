"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ItemSummary } from "@/lib/types";
import { LanguageFlag } from "@/components/ui/LanguageFlag";

// Catalogue trop gros (~40k items) pour un <select> classique -- typeahead
// débouncé contre /api/items/search plutôt qu'un menu statique.
const DEBOUNCE_MS = 300;

export function CardSearchCombobox({ tcg }: { tcg?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("transactions.combobox");
  const initialName = searchParams.get("item_name") ?? "";

  const [query, setQuery] = useState(initialName);
  const [results, setResults] = useState<ItemSummary[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2 || query === initialName) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query.trim(), limit: "10" });
        if (tcg) params.set("tcg", tcg);
        const res = await fetch(`/api/items/search?${params.toString()}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        setResults(data.items ?? []);
        setOpen(true);
      } catch {
        // requête annulée (nouvelle frappe) -- rien à faire
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, tcg, initialName]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectItem(item: ItemSummary) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("item_id", String(item.id));
    params.set("item_name", item.name);
    params.set("page", "1");
    setQuery(item.name);
    setOpen(false);
    router.push(`/transactions?${params.toString()}`);
  }

  function clearSelection() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("item_id");
    params.delete("item_name");
    params.set("page", "1");
    setQuery("");
    router.push(`/transactions?${params.toString()}`);
  }

  const hasSelection = Boolean(searchParams.get("item_id"));

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("cardLabel")}</label>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (hasSelection) {
              // l'utilisateur retape -- la sélection précédente n'est plus valide
              const params = new URLSearchParams(searchParams.toString());
              params.delete("item_id");
              params.delete("item_name");
              router.replace(`/transactions?${params.toString()}`);
            }
          }}
          placeholder={t("placeholder")}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        {query && (
          <button
            type="button"
            onClick={clearSelection}
            aria-label={t("clearAria")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-surface shadow-lg">
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => selectItem(item)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <LanguageFlag language={item.language} />
                <span className="font-medium">{item.name}</span>
                {item.code ? <span className="text-muted-foreground">#{item.code}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
