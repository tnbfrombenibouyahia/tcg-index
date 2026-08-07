"use client";

import type { ReactNode } from "react";
import type { CustomWidgetSize, WidgetSize } from "@/lib/dashboard/types";
import { DEFAULT_MIN_HEIGHT } from "@/lib/dashboard/types";

// ─────────────────────────────────────────────────────────────────────────────
// Panneau de widget du dashboard "Terminal" -- poignée de drag, boutons de
// taille S/M/L, agrandissement plein-largeur, coin de redimensionnement
// libre. Porté depuis Component.renderVals() de TCG Terminal.dc.html (wStyle,
// dragHandlers, startResize, makeSizeButtons) vers un composant contrôlé :
// tout l'état (ordre, taille, expansion) vit dans TerminalDashboard, ce
// composant ne fait que l'afficher et remonter les événements.
// ─────────────────────────────────────────────────────────────────────────────

const SIZES: WidgetSize[] = ["s", "m", "l"];

export function WidgetShell({
  title,
  subtitle,
  gridSpan,
  order,
  expanded,
  hidden,
  size,
  customSize,
  leftAccessory,
  headerRight,
  onSizeChange,
  onToggleExpand,
  onDragStart,
  onDragOver,
  onDrop,
  onResizeStart,
  children,
}: {
  title: string;
  subtitle: string;
  gridSpan: number;
  order: number;
  expanded: boolean;
  hidden: boolean;
  size: WidgetSize;
  customSize: CustomWidgetSize | null | undefined;
  leftAccessory?: ReactNode;
  headerRight?: ReactNode;
  onSizeChange: (size: WidgetSize) => void;
  onToggleExpand: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onResizeStart: (e: React.MouseEvent) => void;
  children: ReactNode;
}) {
  const minHeight = expanded
    ? 600
    : customSize
      ? customSize.height
      : DEFAULT_MIN_HEIGHT[size];

  return (
    <section
      className="widget-glass"
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        display: hidden ? "none" : "flex",
        flexDirection: "column",
        gap: "14px",
        position: "relative",
        gridColumn: expanded ? "1 / -1" : `span ${customSize ? customSize.span : gridSpan}`,
        order,
        padding: "20px",
        minHeight: `${minHeight}px`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <span
            style={{
              cursor: "grab",
              color: "var(--foreground-subtle)",
              fontSize: "14px",
              lineHeight: "10px",
              letterSpacing: "-2px",
              userSelect: "none",
              flexShrink: 0,
              paddingTop: "3px",
            }}
          >
            ⋮⋮
          </span>
          {leftAccessory}
          <div>
            <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 700, letterSpacing: "0.2px", color: "var(--foreground)" }}>
              {title}
            </h2>
            <p style={{ margin: "3px 0 0", fontSize: "11.5px", color: "var(--foreground-muted)" }}>{subtitle}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
          {headerRight}
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSizeChange(s)}
              style={{
                fontSize: "9.5px",
                fontWeight: 800,
                width: "18px",
                height: "18px",
                borderRadius: "4px",
                border: "1px solid var(--border)",
                background: size === s && !expanded ? "var(--accent)" : "transparent",
                color: size === s && !expanded ? "#fff" : "var(--foreground-muted)",
                cursor: "pointer",
                padding: 0,
                lineHeight: "16px",
              }}
            >
              {s.toUpperCase()}
            </button>
          ))}
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={expanded ? "Réduire" : "Agrandir"}
            style={{
              width: "26px",
              height: "26px",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--foreground-muted)",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            {expanded ? "⤡" : "⤢"}
          </button>
        </div>
      </div>

      {children}

      {!expanded && (
        <div
          onMouseDown={onResizeStart}
          style={{
            position: "absolute",
            right: "3px",
            bottom: "3px",
            width: "14px",
            height: "14px",
            cursor: "nwse-resize",
            background: "linear-gradient(135deg, transparent 50%, var(--border) 50%)",
            borderRadius: "0 0 4px 0",
          }}
        />
      )}
    </section>
  );
}
