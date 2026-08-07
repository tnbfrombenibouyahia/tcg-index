"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUniverseAction } from "@/app/actions/universe";
import type { Tcg } from "@/lib/constants";
import { TcgIcon } from "@/components/homepage/TcgIcon";

// ─────────────────────────────────────────────────────────────────────────────
// Sélecteur d'univers (Pokémon / One Piece) — filtre global persistant
// (demande utilisateur), même mécanique que LanguageSelector (cookie +
// server action + router.refresh()) mais avec le curseur coulissant du
// mockup "TCG Terminal" plutôt que deux boutons pleins.
// ─────────────────────────────────────────────────────────────────────────────

const OPTIONS: { code: Tcg }[] = [{ code: "pokemon" }, { code: "one-piece" }];

export function UniverseSelector({ current }: { current: Tcg }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isPokemon = current === "pokemon";

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width: "100%",
        background: "var(--surface-alt)",
        border: "1px solid var(--border)",
        borderRadius: "999px",
        padding: "3px",
        opacity: isPending ? 0.6 : 1,
      }}
    >
      {/* Curseur coulissant */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "3px",
          bottom: "3px",
          left: isPokemon ? "3px" : "50%",
          width: "calc(50% - 3px)",
          background: "var(--accent)",
          borderRadius: "999px",
          boxShadow: "0 0 10px color-mix(in srgb, var(--accent) 60%, transparent)",
          transition: "left 0.25s ease, background 0.25s ease",
        }}
      />
      {OPTIONS.map((opt) => {
        const active = current === opt.code;
        return (
          <button
            key={opt.code}
            type="button"
            disabled={isPending}
            aria-pressed={active}
            aria-label={opt.code === "pokemon" ? "Pokémon" : "One Piece"}
            title={opt.code === "pokemon" ? "Pokémon" : "One Piece"}
            onClick={() =>
              startTransition(async () => {
                await setUniverseAction(opt.code);
                router.refresh();
              })
            }
            style={{
              position: "relative",
              zIndex: 1,
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              padding: "6px 0",
              cursor: isPending ? "default" : "pointer",
            }}
          >
            <span style={{ width: "16px", height: "16px", display: "block" }}>
              <TcgIcon tcg={opt.code} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
