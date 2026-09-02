import { SetAnalysisScreen } from "@/components/cardquant/setanalysis/SetAnalysisScreen";
import { getSetSummary, getSetTopCards, getSealedPriceByGeneration, getMostActiveSetCode } from "@/lib/queries/setAnalysis";
import { getSealedEv } from "@/lib/queries/sealedEv";
import { buildSyncLabel } from "@/lib/cardquant/syncLabel";

// ─────────────────────────────────────────────────────────────────────────────
// Analyse set "CardQuant" (redesign Slabline, cf. mémoire projet
// "cardquant-rebrand") -- écran neuf, aucune page /set-analysis n'existait
// avant côté web/. Toute la couche de données est nouvelle
// (lib/queries/setAnalysis.ts), sauf "Ouvrabilité du set" qui réutilise
// lib/queries/sealedEv.ts (déjà en prod sur /sealed-ev) filtré par set_code.
//
// `?set=CODE` pilote l'écran ; sans lui, on retombe sur le set le plus
// échangé des 30 derniers jours (getMostActiveSetCode) plutôt qu'un état
// vide "cherche un set".
// ─────────────────────────────────────────────────────────────────────────────

export default async function CardQuantSetAnalysisPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const requestedSet = Array.isArray(raw.set) ? raw.set[0] : raw.set;

  const setCode = requestedSet || (await getMostActiveSetCode());

  if (!setCode) {
    return (
      <div style={{ padding: 40, color: "#8A918C", background: "#000", minHeight: "100vh" }}>
        Aucun set avec des ventes récentes n&apos;a été trouvé.
      </div>
    );
  }

  const summary = await getSetSummary(setCode);
  if (!summary) {
    return (
      <div style={{ padding: 40, color: "#8A918C", background: "#000", minHeight: "100vh" }}>
        Set &laquo;&nbsp;{setCode}&nbsp;&raquo; introuvable.
      </div>
    );
  }

  const [topCards, sealedByGeneration, sealedEvRows, syncLabel] = await Promise.all([
    getSetTopCards(setCode, { sortBy: "volume", windowDays: 30, limit: 20 }),
    getSealedPriceByGeneration(summary.tcg),
    getSealedEv({ mode: "total", setCode, limit: 1 }),
    buildSyncLabel(),
  ]);

  return (
    <SetAnalysisScreen
      syncLabel={syncLabel}
      summary={summary}
      topCards={topCards}
      sealedByGeneration={sealedByGeneration}
      sealedEv={sealedEvRows[0] ?? null}
    />
  );
}
