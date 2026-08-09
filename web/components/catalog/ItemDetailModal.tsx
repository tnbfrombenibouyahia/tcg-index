"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { ItemDetail, ItemSummary, SaleRow } from "@/lib/types";
import { ItemDetailBody, type GradingRoiBundle } from "./ItemDetailBody";

interface DetailResponse {
  item: ItemDetail;
  sales: SaleRow[];
  gradingRoi: GradingRoiBundle | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Popup verre de fiche carte -- ouverte au clic sur un résultat de la
// recherche catalogue (cf. CatalogSearch) au lieu de naviguer vers
// /catalog/[id] (demande utilisateur : lire l'analyse sans quitter la
// recherche). Même famille visuelle que CardDetailModal/GradingRoiModal,
// avec une barre de titre collante (contenu plus long que ces deux-là --
// toutes les sections de la fiche complète) pour garder le bouton fermer
// accessible pendant le scroll. `item` (déjà connu de la recherche) sert de
// titre immédiat pendant que /api/items/[id]/detail ramène le reste.
// ─────────────────────────────────────────────────────────────────────────────

export function ItemDetailModal({ item, onClose }: { item: ItemSummary; onClose: () => void }) {
  const t = useTranslations("itemDetail");
  const tModal = useTranslations("itemDetail.modal");
  const [detail, setDetail] = useState<DetailResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/items/${item.id}/detail`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        // Erreur réseau -- reste affichée en chargement plutôt qu'un état
        // d'erreur dédié, cohérent avec CardDetailModal/DivergencePanel.
      });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "var(--overlay-scrim)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl"
        style={{
          background: "var(--surface, rgba(255,255,255,0.92))",
          backdropFilter: "var(--glass-blur, blur(20px) saturate(1.4))",
          boxShadow: "var(--shadow-lift, 0 16px 48px rgba(0,0,0,0.18))",
          maxHeight: "90vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barre de titre collante -- bouton fermer toujours accessible même
            scrollé loin dans les sections (contenu plus long qu'un modal
            habituel de l'app). */}
        <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-border px-5 py-3">
          <p className="truncate text-sm font-semibold">{item.name}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label={tModal("close")}
            className="flex-shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {detail ? (
            <ItemDetailBody item={detail.item} sales={detail.sales} gradingRoi={detail.gradingRoi} />
          ) : (
            <div className="flex items-center justify-center py-24 text-xs text-muted-foreground">{t("loading")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
