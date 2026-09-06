"""Scraper Playwright pour pokecardex.com -- catalogue des sets (logos) et
listes de cartes par set.

Pourquoi Playwright et pas `requests` (contrairement au reste du module
`pokecardex.py`, qui ne fait QUE des requêtes CDN une fois l'URL connue) :
les pages `/en/series[?zone=jp]` et `/en/series/{jp/}{code}` sont une SPA
React (`<div id="root">` + bundle JS, vérifié 2026-09-06 -- `requests.get`
sur ces URLs renvoie un shell HTML vide, aucune donnée de set/carte n'y est
présente). L'API interne du site qui alimente cette SPA est gated par le WAF
"PowerBoost" (cf. docstring de `pokecardex.py`), donc pas d'appel JSON direct
possible. Solution validée en session (navigation Chrome réelle) : après
hydratation JS, le DOM contient tout ce qu'il faut en clair -- il suffit de
faire tourner un vrai navigateur (headless, Playwright déjà installé dans cet
environnement) et de lire le DOM avec `page.evaluate`.

Les URLs d'images elles-mêmes (logos ET scans de cartes) restent servies par
un CDN Bunny ouvert (`pokecardex.b-cdn.net` / `pokecardex-scans.b-cdn.net`,
sans auth, cf. `pokecardex.py`) -- une fois l'URL connue via ce scraper, un
`requests.head`/`get` classique suffit pour la vérifier/l'écrire en base.

Structure DOM relevée (2026-09-06, à re-vérifier si le site change de design) :
- Page listing (`/en/series` = zone EN "International", `/en/series?zone=jp`
  = zone JP) : chaque tuile de set est un `<a href="/en/series/{code}">`
  (EN) ou `<a href="/en/series/jp/{code}">` (JP) contenant deux `<img>` :
  un petit badge (`alt`=code, `src=.../symboles[_jp]/{code}.png`) et un
  logo/wordmark plus grand (`alt`=nom humain du set, `src=.../logos/US/{code}.png`
  en EN ou `.../logos_jp/{code}.png` en JP). C'est ce deuxième `src` qui est
  LE logo (`logo_url` ci-dessous), le premier n'est qu'une icône.
- Page set (`/en/series/{code}` ou `/en/series/jp/{code}`) : une grille de
  cartes, chacune un `<img alt="Nom NNN/TTT" src=".../sets[_jp]/{code}[/US]/{num}.jpg?class=md">`.
  `?class=md` -> remplacer par `?class=original` pour la pleine résolution
  (même convention que `pokecardex.py::image_url`).

  **Virtualisation** (relevé 2026-09-06 sur un set de 120 cartes + 36 secrets) :
  la grille ne garde en DOM qu'une fenêtre de cartes autour du scroll actuel
  (les lignes hors-écran sont démontées, pas juste masquées) -- un seul
  `page.evaluate` après un unique scroll en bas ne renvoie donc PAS toutes les
  cartes. `_collect_all_cards` scrolle par petits pas et fusionne les lots
  successifs (dédoublonnés par numéro imprimé) jusqu'à ce que le scroll
  n'ajoute plus rien de nouveau -- robuste même si la taille de fenêtre de
  virtualisation change côté site.
"""
import re
import time

from playwright.sync_api import sync_playwright

BASE_URL = "https://www.pokecardex.com"

# Poli envers un site associatif (pas un CDN) : même philosophie que
# pokecardex.py::MIN_SECONDS_BETWEEN_REQUESTS, valeur un peu plus haute ici
# car chaque page déclenche son propre rendu JS + chargement d'images (plus
# coûteux pour le serveur qu'un simple GET CDN).
MIN_SECONDS_BETWEEN_PAGES = 1.5

# Dénominateur optionnel -- relevé 2026-09-06 : les pages de promos (ex.
# "SVP", Scarlet & Violet Promos) numérotent chaque carte SANS "/total" (ex.
# alt="Sprigatito 001", pas "001/XXX" comme un set normal) -- sans ce
# `(?:...)?`, ces pages renvoyaient 0 carte scrapée (regex jamais satisfaite),
# alors que le CDN les sert très bien une fois l'URL construite.
_CARD_ALT_RE = re.compile(r"^(.*?)\s+(\d+)(?:/(\d+))?$")


def launch_browser(playwright):
    """Un seul navigateur headless à réutiliser sur tout un run (cf. appelants
    -- créer un navigateur par page serait inutilement coûteux sur ~594 sets)."""
    return playwright.chromium.launch()


def new_page(browser):
    context = browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
    )
    return context.new_page()


def _set_list_url(zone):
    return f"{BASE_URL}/en/series?zone=jp" if zone == "jp" else f"{BASE_URL}/en/series"


def _set_page_url(zone, pokecardex_code):
    prefix = "jp/" if zone == "jp" else ""
    return f"{BASE_URL}/en/series/{prefix}{pokecardex_code}"


