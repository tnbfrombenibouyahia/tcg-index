import { getTranslations } from "next-intl/server";
import { CatalogSearch } from "@/components/catalog/CatalogSearch";
import type { Tcg } from "@/lib/constants";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const get = (key: string) => {
    const v = raw[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const initialQuery = get("q") ?? "";
  const tcgRaw = get("tcg");
  const initialTcg: Tcg | undefined = tcgRaw === "pokemon" || tcgRaw === "one-piece" ? tcgRaw : undefined;

  const t = await getTranslations("catalog");

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground leading-relaxed">{t("description")}</p>
      </div>

      <CatalogSearch initialQuery={initialQuery} initialTcg={initialTcg} />
    </div>
  );
}
