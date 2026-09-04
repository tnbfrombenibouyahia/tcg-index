import type { SyncRun } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";
import { STEP_LABEL } from "./liveCopy";

// "Attention requise" de l'écran Live CardQuant (cf. mémoire projet
// "cardquant-rebrand") -- l'erreur la plus récente de getRecentErrors (48h,
// cf. son commentaire), pas un texte statique comme dans le mockup. Rendu
// nul (pas de section) quand il n'y a aucune erreur -- cohérent avec
// l'ancien ErrorsPanel, qui annonçait explicitement "rien à débugger"
// plutôt que de simplement disparaître ; ici la place est reprise par
// TopStatusBar (déjà vert quand tout va bien).
export function AttentionPanel({ errors }: { errors: SyncRun[] }) {
  if (errors.length === 0) return null;
  const latest = errors[0];

  return (
    <section style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-strong)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={{ fontSize: "var(--type-micro-size)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Attention requise</span>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--text-strong)" }}>
        {STEP_LABEL[latest.step] ?? latest.step} en échec · {formatRelativeTime(latest.startedAt, "fr")}
        {errors.length > 1 ? ` · ${errors.length - 1} autre${errors.length > 2 ? "s" : ""} erreur${errors.length > 2 ? "s" : ""} récente${errors.length > 2 ? "s" : ""}` : ""}
      </p>
      {latest.detail ? (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, lineHeight: 1.4, color: "var(--down-500)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{latest.detail}</span>
      ) : null}
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--down-500)" }} />
        À revérifier au prochain cycle de synchro
      </span>
    </section>
  );
}
