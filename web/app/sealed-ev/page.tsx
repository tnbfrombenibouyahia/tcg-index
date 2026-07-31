import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { SealedEvTable } from "@/components/sealed-ev/SealedEvTable";
import { getSealedEv } from "@/lib/queries/sealedEv";
import type { SealedEvMode } from "@/lib/types";

export default async function SealedEvPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const modeRaw = Array.isArray(raw.mode) ? raw.mode[0] : raw.mode;
  const mode: SealedEvMode = modeRaw === "top10" ? "top10" : "total";

  const rows = await getSealedEv({ mode, limit: 50 });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Scellés sous-évalués</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Compare le prix de chaque Booster Box à la valeur de ses singles en loose (ungraded).
          Signal comparatif entre sets, pas une espérance de gain garantie — un ratio élevé peut
          venir d&apos;une seule carte très rare, pas d&apos;un set globalement riche.
        </p>
      </div>

      <div className="mb-6 flex items-center gap-2">
        <ModeLink mode="total" active={mode === "total"}>
          Total du set
        </ModeLink>
        <ModeLink mode="top10" active={mode === "top10"}>
          Top 10 cartes
        </ModeLink>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Pas encore de données"
          description="Le calcul du ratio EV n'a pas encore tourné pour des scellés avec prix et singles disponibles."
        />
      ) : (
        <SealedEvTable rows={rows} mode={mode} />
      )}
    </div>
  );
}

function ModeLink({
  mode,
  active,
  children,
}: {
  mode: SealedEvMode;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/sealed-ev?mode=${mode}`}
      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
