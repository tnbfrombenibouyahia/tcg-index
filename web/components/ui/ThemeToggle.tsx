"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type Theme = "light" | "dark";
const STORAGE_KEY = "theme";

// Lu par ThemeScript (layout.tsx) au premier paint pour éviter le flash --
// ce composant se contente de refléter/écrire le même attribut + la même
// clé localStorage après hydratation.
function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  window.localStorage.setItem(STORAGE_KEY, theme);
}

export function ThemeToggle() {
  // Défaut "light" côté SSR (cf. ThemeScript qui corrige avant peinture côté
  // client) -- évite d'avoir à lire localStorage pendant le rendu serveur.
  const [theme, setTheme] = useState<Theme>("light");
  const t = useTranslations("nav");

  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
  }, []);

  const isDark = theme === "dark";
  const label = isDark ? t("themeToLight") : t("themeToDark");

  return (
    <button
      type="button"
      id="theme-toggle"
      onClick={() => {
        const next: Theme = isDark ? "light" : "dark";
        applyTheme(next);
        setTheme(next);
      }}
      aria-label={label}
      title={label}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "30px",
        height: "30px",
        borderRadius: "8px",
        border: "1px solid var(--border)",
        background: "var(--surface-alt)",
        color: "var(--foreground-muted)",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
