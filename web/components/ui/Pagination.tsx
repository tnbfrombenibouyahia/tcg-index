"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

export function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("transactions.pagination");
  const locale = useLocale();

  function goTo(target: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(target));
    router.push(`/transactions?${params.toString()}`);
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
