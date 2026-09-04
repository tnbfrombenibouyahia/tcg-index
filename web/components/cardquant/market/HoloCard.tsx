"use client";

import { useEffect, useRef, useState } from "react";

// Port fidèle de design-system/components/market/HoloCard.jsx (handoff
// CardQuant, cf. mémoire projet "cardquant-rebrand") -- maths de tilt/glare
// et pile de calques adaptées de simeydotme/pokemon-cards-css (MIT), cf.
// styles/cardquant/tokens/foil.css pour le CSS qu'il pilote. Seule
// différence avec le prototype : `img` en `<img>` natif (pas de next/image,
// hôtes CDN externes divers -- même choix que le reste du projet, cf.
// CatalogueGrid.tsx).
const clamp = (v: number, a = 0, b = 100) => Math.min(Math.max(v, a), b);
const adjust = (v: number, fmin: number, fmax: number, tmin: number, tmax: number) => tmin + ((tmax - tmin) * (v - fmin)) / (fmax - fmin);

type PointerState = { rx: number; ry: number; px: number; py: number; o: number; bx: number; by: number };

export interface HoloCardProps {
  img?: string;
  name?: string;
  set?: string;
  foil?: "holo" | "rainbow" | "metal" | "raw";
  width?: number;
  showcase?: boolean;
  active?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function HoloCard({ img, name = "Card name", set = "SET · 000", foil = "holo", width = 240, showcase = false, active: activeProp, onClick, style }: HoloCardProps) {
  const root = useRef<HTMLDivElement>(null);
  const target = useRef<PointerState>({ rx: 0, ry: 0, px: 50, py: 50, o: 0, bx: 50, by: 50 });
  const cur = useRef<PointerState>({ rx: 0, ry: 0, px: 50, py: 50, o: 0, bx: 50, by: 50 });
  const raf = useRef<number | null>(null);
  const [interacting, setInteracting] = useState(false);

  useEffect(() => {
    const tick = () => {
      const t = target.current;
      const c = cur.current;
      for (const k of Object.keys(t) as (keyof PointerState)[]) {
        const d = t[k] - c[k];
        if (Math.abs(d) > 0.01) c[k] += d * 0.14;
        else c[k] = t[k];
      }
      const el = root.current;
      if (el) {
        const fromCenter = clamp(Math.sqrt((c.py - 50) ** 2 + (c.px - 50) ** 2) / 50, 0, 1);
        el.style.setProperty("--rotate-x", c.rx.toFixed(2) + "deg");
        el.style.setProperty("--rotate-y", c.ry.toFixed(2) + "deg");
        el.style.setProperty("--pointer-x", c.px.toFixed(2) + "%");
        el.style.setProperty("--pointer-y", c.py.toFixed(2) + "%");
        el.style.setProperty("--background-x", c.bx.toFixed(2) + "%");
        el.style.setProperty("--background-y", c.by.toFixed(2) + "%");
        el.style.setProperty("--card-opacity", c.o.toFixed(3));
        el.style.setProperty("--pointer-from-center", fromCenter.toFixed(3));
        el.style.setProperty("--pointer-from-top", (c.py / 100).toFixed(3));
        el.style.setProperty("--pointer-from-left", (c.px / 100).toFixed(3));
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, []);

  useEffect(() => {
    if (!showcase) return;
    let r = 0;
    const id = setInterval(() => {
      r += 0.045;
      target.current = {
        rx: Math.sin(r) * 16, ry: Math.cos(r) * 14,
        px: 50 + Math.sin(r) * 45, py: 50 + Math.cos(r) * 45,
        bx: 50 + Math.sin(r) * 18, by: 50 + Math.cos(r) * 18, o: 0.9,
      };
    }, 24);
    return () => clearInterval(id);
  }, [showcase]);

  function move(e: React.PointerEvent<HTMLButtonElement>) {
    if (showcase) return;
    setInteracting(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const px = clamp(((e.clientX - rect.left) / rect.width) * 100);
    const py = clamp(((e.clientY - rect.top) / rect.height) * 100);
    target.current = {
      rx: -((px - 50) / 3.5), ry: (py - 50) / 3.5, px, py, o: 1,
      bx: adjust(px, 0, 100, 37, 63), by: adjust(py, 0, 100, 33, 67),
    };
  }
  function leave() {
    if (showcase) return;
    setInteracting(false);
    target.current = { rx: 0, ry: 0, px: 50, py: 50, o: 0, bx: 50, by: 50 };
  }

  return (
    <div ref={root} className={"tcg-card" + (activeProp || interacting ? " is-active" : "")} data-foil={foil} style={{ width, ...style }}>
      <div className="tcg-card__translater">
        <button type="button" className="tcg-card__rotator" onPointerMove={move} onPointerLeave={leave} onClick={onClick} aria-label={name}>
          <div className="tcg-card__front">
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt={name} />
            ) : (
              <div
                style={{
                  display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 2,
                  padding: "10% 9%", background: "linear-gradient(160deg,var(--ink-700),var(--ink-900))",
                  border: "6px solid var(--ink-600)", borderRadius: "inherit",
                }}
              >
                <span style={{ fontSize: width * 0.075, color: "var(--white)", fontWeight: 400, lineHeight: 1.1 }}>{name}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: width * 0.045, color: "var(--green-400)", letterSpacing: "0.06em" }}>{set}</span>
              </div>
            )}
            <div className="tcg-card__shine" />
            <div className="tcg-card__glare" />
          </div>
        </button>
      </div>
    </div>
  );
}
