import type { IndexSummary } from "@/lib/types";
import { SubIndexTile } from "./SubIndexTile";

export function SubIndexGrid({ indices }: { indices: IndexSummary[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Détail par catégorie
      </h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {indices.map((summary) => (
          <SubIndexTile key={summary.code} summary={summary} />
        ))}
      </div>
    </section>
  );
}
