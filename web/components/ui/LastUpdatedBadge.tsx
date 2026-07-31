import { formatDate } from "@/lib/format";

export function LastUpdatedBadge({ asOf }: { asOf: string | null }) {
  if (!asOf) {
    return (
      <p className="text-sm text-muted-foreground">Pas encore de données disponibles.</p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Dernière mise à jour : <span className="font-medium text-foreground">{formatDate(asOf)}</span>
    </p>
  );
}
