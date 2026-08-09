"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { setUniverseAction } from "@/app/actions/universe";
import type { Tcg } from "@/lib/constants";
import { formatUsd } from "@/lib/format";
import type { LandingCard } from "@/lib/landing";
import { AuthModal, type AuthMode } from "@/components/auth/AuthModal";
import { LanguageSelector } from "@/components/ui/LanguageSelector";
import { TcgIcon } from "@/components/homepage/TcgIcon";

// ─────────────────────────────────────────────────────────────────────────────
// Landing page -- portée depuis "Landing Page.dc.html" (2e export, avec hero
// animé) vers un vrai composant React. Fixe en thème sombre (pas de bascule
// clair/sombre ici : c'est une page de marque, comme dans le mockup d'origine),
// contrairement au dashboard qui suit le thème choisi. Le toggle d'univers
// ici ne change QUE l'accent (bleu/rouge) -- il ne filtre pas les cartes du
// hero, qui piochent dans un pool mêlant Pokémon et One Piece, exactement
// comme le mockup ("cardPool" fixe, indépendant de "universe").
// ─────────────────────────────────────────────────────────────────────────────

const ACCENT: Record<Tcg, string> = { pokemon: "#3b82f6", "one-piece": "#dc2626" };
const ACCENT2: Record<Tcg, string> = { pokemon: "#dc2626", "one-piece": "#3b82f6" };
const GREEN = "#10b981";
const RED = "#ef4444";
const BG = "#050505";
const SURFACE = "#0e0e10";
const SURFACE_ALT = "#131315";
const BORDER = "rgba(255,255,255,0.08)";
const TEXT = "#ffffff";
const TEXT_DIM = "#a0a0a0";

function glass(opacity = 0.05): React.CSSProperties {
  return {
    background: `linear-gradient(165deg, rgba(255,255,255,${opacity + 0.02}), rgba(255,255,255,${opacity * 0.4}))`,
    backdropFilter: "blur(20px) saturate(150%)",
    WebkitBackdropFilter: "blur(20px) saturate(150%)",
    border: "1px solid " + BORDER,
    boxShadow: "0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)",
  };
}

