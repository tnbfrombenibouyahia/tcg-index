import type { IndexSummary } from "@/lib/types";
import { HeadlineIndexCard } from "./HeadlineIndexCard";

export function HeadlineSection({ indices }: { indices: IndexSummary[] }) {
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      {indices.map((summary) => (
        <HeadlineIndexCard key={summary.code} summary={summary} />
      ))}
    </section>
  );
}
