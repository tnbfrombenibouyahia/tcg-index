import { getLocale, getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/format";

export async function LastUpdatedBadge({ asOf }: { asOf: string | null }) {
  const t = await getTranslations("lastUpdated");
  const locale = await getLocale();

  if (!asOf) {
    return <p className="text-sm text-muted-foreground">{t("none")}</p>;
  }

  return (
    <p className="text-sm text-muted-foreground">
      {t("label")} <span className="font-medium text-foreground">{formatDate(asOf, locale)}</span>
    </p>
  );
}
