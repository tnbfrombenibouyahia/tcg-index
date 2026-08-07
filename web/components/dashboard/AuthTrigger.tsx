"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AuthModal, type AuthMode } from "@/components/auth/AuthModal";

// Avatar du dashboard -- ouvre la modale connexion/inscription partagée
// (components/auth/AuthModal.tsx). Pas de gate : le dashboard reste public,
// cf. mémoire projet "project_terminal_redesign".

export function AuthTrigger() {
  const t = useTranslations("dashboard.auth");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("signup");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("openLabel")}
        title={t("openLabel")}
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          background: "var(--surface-alt)",
          border: "1px solid var(--border)",
          cursor: "pointer",
        }}
      />
      <AuthModal open={open} mode={mode} onClose={() => setOpen(false)} onModeChange={setMode} />
    </>
  );
}
