"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { Tcg } from "@/lib/constants";
import type { DivergenceRow, ItemSummary, SaleRow, UndervaluedRow } from "@/lib/types";
import type { GradingRoiRow } from "@/lib/gradingRoi";
import {
  DEFAULT_LAYOUT,
  LAYOUT_STORAGE_KEY,
  SIZE_SPANS,
  WIDGET_IDS,
  type DashboardLayoutState,
  type WidgetId,
  type WidgetSize,
} from "@/lib/dashboard/types";
import { WidgetShell } from "@/components/dashboard/WidgetShell";
import { WidgetDock } from "@/components/dashboard/WidgetDock";
import { CatalogueWidget } from "@/components/dashboard/widgets/CatalogueWidget";
import { TransactionsWidget } from "@/components/dashboard/widgets/TransactionsWidget";
import { UndervaluedWidget } from "@/components/dashboard/widgets/UndervaluedWidget";
import { DivergencesWidget } from "@/components/dashboard/widgets/DivergencesWidget";
import { GradingRoiWidget } from "@/components/dashboard/widgets/GradingRoiWidget";

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard "Terminal" (accueil) -- grille de 6 widgets déplaçables/
// redimensionnables/agrandissables, portée depuis Component (TCG Terminal.dc.html,
// fichier de maquette importé le 2026-08-07) vers de vrais hooks React :
// tout l'état de mise en page (ordre, taille, agrandissement) vit ici,
// persisté en localStorage (préférence d'affichage pure, pas de données
// métier -- pas de colonne DB pour ça). Les données de chaque widget sont
// déjà chargées côté serveur (cf. app/page.tsx) et passées en props.
// ─────────────────────────────────────────────────────────────────────────────

export function TerminalDashboard({
  tcg,
  catalogueInitialItems,
  sales,
  undervalued,
  divergences,
  gradingRoi,
}: {
  tcg: Tcg;
  catalogueInitialItems: ItemSummary[];
  sales: SaleRow[];
  undervalued: UndervaluedRow[];
  divergences: DivergenceRow[];
  gradingRoi: GradingRoiRow[];
}) {
  const t = useTranslations("dashboard.widgets");
  const [layout, setLayout] = useState<DashboardLayoutState>(DEFAULT_LAYOUT);
  const dragIdRef = useRef<WidgetId | null>(null);

  // Restaure la mise en page enregistrée après le premier rendu (client
  // uniquement -- le rendu serveur reste toujours la disposition par défaut,
  // pas de risque de désaccord d'hydratation).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<DashboardLayoutState>;
        // Filtre les ids obsolètes (ex. "live", retiré le 2026-08-09) qu'un
        // layout enregistré avant ce retrait pourrait encore contenir --
        // sinon un widget fantôme resterait "expanded" sans contenu à afficher.
        const knownOrder = saved.order?.filter((id) => (WIDGET_IDS as readonly string[]).includes(id));
        const knownExpanded =
          saved.expanded && (WIDGET_IDS as readonly string[]).includes(saved.expanded) ? saved.expanded : null;
        setLayout((prev) => ({
          ...prev,
          ...saved,
          order: knownOrder?.length ? knownOrder : prev.order,
          expanded: knownExpanded,
          sizes: { ...prev.sizes, ...saved.sizes },
        }));
      }
    } catch {
      // localStorage indisponible ou JSON corrompu -- on garde la disposition par défaut
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // quota dépassé / mode privé -- la préférence ne persiste juste pas
    }
  }, [layout]);

  function toggleExpand(id: WidgetId) {
    setLayout((s) => ({ ...s, expanded: s.expanded === id ? null : id }));
  }

  function setSize(id: WidgetId, size: WidgetSize) {
    setLayout((s) => ({ ...s, sizes: { ...s.sizes, [id]: size }, customSize: { ...s.customSize, [id]: null } }));
  }

  function dragHandlers(id: WidgetId) {
    return {
      onDragStart: (e: React.DragEvent) => {
        dragIdRef.current = id;
        e.dataTransfer.effectAllowed = "move";
      },
      onDragOver: (e: React.DragEvent) => e.preventDefault(),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const from = dragIdRef.current;
        if (!from || from === id) return;
        setLayout((s) => {
          const next = [...s.order];
          const fi = next.indexOf(from);
          const ti = next.indexOf(id);
          next.splice(fi, 1);
          next.splice(ti, 0, from);
          return { ...s, order: next };
        });
      },
    };
  }

  function startResize(id: WidgetId) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const handle = e.currentTarget as HTMLElement;
      const section = handle.parentElement as HTMLElement;
      const grid = section.parentElement as HTMLElement;
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = section.getBoundingClientRect().width;
      const startH = section.getBoundingClientRect().height;

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const newW = Math.max(240, startW + dx);
        const newH = Math.max(200, startH + dy);
        const gridRect = grid.getBoundingClientRect();
        const gap = 22;
        const colWidth = (gridRect.width - gap * 11) / 12;
        let span = Math.round((newW + gap) / (colWidth + gap));
        span = Math.min(12, Math.max(3, span));
        setLayout((s) => ({ ...s, customSize: { ...s.customSize, [id]: { span, height: Math.round(newH) } } }));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };
  }

  const titles: Record<WidgetId, { title: string; subtitle: string }> = {
    catalogue: { title: t("catalogue.title"), subtitle: t("catalogue.subtitle") },
    tx: { title: t("tx.title"), subtitle: t("tx.subtitle") },
    under: { title: t("under.title"), subtitle: t("under.subtitle") },
    div: { title: t("div.title"), subtitle: t("div.subtitle") },
    grade: { title: t("grade.title"), subtitle: t("grade.subtitle") },
  };

  const content: Record<WidgetId, ReactNode> = {
    catalogue: <CatalogueWidget tcg={tcg} initialItems={catalogueInitialItems} />,
    tx: <TransactionsWidget sales={sales} />,
    under: <UndervaluedWidget rows={undervalued} />,
    div: <DivergencesWidget rows={divergences} />,
    grade: <GradingRoiWidget rows={gradingRoi} />,
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(12, 1fr)",
        gap: "22px",
        // Espace pour que le dock flottant (fixed, bottom: 26px) ne recouvre
        // jamais le bas de la grille -- surtout visible sur les tailles L.
        paddingBottom: "90px",
      }}
    >
      <WidgetDock
        universe={tcg}
        expanded={layout.expanded}
        onSelect={(id) => setLayout((s) => ({ ...s, expanded: id }))}
      />
      {WIDGET_IDS.map((id) => (
        <WidgetShell
          key={id}
          title={titles[id].title}
          subtitle={titles[id].subtitle}
          gridSpan={SIZE_SPANS[id][layout.sizes[id]]}
          order={layout.order.indexOf(id)}
          expanded={layout.expanded === id}
          hidden={layout.expanded !== null && layout.expanded !== id}
          size={layout.sizes[id]}
          customSize={layout.customSize[id]}
          onSizeChange={(size) => setSize(id, size)}
          onToggleExpand={() => toggleExpand(id)}
          onResizeStart={startResize(id)}
          {...dragHandlers(id)}
        >
          {content[id]}
        </WidgetShell>
      ))}
    </div>
  );
}
