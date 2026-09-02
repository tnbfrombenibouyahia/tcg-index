"use client";

import { useState } from "react";
import { Icon } from "./Icon";

// Port fidèle de design-system/components/core/Input.jsx (handoff CardQuant,
// cf. mémoire projet "cardquant-rebrand") -- juste typé.
export interface InputProps {
  value?: string;
  placeholder?: string;
  icon?: string;
  onChange?: (value: string) => void;
  size?: "sm" | "md";
  suffix?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export function Input({ value, placeholder, icon, onChange, size = "md", suffix, disabled, style }: InputProps) {
  const [focus, setFocus] = useState(false);
  const h = size === "sm" ? "var(--control-h-sm)" : "var(--control-h)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: h,
        padding: "0 12px",
        background: disabled ? "var(--grey-100)" : "var(--surface-sunken)",
        border: `1px solid ${focus ? "var(--ink-000)" : "var(--border-hairline)"}`,
        borderRadius: "var(--radius-pill)",
        transition: "border-color var(--dur-fast) var(--ease-out)",
        ...style,
      }}
    >
      {icon ? <Icon name={icon} size={13} color="var(--text-muted)" /> : null}
      <input
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          all: "unset",
          flex: 1,
          minWidth: 0,
          fontFamily: "var(--font-core)",
          fontSize: size === "sm" ? 12 : 13,
          color: "var(--text-strong)",
        }}
      />
      {suffix ? <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{suffix}</span> : null}
    </div>
  );
}
