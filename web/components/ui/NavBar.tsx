import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { LanguageSelector } from "@/components/ui/LanguageSelector";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

// ─────────────────────────────────────────────────────────────────────────────
// SideBar — Fixed left navigation, "Quiet Luxury / White Mode"
// ─────────────────────────────────────────────────────────────────────────────

export async function NavBar() {
  const t = await getTranslations("nav");
  const locale = await getLocale();

  const PRIMARY_NAV = [
    { href: "/", label: t("home"), icon: <HomeIcon /> },
    { href: "/catalog", label: t("catalog"), icon: <SearchIcon /> },
    { href: "/transactions", label: t("transactions"), icon: <TransactionsIcon /> },
    { href: "/sealed-ev", label: t("sealedEv"), icon: <BoxIcon /> },
    { href: "/undervalued", label: t("undervalued"), icon: <TrendingUpIcon /> },
    { href: "/grading-roi", label: t("gradingRoi"), icon: <GradingRoiIcon /> },
    { href: "/divergence", label: t("divergence"), icon: <DivergenceIcon /> },
    { href: "/live", label: t("live"), icon: <PulseIcon /> },
  ];

  return (
    <aside
      id="sidebar"
      style={{
        width: "192px",
        minWidth: "192px",
        background: "var(--surface-solid)",
        borderRight: "1px solid var(--border-soft)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
        flexShrink: 0,
        padding: "28px 0 20px",
        boxShadow: "1px 0 0 var(--border-softer)",
      }}
    >
      {/* Brand */}
      <div style={{ paddingLeft: "24px", paddingRight: "24px", marginBottom: "32px" }}>
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "9px",
            textDecoration: "none",
          }}
        >
          <div
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "10px",
              background: "var(--ink)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-text)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
              <path d="M9 21V12h6v9" />
            </svg>
          </div>
          <span
            style={{
              fontSize: "14px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--foreground)",
            }}
          >
            TCG Index
          </span>
        </Link>
      </div>

      {/* Primary Nav */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px", padding: "0 12px" }}>
        {PRIMARY_NAV.map((item) => (
          <SideLink key={item.label} {...item} />
        ))}
      </nav>

      {/* Footer */}
      <div
        style={{
          padding: "16px 24px 0",
          borderTop: "1px solid var(--border-soft)",
          marginTop: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <LanguageSelector current={locale} />
          <ThemeToggle />
        </div>
        <p style={{ fontSize: "11px", color: "var(--foreground-subtle)", margin: 0, lineHeight: 1.5 }}>{t("footer")}</p>
      </div>
    </aside>
  );
}

// ── Side link item ────────────────────────────────────────────────────────────
function SideLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 12px",
        borderRadius: "10px",
        textDecoration: "none",
        color: "var(--foreground-muted)",
        fontSize: "13px",
        fontWeight: 500,
        transition: "background 0.15s, color 0.15s",
      }}
      className="sidebar-link"
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

// ── Icons (line style, 15×15) ─────────────────────────────────────────────────
function HomeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function TransactionsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="7 16 3 12 7 8" />
      <polyline points="17 8 21 12 17 16" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  );
}
function BoxIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8z" />
      <path d="M3 8l9 5 9-5" />
      <path d="M12 13v8" />
    </svg>
  );
}
function PulseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l2.5-7L14 19l2.5-7H21" />
    </svg>
  );
}
function TrendingUpIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}
function GradingRoiIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
function DivergenceIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17c4-9 6-9 9 0" />
      <path d="M12 17c2-5 4-9 9-13" />
    </svg>
  );
}
