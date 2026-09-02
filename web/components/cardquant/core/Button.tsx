"use client";

import { useState } from "react";
import { Icon } from "./Icon";

// Port fidèle de design-system/components/core/Button.jsx (handoff
// CardQuant, cf. mémoire projet "cardquant-rebrand").
const VARIANTS = {
  primary: { background: "var(--ink-000)", color: "var(--white)", border: "1px solid var(--ink-000)" },
  accent: { background: "var(--green-400)", color: "var(--ink-000)", border: "1px solid var(--green-400)" },
  secondary: { background: "var(--white)", color: "var(--text-strong)", border: "1px solid var(--border-hairline)" },
  ghost: { background: "transparent", color: "var(--text-body)", border: "1px solid transparent" },
  danger: { background: "var(--down-500)", color: "var(--white)", border: "1px solid var(--down-500)" },
} as const;

const SIZES = {
  sm: { height: "var(--control-h-sm)", padding: "0 12px", fontSize: 12 },
  md: { height: "var(--control-h)", padding: "0 16px", fontSize: 13 },
  lg: { height: 42, padding: "0 22px", fontSize: 14 },
} as const;

export interface ButtonProps {
  children: React.ReactNode;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  icon?: string;
  iconRight?: string;
  disabled?: boolean;
  block?: boolean;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  style?: React.CSSProperties;
}

export function Button({ children, variant = "primary", size = "md", icon, iconRight, disabled, block, onClick, type = "button", style }: ButtonProps) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        display: block ? "flex" : "inline-flex",
        width: block ? "100%" : undefined,
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        fontFamily: "var(--font-core)",
        fontWeight: "var(--weight-medium)",
        letterSpacing: "-0.005em",
        borderRadius: "var(--radius-pill)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        whiteSpace: "nowrap",
        transition: "transform var(--dur-fast) var(--ease-out), filter var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)",
        filter: hover && !disabled ? "brightness(1.08)" : "none",
        transform: press && !disabled ? "scale(var(--press-scale))" : "none",
        ...SIZES[size],
        ...VARIANTS[variant],
        ...style,
      }}
    >
      {icon ? <Icon name={icon} size={size === "sm" ? 12 : 14} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={size === "sm" ? 12 : 14} /> : null}
    </button>
  );
}
