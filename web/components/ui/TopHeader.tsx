import { getLocale, getTranslations } from "next-intl/server";
import { LanguageSelector } from "@/components/ui/LanguageSelector";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { UniverseSelector } from "@/components/ui/UniverseSelector";
import { AuthTrigger } from "@/components/dashboard/AuthTrigger";
import { getUniverse } from "@/lib/universe";

// ─────────────────────────────────────────────────────────────────────────────
// Header global (toutes les pages produit, cf. app/(app)/layout.tsx) --
// porté du header du mockup "TCG Terminal" : emblème + tagline, slider
// d'univers qui bascule tout l'accent (bleu/rouge, cf. --accent dans
// globals.css), langue, thème, compte. Un seul jeu de contrôles pour tout le
// site plutôt qu'un dupliqué par page -- remplace ce qui vivait avant dans
// le pied de la sidebar (NavBar.tsx) et la ligne de breadcrumb du dashboard.
// ─────────────────────────────────────────────────────────────────────────────

export async function TopHeader() {
  const locale = await getLocale();
  const universe = await getUniverse();
  const t = await getTranslations("dashboard.header");

  const isPKM = universe === "pokemon";
  const accent2 = isPKM ? "var(--accent-onepiece)" : "var(--accent-pokemon)";

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "20px",
        padding: "14px 32px",
        background: "var(--surface)",
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        borderBottom: "1px solid var(--border-soft)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "14px", flexShrink: 0 }}>
        <div
          style={{
            width: "34px",
            height: "34px",
            flexShrink: 0,
            borderRadius: "11px",
            background: `linear-gradient(135deg, var(--accent), ${accent2})`,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: "12px",
            letterSpacing: "0.3px",
            boxShadow: "0 0 16px color-mix(in srgb, var(--accent) 55%, transparent)",
          }}
        >
          {isPKM ? "PK" : "OP"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span style={{ fontWeight: 800, fontSize: "15px", letterSpacing: "0.5px", color: "var(--foreground)" }}>TCG TERMINAL</span>
          <span style={{ fontSize: "11px", color: "var(--foreground-muted)", letterSpacing: "0.4px" }}>{t("tagline")}</span>
        </div>
      </div>

      <div style={{ width: "128px", flexShrink: 0 }}>
        <UniverseSelector current={universe} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
        <LanguageSelector current={locale} />
        <ThemeToggle />
        <AuthTrigger />
      </div>
    </header>
  );
}
