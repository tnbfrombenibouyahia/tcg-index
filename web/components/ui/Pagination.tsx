"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

// `basePath` optionnel : par défaut le chemin courant (usePathname), pour
// que ce composant reste réutilisable tel quel sur /transactions,
// /undervalued, /divergence, /grading-roi -- pas besoin de le passer sauf
// cas particulier (ex. lien vers une autre route que la page courante).
export function Pagination({
  page,
  totalPages,
  basePath,
}: {
  page: number;
  totalPages: number;
  basePath?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("pagination");
  const locale = useLocale();

  function goTo(target: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(target));
    router.push(`${basePath ?? pathname}?${params.toString()}`);
  }

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-4 pt-4">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => goTo(page - 1)}
        className="rounded-full border border-border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 hover:bg-muted transition-colors"
      >
        {t("previous")}
      </button>
      <span className="text-sm text-muted-foreground">
        {t("pageOf", { page: page.toLocaleString(locale), totalPages: totalPages.toLocaleString(locale) })}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => goTo(page + 1)}
        className="rounded-full border border-border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 hover:bg-muted transition-colors"
      >
        {t("next")}
      </button>
    </div>
  );
}
