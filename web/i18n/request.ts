import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { defaultLocale, locales, type Locale } from "./config";

// Pas de routing par préfixe d'URL (/en/..., /fr/...) -- la langue est un
// réglage d'affichage, pas une donnée métier, donc un cookie suffit (cf.
// recette "without i18n routing" de next-intl) et évite de dupliquer chaque
// page sous [locale].
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("locale")?.value;
  const locale: Locale = (locales as readonly string[]).includes(cookieLocale ?? "")
    ? (cookieLocale as Locale)
    : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
