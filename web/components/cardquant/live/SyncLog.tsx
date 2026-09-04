import type { SyncRun } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";
import { STEP_LABEL } from "./liveCopy";

const TCG_LABEL: Record<string, string> = { pokemon: "Pokémon", "one-piece": "One Piece" };
const DOT_COLOR: Record<SyncRun["status"], string> = { success: "var(--up-600)", error: "var(--down-500)", running: "var(--warn-400)" };

// "Journal des synchros" de l'écran Live CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- les runs les plus récents de recentRuns, réel.
export function SyncLog({ runs }: { runs: SyncRun[] }) {
  const entries = runs.slice(0, 9);

  return (
    <section style={{ background: "var(--white)", border: "1px solid var(--border-hairline)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 14, display: "flex", flexDirection: "column", gap: 11, flex: "0 0 auto" }}>
      <span style={{ fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Journal des synchros</span>
      {entries.length === 0 ? (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Aucun run récent.</span>
      ) : (
        entries.map((r) => (
          <div key={r.id} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-muted)", width: 46, flex: "none", paddingTop: 1 }}>
              {new Date(r.startedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: DOT_COLOR[r.status], flex: "none", marginTop: 6 }} />
            <span style={{ flex: 1, fontSize: 12, lineHeight: 1.4, color: "var(--text-strong)" }}>
              {STEP_LABEL[r.step] ?? r.step} {r.tcg ? `· ${TCG_LABEL[r.tcg] ?? r.tcg}` : ""} ·{" "}
              {r.status === "success" ? "réussi" : r.status === "error" ? "échec" : "en cours"}
              {r.rowsWritten != null ? ` · ${r.rowsWritten.toLocaleString("fr-FR")} lignes` : ""}
              <span style={{ color: "var(--text-muted)" }}> · {formatRelativeTime(r.startedAt, "fr")}</span>
            </span>
          </div>
        ))
      )}
    </section>
  );
}
