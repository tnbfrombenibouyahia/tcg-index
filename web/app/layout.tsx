import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { NavBar } from "@/components/ui/NavBar";
import "./globals.css";

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
    >
      <body
        className="min-h-full text-foreground"
        style={{ display: "flex", flexDirection: "row" }}
      >
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
