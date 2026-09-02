"use client";

"use client";

import { useState } from "react";
import { Icon } from "./Icon";

// Port fidèle de design-system/components/core/IconButton.jsx (handoff
// CardQuant, cf. mémoire projet "cardquant-rebrand").
export interface IconButtonProps {
  icon?: string;
  label?: string;
  variant?: "primary" | "secondary";
  size?: number;
  onClick?: () => void;
  active?: boolean;
}

export function IconButton({ icon = "settings", label, variant = "secondary", size = 34, onClick, active }: IconButtonProps) {
  const [hover, setHover] = useState(false);
  const solid = variant === "primary" || active;
  return (
    <button
      type="button"
      aria-label={label || icon}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: size,
        height: size,
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        borderRadius: "var(--radius-pill)",
        background: solid ? "var(--ink-000)" : hover ? "var(--grey-100)" : "var(--white)",
        border: solid ? "1px solid var(--ink-000)" : "1px solid var(--border-hairline)",
        color: solid ? "var(--white)" : "var(--text-strong)",
        transition: "background var(--dur-fast) var(--ease-out)",
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.44)} />
    </button>
  );
}
