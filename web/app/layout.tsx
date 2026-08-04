import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { NavBar } from "@/components/ui/NavBar";
import "./globals.css";

// Pose l'attribut data-theme sur <html> avant le premier paint (beforeInteractive)
// pour éviter un flash du mauvais thème -- localStorage prime sur la préférence
// OS, elle-même le fallback par défaut si l'utilisateur n'a jamais basculé.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var theme = stored === "dark" || stored === "light"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();
`;

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${plusJakartaSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full text-foreground"
        style={{ display: "flex", flexDirection: "row" }}
      >
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <NextIntlClientProvider messages={messages}>
          {/* ── Fixed left sidebar ───────────────────────────────────────────── */}
          <NavBar />

          {/* ── Main content area ────────────────────────────────────────────── */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              background: "var(--bg-from)",
            }}
          >
            {/* Page content */}
            <main style={{ flex: 1, overflowY: "auto" }}>{children}</main>
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
