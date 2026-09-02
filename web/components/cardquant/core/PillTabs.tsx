// Port fidèle de design-system/components/core/PillTabs.jsx (handoff
// CardQuant, cf. mémoire projet "cardquant-rebrand"). `items` reste
// `string[]` comme dans le prototype (la valeur EST le libellé affiché) --
// TopNav.tsx fait la correspondance libellé -> route.
export interface PillTabsProps {
  items?: string[];
  value?: string;
  onChange?: (item: string) => void;
  size?: "sm" | "md";
  disabledItems?: string[];
}

export function PillTabs({ items = [], value, onChange, size = "md", disabledItems }: PillTabsProps) {
  const h = size === "sm" ? 28 : 34;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {items.map((it) => {
        const active = it === value;
        const disabled = disabledItems?.includes(it) ?? false;
        return (
          <button
            key={it}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange?.(it)}
            title={disabled ? "Bientôt disponible" : undefined}
            style={{
              height: h,
              padding: size === "sm" ? "0 12px" : "0 18px",
              borderRadius: "var(--radius-pill)",
              border: "1px solid transparent",
              cursor: disabled ? "default" : "pointer",
              background: active ? "var(--ink-000)" : "transparent",
              color: disabled ? "var(--border-strong)" : active ? "var(--white)" : "var(--text-body)",
              opacity: disabled ? 0.55 : 1,
              fontFamily: "var(--font-core)",
              fontSize: size === "sm" ? 12 : 13,
              fontWeight: active ? "var(--weight-medium)" : "var(--weight-regular)",
              transition: "background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)",
              whiteSpace: "nowrap",
            }}
          >
            {it}
          </button>
        );
      })}
    </div>
  );
}