def scrape_set_catalog(page, zone):
    """Liste tous les sets de la page listing (EN "International" si zone="en",
    JP si zone="jp") : code PokéCardex, nom humain (alt du logo), URL du logo.
    Un seul chargement de page (pas de virtualisation constatée sur cette
    grille, contrairement à la page set -- ~200-370 tuiles tiennent en un seul
    DOM sans souci)."""
    page.goto(_set_list_url(zone), wait_until="networkidle")
    page.wait_for_timeout(1000)
    href_prefix = "/en/series/jp/" if zone == "jp" else "/en/series/"
    rows = page.evaluate(
        """(hrefPrefix) => {
            const anchors = Array.from(document.querySelectorAll('a[href*="/series/"]'));
            const out = [];
            for (const a of anchors) {
                const href = a.getAttribute('href') || '';
                if (!href.includes(hrefPrefix)) continue;
                const code = href.split(hrefPrefix)[1];
                if (!code || code.includes('/')) continue;  // évite un préfixe qui matcherait aussi l'autre zone
                const imgs = Array.from(a.querySelectorAll('img'));
                if (imgs.length < 2) continue;  // badge + logo attendus
                const logo = imgs[imgs.length - 1];
                out.push({code, name: logo.alt || null, logo_url: logo.src || null});
            }
            return out;
        }""",
        href_prefix,
    )
    # Dédoublonnage (une tuile peut apparaître deux fois si le DOM contient un
    # variant desktop+mobile caché) -- premier gagne.
    seen = {}
    for row in rows:
        seen.setdefault(row["code"], row)
    return list(seen.values())


def _collect_visible_cards(page, zone):
    src_marker = "/sets_jp/" if zone == "jp" else "/sets/"
    return page.evaluate(
        """(marker) => {
            const imgs = Array.from(document.querySelectorAll('img')).filter(img => img.src.includes(marker));
            return imgs.map(img => ({alt: img.alt || '', src: img.src}));
        }""",
        src_marker,
    )


_CARD_URL_NUMBER_RE = re.compile(r"/(\d+)\.(?:jpg|png|webp)(?:\?|$)")


def _parse_card(alt, src):
    """Nom + numéro imprimé d'une carte, à partir de son alt ET de son URL de
    scan. L'alt suffit d'habitude (cf. _CARD_ALT_RE), mais certains vieux
    sets JP (ex. "OR1" -- Expansion Pack) n'y mettent PAS de numéro du tout,
    juste "Nom ★" (relevé 2026-09-06) -- le numéro reste toujours extractible
    de l'URL elle-même (`.../{code}/{num}.jpg`), qui l'encode nécessairement
    pour pointer vers le bon scan, contrairement à l'alt qui est un texte
    éditorial. None seulement si NI l'un NI l'autre ne donne de numéro."""
    alt = (alt or "").strip()
    m = _CARD_ALT_RE.match(alt)
    if m:
        name, num, total = m.groups()
        return name.strip(), num, total
    m = _CARD_URL_NUMBER_RE.search(src or "")
    if not m:
        return None
    return alt, m.group(1), None


def _collect_all_cards(page, zone, max_stable_rounds=4, max_rounds=60):
    """Scrolle par petits pas et fusionne les lots rendus successivement.

    Relevé 2026-09-06 : la grille n'est PAS virtualisée avec démontage (les
    cartes déjà rendues restent en DOM), c'est un "charge au scroll" qui
    AJOUTE des cartes au fur et à mesure -- mais la hauteur de page
    (`document.body.scrollHeight`) grandit elle aussi en retard sur ce
    chargement. Un critère "on est près du bas de la page" est donc trompeur
    juste après un scroll (la page vient de s'agrandir, on n'est plus près du
    nouveau bas) -- le seul signal fiable est : plusieurs scrolls d'affilée
    qui n'ajoutent plus aucune carte nouvelle."""
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(300)
    by_number = {}
    stable_rounds = 0
    last_size = -1
    for _ in range(max_rounds):
        for row in _collect_visible_cards(page, zone):
            parsed = _parse_card(row["alt"], row["src"])
            if parsed is None:
                continue
            name, num, total = parsed
            by_number[num] = {"name": name, "number": num, "total": total, "image_url": row["src"]}
        if len(by_number) == last_size:
            stable_rounds += 1
            if stable_rounds >= max_stable_rounds:
                break
        else:
            stable_rounds = 0
        last_size = len(by_number)
        page.evaluate("window.scrollBy(0, Math.round(window.innerHeight * 0.8))")
        page.wait_for_timeout(400)
    return list(by_number.values())


def scrape_set_cards(page, zone, pokecardex_code):
    """Toutes les cartes d'un set (numéro imprimé, nom, URL image pleine
    résolution). `zone` = "jp" ou "en"."""
    page.goto(_set_page_url(zone, pokecardex_code), wait_until="networkidle")
    page.wait_for_timeout(800)
    cards = _collect_all_cards(page, zone)
    for card in cards:
        card["image_url"] = card["image_url"].replace("?class=md", "?class=original")
    return cards


class PoliteBrowser:
    """Contexte reprenant navigateur + page + délai poli entre navigations,
    pour ne pas répéter ce boilerplate dans chaque script appelant (mapping,
    backfill)."""

    def __init__(self):
        self._pw = None
        self.browser = None
        self.page = None
        self._last_nav = 0.0

    def __enter__(self):
        self._pw = sync_playwright().start()
        self.browser = launch_browser(self._pw)
        self.page = new_page(self.browser)
        return self

    def __exit__(self, exc_type, exc, tb):
        try:
            self.browser.close()
        finally:
            self._pw.stop()

    def throttle(self):
        elapsed = time.monotonic() - self._last_nav
        if elapsed < MIN_SECONDS_BETWEEN_PAGES:
            time.sleep(MIN_SECONDS_BETWEEN_PAGES - elapsed)
        self._last_nav = time.monotonic()
