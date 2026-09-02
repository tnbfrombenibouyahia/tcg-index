import Link from "next/link";
import type { WatchedCard } from "@/lib/watchlistApi";
import { Button } from "../core/Button";

const TCG_HINT: Record<string, string> = { EN: "EN", JP: "JP", FR: "FR" };

// "Ma watchlist" de l'écran Watchlist CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- réel, favoris de l'utilisateur via
// lib/watchlistApi.ts. Colonnes Seuil/Écart/Intention/P/V du mockup omises
// (pas de prix cible stocké, cf. WatchlistKpiRow.tsx) : ne reste que ce qui
// existe vraiment, prix brut actuel + lien direct vers la fiche carte.
export function WatchlistTable({ cards, onRemove }: { cards: WatchedCard[]; onRemove: (itemId: number) => void }) {
  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "14px 16px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
      {cards.length === 0 ? (
        <div style={{ padding: "24px 0", textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>Aucune carte suivie pour l&apos;instant.</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) 44px minmax(70px, 0.7fr) 90px 100px", gap: 8, alignItems: "center", padding: "0 2px 8px", borderBottom: "1px solid var(--border-hairline)", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            <span>Carte</span>
            <span>Lg</span>
            <span style={{ textAlign: "right" }}>Brut</span>
            <span>Set</span>
            <span style={{ textAlign: "right" }}>Action</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {cards.map((c) => (
              <div key={c.itemId} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) 44px minmax(70px, 0.7fr) 90px 100px", gap: 8, alignItems: "center", padding: "10px 2px", borderBottom: "1px solid var(--border-hairline)" }}>
                <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 13, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.setName ?? c.setCode ?? "—"}{c.setReleaseYear ? ` · ${c.setReleaseYear}` : ""}</span>
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-body)" }}>{TCG_HINT[c.language] ?? c.language}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--text-strong)", textAlign: "right", whiteSpace: "nowrap" }}>
                  {c.currentPrice != null ? `$${c.currentPrice.toFixed(2)}` : "—"}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.setCode ?? "—"}</span>
                <span style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                  <Link href={`/catalog/${c.itemId}`}>
                    <Button variant="ghost" size="sm">Fiche</Button>
                  </Link>
                  <Button variant="ghost" size="sm" onClick={() => onRemove(c.itemId)}>Retirer</Button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      <p style={{ margin: "6px 0 0", fontSize: 11.5, lineHeight: 1.45, color: "var(--text-muted)" }}>
        Cliquez « Fiche » pour ouvrir l&apos;analyse complète. Prix indicatifs, agrégés de sources tierces.
      </p>
    </section>
  );
}
