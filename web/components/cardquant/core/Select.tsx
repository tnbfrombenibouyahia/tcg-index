"use client";

import { useState } from "react";
import { Icon } from "./Icon";

// Port fidèle de design-system/components/core/Select.jsx (handoff
// CardQuant, cf. mémoire projet "cardquant-rebrand").
export interface SelectProps {
  value?: string;
  options?: string[];
  onChange?: (value: string) => void;
  size?: "sm" | "md";
  style?: React.CSSProperties;
}

export function Select({ value, options = [], onChange, size = "md", style }: SelectProps) {
  const [open, setOpen] = useState(false);
  const h = size === "sm" ? "var(--control-h-sm)" : "var(--control-h)";
  return (
    <div style={{ position: "relative", ...style }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 10, height: h, padding: "0 12px", width: "100%",
          background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-pill)",
          fontFamily: "var(--font-core)", fontSize: size === "sm" ? 12 : 13, color: "var(--text-strong)", cursor: "pointer",
        }}
      >
        <span style={{ flex: 1, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>
        <Icon name="chevron-down" size={13} color="var(--text-muted)" />
      </button>
      {open ? (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 19 }} />
          <div
            style={{
              position: "absolute", zIndex: 20, top: "calc(100% + 6px)", left: 0, minWidth: "100%", maxHeight: 320, overflowY: "auto",
              background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-pop)", padding: 4,
            }}
          >
            {options.map((o) => (
              <div
                key={o}
                onClick={() => { onChange?.(o); setOpen(false); }}
                style={{
                  padding: "7px 10px", borderRadius: "var(--radius-sm)", fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap",
                  color: o === value ? "var(--text-strong)" : "var(--text-body)",
                  background: o === value ? "var(--grey-100)" : "transparent",
                }}
              >
                {o}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
