"use server";

import { cookies } from "next/headers";
import { locales, type Locale } from "@/i18n/config";

export async function setLocaleAction(locale: string): Promise<void> {
  if (!(locales as readonly string[]).includes(locale)) return;
  const cookieStore = await cookies();
  cookieStore.set("locale", locale as Locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
