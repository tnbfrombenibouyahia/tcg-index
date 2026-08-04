"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocaleAction } from "@/app/actions/locale";
import type { Locale } from "@/i18n/config";

const OPTIONS: { code: Locale; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
  { code: "es", label: "ES" },
];

export function LanguageSelector({ current }: { current: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      style={{
        display: "flex",
        gap: "2px",
        background: "var(--surface-alt)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "2px",
      }}
    >
      {OPTIONS.map((opt) => {
        const active = current === opt.code;
        return (
          <button
            key={opt.code}
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await setLocaleAction(opt.code);
                router.refresh();
              })
            }
            style={{
              padding: "4px 8px",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.02em",
              border: "none",
              cursor: isPending ? "default" : "pointer",
              background: active ? "var(--ink)" : "transparent",
              color: active ? "var(--ink-text)" : "var(--foreground-muted)",
              opacity: isPending ? 0.6 : 1,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