function interleave(a: LandingCard[], b: LandingCard[]): LandingCard[] {
  const out: LandingCard[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

type Phase = "flat" | "drop" | "rise" | "hold";

export function LandingPage({
  pokemonCards,
  onePieceCards,
  itemCount,
  saleCount,
  locale,
  initialUniverse,
}: {
  pokemonCards: LandingCard[];
  onePieceCards: LandingCard[];
  itemCount: number;
  saleCount: number;
  locale: string;
  initialUniverse: Tcg;
}) {
  const t = useTranslations("landing");
  const router = useRouter();

  const [universe, setUniverse] = useState<Tcg>(initialUniverse);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signup");

  const [scrollRot, setScrollRot] = useState(0);
  const [tiltX, setTiltX] = useState(0);
  const [tiltY, setTiltY] = useState(0);
  const [chartPoints, setChartPoints] = useState<number[]>(() => Array(20).fill(50));
  const [cardIndex, setCardIndex] = useState(0);
  const [phaseTrend, setPhaseTrend] = useState<Phase>("flat");
  const [cardOpacity, setCardOpacity] = useState(0);
  const [badgeBlue, setBadgeBlue] = useState(false);
  const [badgeRed, setBadgeRed] = useState(false);
  const [ticketLine1, setTicketLine1] = useState(t("ticketPending"));
  const [ticketLine2, setTicketLine2] = useState(t("ticketPending"));
  const [roiDisplay, setRoiDisplay] = useState(0);
  const [profitDollarDisplay, setProfitDollarDisplay] = useState(0);

  const pool = useRef(interleave(pokemonCards, onePieceCards)).current;
  const cardIndexRef = useRef(0);
  const phaseTrendRef = useRef<Phase>("flat");
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cardStageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    phaseTrendRef.current = phaseTrend;
  }, [phaseTrend]);

  function clearAllTimers() {
    timersRef.current.forEach((id) => {
      clearTimeout(id);
      clearInterval(id);
    });
    timersRef.current = [];
  }

  function animateValue(setter: (v: number) => void, target: number, durationMs = 700) {
    const steps = Math.max(10, Math.round(durationMs / 28));
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setter(Math.round(target * (i / steps) * 10) / 10);
      if (i >= steps) clearInterval(timer);
    }, 28);
    timersRef.current.push(timer);
  }

  function runCycle() {
    if (pool.length === 0) return;
    const nextIndex = (cardIndexRef.current + 1) % pool.length;
    cardIndexRef.current = nextIndex;
    const card = pool[nextIndex];
    const profitDollar = card.sellPrice - card.buyPrice;

    clearAllTimers();
    setCardIndex(nextIndex);
    setPhaseTrend("flat");
    setCardOpacity(0);
    setBadgeBlue(false);
    setBadgeRed(false);
    setTicketLine1(t("ticketPending"));
    setTicketLine2(t("ticketPending"));
    setRoiDisplay(0);
    setProfitDollarDisplay(0);

    timersRef.current.push(setTimeout(() => setCardOpacity(1), 80));
    timersRef.current.push(
      setTimeout(() => {
        setPhaseTrend("drop");
        setBadgeBlue(true);
        setTicketLine1(t("ticketBuy", { price: formatUsd(card.buyPrice) }));
      }, 2000)
    );
    timersRef.current.push(
      setTimeout(() => {
        setPhaseTrend("rise");
        animateValue(setRoiDisplay, card.roiPct, 1900);
        animateValue(setProfitDollarDisplay, profitDollar, 1900);
      }, 3000)
    );
    timersRef.current.push(
      setTimeout(() => {
        setPhaseTrend("hold");
        setBadgeRed(true);
        setTicketLine2(t("ticketSell", { price: formatUsd(card.sellPrice) }));
        setRoiDisplay(card.roiPct);
        setProfitDollarDisplay(profitDollar);
      }, 6000)
    );
    timersRef.current.push(
      setTimeout(() => {
        setCardOpacity(0);
        setBadgeBlue(false);
        setBadgeRed(false);
      }, 8000)
    );
    timersRef.current.push(setTimeout(() => runCycle(), 8700));
  }

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || 0;
      const rot = Math.max(-24, Math.min(24, (y - 60) * 0.07));
      setScrollRot(rot);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    runCycle();

    const chartTimer = setInterval(() => {
      setChartPoints((prev) => {
        const targets: Record<Phase, number> = { flat: 50, drop: 18, rise: 88, hold: 85 };
        const target = targets[phaseTrendRef.current];
        const last = prev[prev.length - 1];
        const next = Math.max(8, Math.min(92, last + (target - last) * 0.3 + (Math.random() * 6 - 3)));
        return [...prev.slice(1), next];
      });
    }, 250);

    return () => {
      window.removeEventListener("scroll", onScroll);
      clearInterval(chartTimer);
      clearAllTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onCardMouseMove(e: React.MouseEvent) {
    const el = cardStageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTiltX(py * -16);
    setTiltY(px * 16);
  }
  function onCardMouseLeave() {
    setTiltX(0);
    setTiltY(0);
  }

  function selectUniverse(next: Tcg) {
    setUniverse(next);
    void setUniverseAction(next);
  }

  function openAuth(mode: AuthMode) {
    setAuthMode(mode);
    setAuthOpen(true);
  }

  const isPKM = universe === "pokemon";
  const accent = ACCENT[universe];
  const accent2 = ACCENT2[universe];
  const roiRounded = Math.round(roiDisplay);
  const card = pool.length > 0 ? pool[cardIndex] : null;

  const chartMax = chartPoints.length - 1;
  const chartPointsStr = chartPoints.map((v, i) => `${(i * 200) / chartMax},${90 - v * 0.85}`).join(" ");
  const lastY = 90 - chartPoints[chartPoints.length - 1] * 0.85;
  const chartLabelTopPct = Math.max(6, Math.min(88, (lastY / 90) * 100));

  // "live" (Live Market) retiré -- demande utilisateur du 2026-08-09,
  // le widget/la page correspondants n'existent plus côté produit.
  const features = [
    { key: "catalogue", shape: "ring" as const },
    { key: "transactions", shape: "hands" as const },
    { key: "undervalued", shape: "arrow" as const },
    { key: "divergences", shape: "delta" as const },
    { key: "grading", shape: "card" as const },
  ];

  const stats = [
    { value: itemCount >= 1000 ? `${Math.floor(itemCount / 1000)}K+` : `${itemCount}`, label: t("statCards") },
    { value: saleCount >= 1000 ? `${Math.floor(saleCount / 1000)}K+` : `${saleCount}`, label: t("statSales") },
    { value: "24/7", label: t("statRealtime") },
    { value: t("statUniversesValue"), label: t("statUniversesLabel") },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `radial-gradient(circle at 20% 0%, ${accent}12, transparent 45%), radial-gradient(circle at 85% 15%, ${accent2}0a, transparent 50%), ${BG}`,
        color: TEXT,
        fontFamily: "var(--font-manrope), system-ui, sans-serif",
        position: "relative",
        overflowX: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "1px",
          background: `linear-gradient(90deg, transparent, ${accent}55, transparent)`,
        }}
      />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "24px",
          padding: "18px 48px",
          background: "rgba(5,5,5,0.7)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderBottom: "1px solid " + BORDER,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "9px",
              background: `linear-gradient(135deg, ${accent}, ${accent2})`,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "11px",
              letterSpacing: "0.3px",
              boxShadow: `0 0 16px ${accent}55`,
            }}
          >
            TX
          </div>
          <span style={{ fontWeight: 800, fontSize: "14px", letterSpacing: "1px" }}>TCG TERMINAL</span>
        </div>

        <div
          style={{
            position: "relative",
            display: "flex",
            background: SURFACE_ALT,
            border: "1px solid " + BORDER,
            borderRadius: "999px",
            padding: "3px",
            width: "112px",
            flexShrink: 0,
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: "3px",
              bottom: "3px",
              left: isPKM ? "3px" : "50%",
              width: "calc(50% - 3px)",
              background: accent,
              borderRadius: "999px",
              boxShadow: `0 0 14px ${accent}55`,
              transition: "left 0.25s ease, background 0.25s ease",
            }}
          />
          {(["pokemon", "one-piece"] as Tcg[]).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => selectUniverse(u)}
              aria-pressed={universe === u}
              aria-label={u === "pokemon" ? "Pokémon" : "One Piece"}
              style={{ position: "relative", zIndex: 1, flex: 1, border: "none", background: "transparent", padding: "8px 0", cursor: "pointer" }}
            >
              <span style={{ width: "16px", height: "16px", display: "block", margin: "0 auto" }}>
                <TcgIcon tcg={u} />
              </span>
            </button>
          ))}
        </div>

        <nav style={{ display: "flex", alignItems: "center", gap: "22px", flexShrink: 0 }}>
          <a href="#features" style={{ color: TEXT_DIM, fontSize: "14px", fontWeight: 600, textDecoration: "none" }}>
            {t("navFeatures")}
          </a>
          <LanguageSelector current={locale} />
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              type="button"
              onClick={() => openAuth("login")}
              style={{ padding: "9px 18px", borderRadius: "9px", fontSize: "13.5px", fontWeight: 700, color: TEXT, border: "1px solid " + BORDER, background: "transparent", cursor: "pointer" }}
            >
              {t("navLogin")}
            </button>
            <button
              type="button"
              onClick={() => openAuth("signup")}
              style={{ padding: "9px 18px", borderRadius: "9px", fontSize: "13.5px", fontWeight: 700, color: "#fff", background: accent, border: "none", cursor: "pointer", boxShadow: `0 0 18px ${accent}55` }}
            >
              {t("navSignup")}
            </button>
          </div>
        </nav>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section
        style={{
          padding: "100px 48px 90px",
          display: "grid",
          gridTemplateColumns: "1.05fr 0.95fr",
          alignItems: "center",
          gap: "40px",
          maxWidth: "1240px",
          margin: "0 auto",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", position: "relative", zIndex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-ibm-plex-mono), monospace", fontSize: "12px", fontWeight: 600, letterSpacing: "1.5px", color: accent, marginBottom: "22px" }}>
            {t("kicker")}
          </div>
          <h1 style={{ fontSize: "50px", fontWeight: 800, lineHeight: 1.12, letterSpacing: "-1px", margin: "0 0 22px" }}>
            {t("h1Line1")}
            <br />
            {t("h1Line2")}
          </h1>
          <p style={{ fontSize: "17px", lineHeight: 1.6, color: TEXT_DIM, maxWidth: "540px", margin: "0 0 12px" }}>{t("heroSub")}</p>
          <p style={{ fontSize: "13px", color: TEXT_DIM, opacity: 0.75, maxWidth: "520px", margin: "0 0 34px", fontFamily: "var(--font-ibm-plex-mono), monospace" }}>
            {t("heroSubNote")}
          </p>
          <div style={{ display: "flex", gap: "14px", marginTop: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => openAuth("signup")}
              style={{ padding: "14px 26px", borderRadius: "11px", fontSize: "15px", fontWeight: 700, color: "#fff", background: accent, border: "none", cursor: "pointer", boxShadow: `0 0 22px ${accent}66` }}
            >
              {t("ctaSignup")}
            </button>
            <button
              type="button"
              onClick={() => openAuth("login")}
              style={{ padding: "14px 26px", borderRadius: "11px", fontSize: "15px", fontWeight: 700, color: TEXT, background: "transparent", border: "1px solid " + BORDER, cursor: "pointer" }}
            >
              {t("ctaLogin")}
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 0, marginTop: "56px", width: "100%", boxSizing: "border-box", ...glass(0.04), borderRadius: "16px", padding: 0 }}>
            {stats.map((s, i) => (
              <div key={i} style={{ flex: "1 1 auto", minWidth: 0, padding: "20px 18px", borderRight: i < stats.length - 1 ? "1px solid " + BORDER : "none", textAlign: "center" }}>
                <div style={{ fontFamily: "var(--font-ibm-plex-mono), monospace", fontSize: "24px", fontWeight: 700 }}>{s.value}</div>
                <div style={{ fontSize: "11.5px", color: TEXT_DIM, marginTop: "6px", letterSpacing: "0.3px" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Carte animée */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "22px", minWidth: 0, width: "100%" }}>
          {card ? (
            <>
              <div
                ref={cardStageRef}
                onMouseMove={onCardMouseMove}
                onMouseLeave={onCardMouseLeave}
                style={{
                  perspective: "1400px",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  position: "relative",
                  animation: "floatY 6s ease-in-out infinite",
                  overflow: "visible",
                  isolation: "isolate",
                  width: "100%",
                  maxWidth: "320px",
                  opacity: cardOpacity,
                  transition: "opacity 0.7s ease",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    maxWidth: "300px",
                    height: "400px",
                    borderRadius: "16px",
                    position: "relative",
                    overflow: "hidden",
                    boxShadow: `0 24px 50px rgba(0,0,0,0.55), 0 0 24px ${accent}1a`,
                    transformStyle: "preserve-3d",
                    transform: `rotateY(${10 + scrollRot + tiltY}deg) rotateX(${-7 + tiltX}deg) rotateZ(-2deg)`,
                    transition: "transform 0.08s ease-out",
                    background: SURFACE_ALT,
                  }}
                >
                  {card.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.imageUrl} alt={card.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div
                      aria-hidden
                      style={{
                        width: "100%",
                        height: "100%",
                        background: `repeating-linear-gradient(135deg, ${SURFACE} 0 10px, ${SURFACE_ALT} 10px 20px)`,
                      }}
                    />
                  )}
                  <div style={{ position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none" }}>
                    <svg viewBox="0 0 200 90" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
                      <polyline points={chartPointsStr} style={{ fill: "none", stroke: "#39ff8f", strokeWidth: 2, filter: "drop-shadow(0 0 5px #39ff8f)" }} />
                    </svg>
                    <div
                      style={{
                        position: "absolute",
                        top: `${chartLabelTopPct}%`,
                        right: "4%",
                        transform: "translate(0,-50%)",
                        fontFamily: "var(--font-ibm-plex-mono), monospace",
                        fontSize: "13px",
                        fontWeight: 700,
                        color: "#39ff8f",
                        textShadow: "0 0 8px #39ff8f",
                        opacity: phaseTrend === "rise" || phaseTrend === "hold" ? 1 : 0,
                        transition: "opacity 0.15s linear, top 0.2s linear",
                      }}
                    >
                      +${Math.round(profitDollarDisplay)}
                    </div>
                  </div>
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: "14px",
                      pointerEvents: "none",
                      mixBlendMode: "screen",
                      background: `linear-gradient(${105 + tiltY * 3}deg, transparent 32%, rgba(255,255,255,${0.22 + Math.abs(tiltX) * 0.015}) 48%, transparent 64%)`,
                    }}
                  />
                </div>
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    bottom: "-24px",
                    width: "180px",
                    height: "24px",
                    background: `radial-gradient(ellipse at center, ${accent}28, transparent 75%)`,
                    filter: "blur(4px)",
                    zIndex: -1,
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%", maxWidth: "300px", boxSizing: "border-box" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "7px",
                    padding: "7px 12px",
                    borderRadius: "20px",
                    background: "rgba(59,130,246,0.14)",
                    border: `1px solid ${accent}55`,
                    fontSize: "10.5px",
                    fontWeight: 700,
                    color: accent,
                    fontFamily: "var(--font-ibm-plex-mono), monospace",
                    animation: badgeBlue ? "markerPulse 2.4s ease-in-out infinite" : "none",
                    opacity: badgeBlue ? 1 : 0.18,
                    transition: "opacity 0.4s",
                    boxSizing: "border-box",
                    minWidth: 0,
                  }}
                >
                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: accent, flexShrink: 0, boxShadow: `0 0 8px ${accent}` }} />
                  <span>{t("markerBlue")}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "7px",
                    padding: "7px 12px",
                    borderRadius: "20px",
                    background: "rgba(239,68,68,0.14)",
                    border: `1px solid ${RED}55`,
                    fontSize: "10.5px",
                    fontWeight: 700,
                    color: RED,
                    fontFamily: "var(--font-ibm-plex-mono), monospace",
                    animation: badgeRed ? "markerPulse 2.4s ease-in-out infinite 0.2s" : "none",
                    opacity: badgeRed ? 1 : 0.18,
                    transition: "opacity 0.4s",
                    boxSizing: "border-box",
                    minWidth: 0,
                  }}
                >
                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: RED, flexShrink: 0, boxShadow: `0 0 8px ${RED}` }} />
                  <span>{t("markerRed", { roi: roiRounded })}</span>
                </div>
              </div>

              <div style={{ width: "100%", maxWidth: "300px", boxSizing: "border-box", ...glass(0.04), borderRadius: "14px", padding: "16px 18px" }}>
                <div style={{ fontSize: "13.5px", fontWeight: 700, marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                  {card.name}{" "}
                  <span style={{ fontSize: "10px", fontWeight: 600, color: TEXT_DIM, fontFamily: "var(--font-ibm-plex-mono), monospace" }}>
                    {card.tcg === "pokemon" ? "Pokémon" : "One Piece"}
                  </span>
                </div>
                <div style={{ height: "1px", background: BORDER, margin: "12px 0 10px" }} />
                <div style={{ fontFamily: "var(--font-ibm-plex-mono), monospace", fontSize: "11px", color: TEXT_DIM, marginBottom: "5px" }}>{ticketLine1}</div>
                <div style={{ fontFamily: "var(--font-ibm-plex-mono), monospace", fontSize: "11px", color: TEXT_DIM, marginBottom: "5px" }}>{ticketLine2}</div>
                <div style={{ fontFamily: "var(--font-ibm-plex-mono), monospace", fontSize: "12px", fontWeight: 700, color: GREEN, marginTop: "6px" }}>
                  {t("profitRow", { roi: roiRounded, amount: formatUsd(Math.round(profitDollarDisplay)) })}
                </div>
              </div>
            </>
          ) : (
            <p style={{ fontSize: "13px", color: TEXT_DIM }}>{t("heroEmpty")}</p>
          )}
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section id="features" style={{ padding: "150px 48px 130px", maxWidth: "1180px", margin: "0 auto" }}>
        <div style={{ fontFamily: "var(--font-ibm-plex-mono), monospace", fontSize: "12px", fontWeight: 600, letterSpacing: "1.5px", color: accent, textAlign: "center", marginBottom: "14px" }}>
          {t("featuresKicker")}
        </div>
        <h2 style={{ fontSize: "32px", fontWeight: 800, textAlign: "center", margin: "0 0 14px", letterSpacing: "-0.5px" }}>{t("featuresTitle")}</h2>
        <p style={{ fontSize: "14.5px", color: TEXT_DIM, textAlign: "center", maxWidth: "560px", margin: "0 auto 50px", lineHeight: 1.6 }}>{t("featuresSub")}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px" }}>
          {features.map((f) => (
            <div key={f.key} style={{ ...glass(0.045), borderRadius: "16px", padding: "28px" }}>
              <div style={{ width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "18px" }}>
                <div style={iconFor(f.shape, accent)} />
              </div>
              <div style={{ fontSize: "16.5px", fontWeight: 700, marginBottom: "10px" }}>{t(`features.${f.key}.title`)}</div>
              <div style={{ fontSize: "13.5px", lineHeight: 1.55, color: TEXT_DIM }}>{t(`features.${f.key}.desc`)}</div>
            </div>
          ))}
        </div>
      </section>

      <AuthModal
        open={authOpen}
        mode={authMode}
        onClose={() => setAuthOpen(false)}
        onModeChange={setAuthMode}
        onSubmit={() => router.push("/dashboard")}
      />

      <footer style={{ padding: "28px 48px", textAlign: "center", fontSize: "12px", color: TEXT_DIM, borderTop: "1px solid " + BORDER }}>
        <span>{t("footer")}</span>
      </footer>
    </div>
  );
}

function iconFor(shape: "ring" | "hands" | "arrow" | "delta" | "dot" | "card", accent: string): React.CSSProperties {
  const s: React.CSSProperties = { width: "22px", height: "22px", boxSizing: "border-box" };
  switch (shape) {
    case "ring":
      return { ...s, borderRadius: "50%", border: "2px solid " + accent };
    case "hands":
      return { ...s, border: "2px solid " + accent, borderRadius: "5px", transform: "rotate(45deg)" };
    case "arrow":
      return { ...s, width: 0, height: 0, borderLeft: "11px solid transparent", borderRight: "11px solid transparent", borderBottom: "18px solid " + accent };
    case "delta":
      return { ...s, width: 0, height: 0, borderLeft: "11px solid transparent", borderRight: "11px solid transparent", borderTop: "18px solid " + accent };
    case "dot":
      return { width: "14px", height: "14px", borderRadius: "50%", border: "2px solid " + accent, margin: "4px" };
    case "card":
      return { ...s, width: "16px", height: "22px", border: "2px solid " + accent, borderRadius: "3px" };
    default:
      return s;
  }
}
