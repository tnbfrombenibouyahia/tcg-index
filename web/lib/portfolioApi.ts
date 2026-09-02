"use client";

import { auth } from "@/lib/firebase-client";

// ─────────────────────────────────────────────────────────────────────────────
// Client du portefeuille personnel (écran PnL CardQuant, cf. mémoire projet
// "cardquant-rebrand") -- appelle pricing_api::/portfolio directement depuis
// le navigateur (même service, même auth Firebase que le panneau extension
// pour /favorites, cf. extension/background.js::favoritesFetch). web/ n'a
// que du SELECT sur Postgres (lib/db.ts) : toutes les écritures du
// portefeuille passent par ce service, jamais par une route API web/.
// ─────────────────────────────────────────────────────────────────────────────

const PRICING_API_URL = process.env.NEXT_PUBLIC_PRICING_API_URL ?? "";

export interface PortfolioPosition {
  id: number;
  itemId: number;
  name: string;
  code: string | null;
  setCode: string | null;
  tcg: string;
  language: string;
  rarity: string | null;
  imageUrl: string | null;
  grade: string;
  quantity: number;
  buyPrice: number;
  buyCurrency: string;
  buyDate: string;
  sellPrice: number | null;
  sellCurrency: string | null;
  sellDate: string | null;
  note: string | null;
  status: "open" | "closed";
  currentPrice: number | null;
  currentCurrency: string | null;
}

interface RawPosition {
  id: number;
  item_id: number;
  name: string;
  code: string | null;
  set_code: string | null;
  tcg: string;
  language: string;
  rarity: string | null;
  image_url: string | null;
  grade: string;
  quantity: number;
  buy_price: number;
  buy_currency: string;
  buy_date: string;
  sell_price: number | null;
  sell_currency: string | null;
  sell_date: string | null;
  note: string | null;
  status: "open" | "closed";
  current_price: number | null;
  current_currency: string | null;
}

function fromRaw(r: RawPosition): PortfolioPosition {
  return {
    id: r.id, itemId: r.item_id, name: r.name, code: r.code, setCode: r.set_code,
    tcg: r.tcg, language: r.language, rarity: r.rarity, imageUrl: r.image_url,
    grade: r.grade, quantity: r.quantity,
    buyPrice: r.buy_price, buyCurrency: r.buy_currency, buyDate: r.buy_date,
    sellPrice: r.sell_price, sellCurrency: r.sell_currency, sellDate: r.sell_date,
    note: r.note, status: r.status,
    currentPrice: r.current_price, currentCurrency: r.current_currency,
  };
}

export type PortfolioResult<T> = { ok: true; data: T } | { ok: false; reason: "auth" | "network" | "config"; message?: string };

async function authedFetch(path: string, options: RequestInit = {}): Promise<PortfolioResult<unknown>> {
  if (!PRICING_API_URL) return { ok: false, reason: "config", message: "NEXT_PUBLIC_PRICING_API_URL non configurée." };
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: "auth" };
  const idToken = await user.getIdToken();
  try {
    const res = await fetch(`${PRICING_API_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}`, ...(options.headers || {}) },
    });
    if (res.status === 401) return { ok: false, reason: "auth" };
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, reason: "network", message: body?.detail || `HTTP ${res.status}` };
    }
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, reason: "network", message: String(err) };
  }
}

export async function fetchPositions(): Promise<PortfolioResult<PortfolioPosition[]>> {
  const res = await authedFetch("/portfolio");
  if (!res.ok) return res;
  const data = res.data as { positions: RawPosition[] };
  return { ok: true, data: data.positions.map(fromRaw) };
}

export async function addPosition(input: {
  itemId: number;
  grade: string;
  quantity: number;
  buyPrice: number;
  buyCurrency: string;
  buyDate: string;
  note?: string;
}): Promise<PortfolioResult<PortfolioPosition>> {
  const res = await authedFetch("/portfolio", {
    method: "POST",
    body: JSON.stringify({
      item_id: input.itemId, grade: input.grade, quantity: input.quantity,
      buy_price: input.buyPrice, buy_currency: input.buyCurrency, buy_date: input.buyDate, note: input.note,
    }),
  });
  if (!res.ok) return res;
  const data = res.data as { position: RawPosition };
  return { ok: true, data: fromRaw(data.position) };
}

export async function closePosition(id: number, input: { sellPrice: number; sellCurrency: string; sellDate: string }): Promise<PortfolioResult<PortfolioPosition>> {
  const res = await authedFetch(`/portfolio/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ sell_price: input.sellPrice, sell_currency: input.sellCurrency, sell_date: input.sellDate }),
  });
  if (!res.ok) return res;
  const data = res.data as { position: RawPosition };
  return { ok: true, data: fromRaw(data.position) };
}

export async function reopenPosition(id: number): Promise<PortfolioResult<PortfolioPosition>> {
  const res = await authedFetch(`/portfolio/${id}`, { method: "PATCH", body: JSON.stringify({ clear_sale: true }) });
  if (!res.ok) return res;
  const data = res.data as { position: RawPosition };
  return { ok: true, data: fromRaw(data.position) };
}

export async function deletePosition(id: number): Promise<PortfolioResult<{ status: string }>> {
  return authedFetch(`/portfolio/${id}`, { method: "DELETE" }) as Promise<PortfolioResult<{ status: string }>>;
}
