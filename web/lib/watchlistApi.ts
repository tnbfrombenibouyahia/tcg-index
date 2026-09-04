"use client";

import { auth } from "@/lib/firebase-client";

// ─────────────────────────────────────────────────────────────────────────────
// Client de la watchlist (écran Watchlist CardQuant, cf. mémoire projet
// "cardquant-rebrand") -- appelle pricing_api::/favorites directement depuis
// le navigateur, même service/auth que le panneau extension
// (extension/background.js::favoritesFetch) et que
// web/lib/portfolioApi.ts pour le PnL. Backend déjà en prod (favoris ajoutés
// le 2026-08-29) -- seul `current_price`/`current_currency` sur FavoriteOut
// est nouveau (cf. pricing_api/main.py::_favorite_out).
// ─────────────────────────────────────────────────────────────────────────────

const PRICING_API_URL = process.env.NEXT_PUBLIC_PRICING_API_URL ?? "";

export interface WatchedCard {
  itemId: number;
  name: string;
  code: string | null;
  setCode: string | null;
  rarity: string | null;
  language: string;
  imageUrl: string | null;
  setName: string | null;
  setReleaseYear: number | null;
  currentPrice: number | null;
  currentCurrency: string | null;
}

interface RawFavorite {
  card_id: number;
  name: string;
  code: string | null;
  set_code: string | null;
  rarity: string | null;
  language: string;
  image_url: string | null;
  set_name: string | null;
  set_release_year: number | null;
  current_price: number | null;
  current_currency: string | null;
}

function fromRaw(r: RawFavorite): WatchedCard {
  return {
    itemId: r.card_id, name: r.name, code: r.code, setCode: r.set_code, rarity: r.rarity,
    language: r.language, imageUrl: r.image_url, setName: r.set_name, setReleaseYear: r.set_release_year,
    currentPrice: r.current_price, currentCurrency: r.current_currency,
  };
}

export type WatchlistResult<T> = { ok: true; data: T } | { ok: false; reason: "auth" | "network" | "limit" | "config"; message?: string };

async function authedFetch(path: string, options: RequestInit = {}): Promise<WatchlistResult<unknown>> {
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
    if (res.status === 402) {
      const body = await res.json().catch(() => null);
      return { ok: false, reason: "limit", message: body?.detail ?? null };
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, reason: "network", message: body?.detail || `HTTP ${res.status}` };
    }
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, reason: "network", message: String(err) };
  }
}

export async function fetchFavorites(): Promise<WatchlistResult<{ favorites: WatchedCard[]; limit: number; isPremium: boolean }>> {
  const res = await authedFetch("/favorites");
  if (!res.ok) return res;
  const data = res.data as { favorites: RawFavorite[]; limit: number; is_premium: boolean };
  return { ok: true, data: { favorites: data.favorites.map(fromRaw), limit: data.limit, isPremium: data.is_premium } };
}

export async function addFavorite(itemId: number): Promise<WatchlistResult<WatchedCard>> {
  const res = await authedFetch("/favorites", { method: "POST", body: JSON.stringify({ item_id: itemId }) });
  if (!res.ok) return res;
  const data = res.data as { status: string; favorite: RawFavorite };
  return { ok: true, data: fromRaw(data.favorite) };
}

export async function removeFavorite(itemId: number): Promise<WatchlistResult<{ status: string }>> {
  return authedFetch(`/favorites/${itemId}`, { method: "DELETE" }) as Promise<WatchlistResult<{ status: string }>>;
}
