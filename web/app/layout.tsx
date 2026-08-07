import type { Metadata } from "next";
import { Manrope, IBM_Plex_Mono } from "next/font/google";
import Script from "next/script";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { getUniverse } from "@/lib/universe";
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

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: t("title"),
    description: t("description"),
  };
}

// Racine minimale -- html/body/polices/thème/i18n uniquement. La coquille
// "app" (sidebar fixe + zone de contenu, cf. ancien layout.tsx) vit
// maintenant dans app/(app)/layout.tsx : la landing page (app/page.tsx) n'a
// pas de sidebar, seules les pages produit (dashboard, catalog, ...) en ont
// une -- d'où le découpage par route group plutôt qu'un layout unique.
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const universe = await getUniverse();

  return (
    <html
      lang={locale}
      data-universe={universe}
      className={`${manrope.variable} ${ibmPlexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full text-foreground">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
