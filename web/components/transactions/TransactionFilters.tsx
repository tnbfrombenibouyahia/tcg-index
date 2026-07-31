"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { GRADE_LABELS, TCGS, type Grade } from "@/lib/constants";
import type { SetOption } from "@/lib/types";
import { CardSearchCombobox } from "./CardSearchCombobox";

interface TransactionFiltersProps {
  sets: SetOption[];
  grades: readonly Grade[];
}

export function TransactionFilters({ sets, grades }: TransactionFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tcg = searchParams.get("tcg") ?? "";
  const setCode = searchParams.get("set_code") ?? "";
  const grade = searchParams.get("grade") ?? "";

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    // changer un filtre invalide la sélection de carte/set en aval (dépendent du TCG)
    if (key === "tcg") {
      params.delete("set_code");
      params.delete("item_id");
      params.delete("item_name");
    }
    params.set("page", "1");
    router.push(`/transactions?${params.toString()}`);
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">TCG</label>
        <select
          value={tcg}
          onChange={(e) => updateParam("tcg", e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">Tous</option>
          {TCGS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Set</label>
        <select
          value={setCode}
          onChange={(e) => updateParam("set_code", e.target.value)}
          disabled={!tcg}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">{tcg ? "Tous les sets" : "Choisir un TCG d'abord"}</option>
          {sets.map((s) => (
            <option key={s.setCode} value={s.setCode}>
              {s.setCode} ({s.itemCount})
            </option>
          ))}
        </select>
      </div>

      <CardSearchCombobox tcg={tcg || undefined} />

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Grade</label>
        <select
          value={grade}
          onChange={(e) => updateParam("grade", e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">Tous</option>
          {grades.map((g) => (
            <option key={g} value={g}>
              {GRADE_LABELS[g]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
