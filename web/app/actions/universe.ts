"use server";

import { cookies } from "next/headers";
import { UNIVERSE_COOKIE } from "@/lib/universe";
import type { Tcg } from "@/lib/constants";

export async function setUniverseAction(universe: Tcg): Promise<void> {
  if (universe !== "pokemon" && universe !== "one-piece") return;
  const cookieStore = await cookies();
  cookieStore.set(UNIVERSE_COOKIE, universe, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
