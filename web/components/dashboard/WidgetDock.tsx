"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { WIDGET_IDS, type WidgetId } from "@/lib/dashboard/types";

// ─────────────────────────────────────────────────────────────────────────────
// Dock flottant du dashboard -- porté du "nav" bas de TCG Terminal.dc.html :
// pilule fixe en bas d'écran, verre liquide (mêmes tokens --glass-widget-*
// que les widgets), se déplie au survol (46px -> 60px, les libellés
// apparaissent). Un bouton "vue grille" + un raccourci par widget, chacun
// AGRANDIT directement ce widget (même geste que le ⤢ dans son en-tête,
// juste accessible sans avoir à le retrouver dans la grille) -- reflète
// TerminalDashboard.layout.expanded, ne duplique pas l'état.
// ─────────────────────────────────────────────────────────────────────────────

const SHAPES: Record<WidgetId, React.CSSProperties[]> = {
  catalogue: [
    { position: "absolute", left: "5px", top: "5px", width: "9px", height: "9px", borderRadius: "50%", border: "2px solid var(--foreground)" },
    { position: "absolute", left: "13px", top: "13px", width: "6px", height: "2px", background: "var(--foreground)", transform: "rotate(45deg)" },
  ],
  live: [
    { position: "absolute", left: "3px", bottom: "3px", width: "3px", height: "7px", background: "var(--foreground)", opacity: 0.55 },
    { position: "absolute", left: "9px", bottom: "3px", width: "3px", height: "13px", background: "var(--foreground)" },
    { position: "absolute", left: "15px", bottom: "3px", width: "3px", height: "10px", background: "var(--foreground)", opacity: 0.8 },
  ],
  tx: [
    { position: "absolute", left: "4px", top: "3px", width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderBottom: "6px solid var(--foreground)" },
    { position: "absolute", right: "4px", bottom: "3px", width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "6px solid var(--foreground)", opacity: 0.7 },
  ],
  under: [
    { position: "absolute", left: "3px", top: "3px", width: "16px", height: "16px", borderRadius: "50%", border: "2px solid var(--foreground)", opacity: 0.5 },
    { position: "absolute", left: "8px", top: "8px", width: 0, height: 0, borderLeft: "3.5px solid transparent", borderRight: "3.5px solid transparent", borderTop: "5.5px solid var(--foreground)" },
  ],
  div: [
    { position: "absolute", left: "10px", top: "3px", width: "2px", height: "12px", background: "var(--foreground)", transform: "rotate(20deg)", transformOrigin: "bottom" },
    { position: "absolute", left: "10px", top: "3px", width: "2px", height: "12px", background: "var(--foreground)", opacity: 0.6, transform: "rotate(-20deg)", transformOrigin: "bottom" },
  ],
  grade: [
    { position: "absolute", left: "5px", top: "5px", width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderBottom: "10px solid var(--foreground)" },
  ],
};

export function WidgetDock({ expanded, onSelect }: { expanded: WidgetId | null; onSelect: (id: WidgetId | null) => void }) {
  const t = useTranslations("dashboard.widgets");
  const [hover, setHover] = useState(false);

  return (
    <nav
      aria-label={t("gridView")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "fixed",
        left: "50%",
        bottom: "26px",
        transform: "translateX(-50%)",
        zIndex: 40,
        display: "flex",
        flexDirection: "row",
        gap: hover ? "3px" : "2px",
        padding: hover ? "0 14px" : "0 8px",
        height: hover ? "60px" : "46px",
        alignItems: "center",
        borderRadius: "24px",
        background: "var(--glass-widget-bg)",
        backdropFilter: "blur(18px) saturate(160%)",
        WebkitBackdropFilter: "blur(18px) saturate(160%)",
        border: "1px solid var(--glass-widget-border)",
        boxShadow: "var(--glass-widget-shadow)",
        transition: "all 0.35s cubic-bezier(.4,0,.2,1)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-label={t("gridView")}
        aria-pressed={expanded === null}
        title={t("gridView")}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: hover ? "34px" : "26px",
          height: hover ? "34px" : "26px",
          flexShrink: 0,
          marginRight: "10px",
          borderRadius: "10px",
          cursor: "pointer",
          border: "none",
          background: expanded === null ? "var(--accent)" : "transparent",
          boxShadow: expanded === null ? "0 0 12px color-mix(in srgb, var(--accent) 55%, transparent)" : "none",
          transition: "all 0.3s cubic-bezier(.4,0,.2,1)",
        }}
      >
        <div
          style={{
            width: hover ? "14px" : "11px",
            height: hover ? "14px" : "11px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gridTemplateRows: "1fr 1fr",
            gap: hover ? "3px" : "2px",
            transition: "all 0.3s cubic-bezier(.4,0,.2,1)",
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ width: "100%", height: "100%", borderRadius: "2px", background: expanded === null ? "#fff" : "var(--foreground)" }} />
          ))}
        </div>
      </button>

      {WIDGET_IDS.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          aria-pressed={expanded === id}
          title={t(`${id}.title`)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: hover ? "13px" : "0px",
            padding: hover ? "10px 18px" : "6px",
            margin: hover ? "0 8px" : "0 2px",
            borderRadius: "14px",
            cursor: "pointer",
            border: "none",
            background: expanded === id ? "var(--tint-neutral-strong)" : "transparent",
            transition: "all 0.3s cubic-bezier(.4,0,.2,1)",
          }}
        >
          <div
            style={{
              position: "relative",
              width: hover ? "22px" : "16px",
              height: hover ? "22px" : "16px",
              flexShrink: 0,
              transition: "all 0.3s cubic-bezier(.4,0,.2,1)",
            }}
          >
            {SHAPES[id].map((s, i) => (
              <div key={i} style={s} />
            ))}
          </div>
          <span
            style={{
              color: "var(--foreground)",
              fontSize: "12.5px",
              fontWeight: 700,
              whiteSpace: "nowrap",
              opacity: hover ? 1 : 0,
              maxWidth: hover ? "140px" : "0px",
              overflow: "hidden",
              transition: "opacity 0.2s, max-width 0.3s",
            }}
          >
            {t(`${id}.title`)}
          </span>
        </button>
      ))}
    </nav>
  );
}
