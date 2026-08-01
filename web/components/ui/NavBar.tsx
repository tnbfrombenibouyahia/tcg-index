import Link from "next/link";

// ─────────────────────────────────────────────────────────────────────────────
// SideBar — Fixed left navigation, "Quiet Luxury / White Mode"
// ─────────────────────────────────────────────────────────────────────────────

const PRIMARY_NAV = [
  { href: "/", label: "Accueil", icon: <HomeIcon /> },
  { href: "/transactions", label: "Transactions", icon: <TransactionsIcon /> },
  { href: "/sealed-ev", label: "Scellés sous-évalués", icon: <BoxIcon /> },
  { href: "/live", label: "Live Market Data", icon: <PulseIcon /> },
];

export function NavBar() {
  return (
    <aside
      id="sidebar"
      style={{
        width: "192px",
        minWidth: "192px",
        background: "#FFFFFF",
        borderRight: "1px solid rgba(26,26,26,0.07)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
        flexShrink: 0,
        padding: "28px 0 20px",
        boxShadow: "1px 0 0 rgba(26,26,26,0.04)",
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
              background: "#000000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
              <path d="M9 21V12h6v9" />
            </svg>
          </div>
          <span
            style={{
              fontSize: "14px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "#1A1A1A",
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
          borderTop: "1px solid rgba(26,26,26,0.07)",
          marginTop: "auto",
        }}
      >
        <p style={{ fontSize: "11px", color: "#B8B2AC", margin: 0, lineHeight: 1.5 }}>
          Données publiques · méthodologie transparente
        </p>
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
        color: "#8A8480",
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
