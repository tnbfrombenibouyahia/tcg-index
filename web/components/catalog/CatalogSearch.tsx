"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ItemSummary } from "@/lib/types";
import { TCGS, type Tcg } from "@/lib/constants";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { EmptyState } from "@/components/ui/EmptyState";

// ─────────────────────────────────────────────────────────────────────────────
// Recherche catalogue générale (demande utilisateur) : un seul champ pour le
// nom OU le numéro de carte (cf. lib/queries/items.ts, `code ILIKE` ajouté),
// résultats en grille cliquable vers la fiche /catalog/[id]. Débounce +
// annulation de requête même pattern que CardSearchCombobox (transactions),
// mais en page pleine (grille de résultats) plutôt qu'un dropdown -- ce
// n'est pas un filtre secondaire ici, c'est le point d'entrée de la page.
//
// L'URL reste synchronisée (`?q=&tcg=`) via `replace` (pas `push`, pour ne
// pas empiler l'historique à chaque frappe) -- recherche partageable/
// rafraîchissable, comme les autres pages filtrées de l'app.
// ─────────────────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

export function CatalogSearch({
  initialQuery,
  initialTcg,
}: {
  initialQuery: string;
  initialTcg?: Tcg;
}) {
  const router = useRouter();
  const t = useTranslations("catalog");
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState(initialQuery);
  const [tcg, setTcg] = useState<Tcg | undefined>(initialTcg);
  const [results, setResults] = useState<ItemSummary[]>([]);
  const [loading, setLoading] = useState(false);

  // Dérivés du render, pas d'état séparé -- évite un setState synchrone dans
  // l'effet juste pour refléter ce que `query` dit déjà (cf. commentaire
  // plus bas sur react-hooks/set-state-in-effect).
  const trimmed = query.trim();
  const searched = trimmed.length >= MIN_QUERY_LENGTH;

  // Focus direct sur le champ à l'arrivée -- page dont la seule action est
  // de taper une recherche.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    // Reflète la recherche dans l'URL sans empiler l'historique.
    const params = new URLSearchParams();
    if (trimmed) params.set("q", trimmed);
    if (tcg) params.set("tcg", tcg);
    const qs = params.toString();
    router.replace(`/catalog${qs ? `?${qs}` : ""}`, { scroll: false });

    if (!searched) return;

    // `setLoading`/`setResults` vivent dans le callback du timer (pas dans
    // le corps synchrone de l'effet) -- même contrainte que
    // react-hooks/set-state-in-effect ailleurs dans l'app, mais respectée
    // ici plutôt que contournée.
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      const p = new URLSearchParams({ q: trimmed, limit: "24" });
      if (tcg) p.set("tcg", tcg);
      fetch(`/api/items/search?${p.toString()}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { items: [] }))
        .then((data) => setResults(data.items ?? []))
        .catch(() => {
          // requête annulée (nouvelle frappe) -- rien à faire
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `router`/`searched` dérivés de `trimmed`/`tcg`, déjà en dep
  }, [trimmed, tcg]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && results.length > 0) {
      router.push(`/catalog/${results[0].id}`);
    }
  }

  return (
    <div>
      {/* Search box */}
      <div className="relative mx-auto max-w-xl">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchAria")}
          className="w-full rounded-2xl border border-border bg-surface py-3.5 pl-11 pr-11 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={t("clearAria")}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        )}
      </div>

      {/* TCG filter */}
      <div className="mt-4 flex items-center justify-center gap-1.5">
        <FilterPill active={!tcg} onClick={() => setTcg(undefined)}>
          {t("filterAll")}
        </FilterPill>
        {TCGS.map((g) => (
          <FilterPill key={g.value} active={tcg === g.value} onClick={() => setTcg(g.value)}>
            {g.label}
          </FilterPill>
        ))}
      </div>

      {/* Results */}
      <div className="mt-8">
        {!searched ? (
          <EmptyState title={t("promptTitle")} description={t("promptDescription")} />
        ) : loading && results.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{t("loading")}</p>
        ) : results.length === 0 ? (
          <EmptyState title={t("noResultsTitle")} description={t("noResultsDescription")} />
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">{t("resultsCount", { count: results.length })}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {results.map((item) => (
                <ItemResultCard key={item.id} item={item} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ItemResultCard({ item }: { item: ItemSummary }) {
  return (
    <Link
      href={`/catalog/${item.id}`}
      className="card-glass flex flex-col items-center gap-2 rounded-xl p-3 text-center transition-transform hover:-translate-y-0.5"
    >
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- hôtes CDN externes (TCGPlayer/PriceCharting), cf. plan §5
        <img
          src={item.imageUrl}
          alt={item.name}
          loading="lazy"
          className="h-28 w-[5.25rem] rounded-lg object-contain shadow-sm"
          style={{ aspectRatio: "3/4", background: "var(--surface-alt)" }}
        />
      ) : (
        <div className="h-28 w-[5.25rem] rounded-lg bg-muted" />
      )}
      <div className="min-w-0 w-full">
        <p className="truncate text-xs font-semibold">{item.name}</p>
        <div className="mt-1 flex items-center justify-center gap-1.5">
          <LanguageFlag language={item.language} size={12} />
          {item.code && <span className="text-[11px] text-muted-foreground">#{item.code}</span>}
        </div>
        {item.setCode && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{item.setCode}</p>}
      </div>
    </Link>
  );
}
