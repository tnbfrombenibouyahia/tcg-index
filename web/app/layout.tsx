import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { NavBar } from "@/components/ui/NavBar";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "TCG Index — Indice de marché Pokémon & One Piece",
  description:
    "Indice de marché communautaire pour Pokémon et One Piece — méthodologie publique, données transparentes. Suivez l'évolution du marché TCG en temps réel.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${plusJakartaSans.variable} h-full antialiased`}
    >
      <body
        className="min-h-full text-foreground"
        style={{ display: "flex", flexDirection: "row" }}
      >
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
      </body>
    </html>
  );
}
