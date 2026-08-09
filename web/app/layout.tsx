import type { Metadata } from "next";
import { Manrope, IBM_Plex_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { getUniverse } from "@/lib/universe";
import "./globals.css";

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

// Racine minimale -- html/body/polices/i18n uniquement. La coquille
// "app" (sidebar fixe + zone de contenu, cf. ancien layout.tsx) vit
// maintenant dans app/(app)/layout.tsx : la landing page (app/page.tsx) n'a
// pas de sidebar, seules les pages produit (dashboard, catalog, ...) en ont
// une -- d'où le découpage par route group plutôt qu'un layout unique.
//
// Thème clair unique pour tout le site (demande utilisateur 2026-08-09) --
// le dark mode (ThemeToggle, THEME_INIT_SCRIPT anti-flash, bloc
// :root[data-theme="dark"] de globals.css) a été retiré : plus d'attribut
// data-theme à poser, la cascade CSS retombe toujours sur :root (clair).
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
    >
      <body className="min-h-full text-foreground">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
