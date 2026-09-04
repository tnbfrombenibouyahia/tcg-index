"use client";

import { Icon } from "../core/Icon";

// Port fidèle de design-system/components/data/DataTable.jsx (handoff
// CardQuant, cf. mémoire projet "cardquant-rebrand"). `key` doit être une clé
// de `T` -- react-node/string/number en valeur affichée.
//
// "use client" obligatoire : le `<th onClick={...}>` ci-dessous attache un
// handler d'événement à un élément hôte, TOUJOURS (même quand `onSort` n'est
// pas fourni -- `() => onSort?.(c.key)` est créée dans tous les cas). Sans
// cette directive, ce fichier restait Server Component par défaut (tous ses
// appelants -- OpportunitiesPanel, LatestSalesPanel -- le sont aussi), et RSC
// refuse de sérialiser un handler dans le payload : "Event handlers cannot be
// passed to Client Component props", plantage systématique (pas transitoire,
// un reload ne change rien) de /dashboard et /transactions. Repéré via les
// runtime errors Vercel du 2026-09-04.
export interface DataTableColumn<T> {
  key: keyof T & string;
  label: string;
  align?: "left" | "right" | "center";
  mono?: boolean;
  strong?: boolean;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  dense?: boolean;
  sortKey?: string;
  onSort?: (key: string) => void;
}

export function DataTable<T extends Record<string, React.ReactNode>>({
  columns,
  rows,
  dense = false,
  sortKey,
  onSort,
}: DataTableProps<T>) {
  const h = dense ? "var(--row-h-dense)" : "var(--row-h)";
  return (
    <div style={{ width: "100%", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-core)" }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                onClick={() => onSort?.(c.key)}
                style={{
                  textAlign: c.align || "left",
                  padding: "0 10px",
                  height: 28,
                  fontSize: "var(--type-micro-size)",
                  fontWeight: "var(--weight-regular)",
                  letterSpacing: "var(--type-micro-track)",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                  borderBottom: "1px solid var(--border-hairline)",
                  whiteSpace: "nowrap",
                  cursor: onSort ? "pointer" : "default",
                  userSelect: "none",
                }}
              >
                {c.label}
                {sortKey === c.key ? <Icon name="chevron-down" size={10} style={{ marginLeft: 3, verticalAlign: "middle" }} /> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--border-hairline)" }}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  style={{
                    padding: "0 10px",
                    height: h,
                    textAlign: c.align || "left",
                    fontSize: c.mono ? "var(--type-num-size)" : 13,
                    fontFamily: c.mono ? "var(--font-mono)" : "var(--font-core)",
                    color: c.strong ? "var(--text-strong)" : "var(--text-body)",
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
