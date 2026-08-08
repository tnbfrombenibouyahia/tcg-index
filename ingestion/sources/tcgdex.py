"""Scraper d'appoint : TCGdex (github.com/tcgdex/cards-database, MIT) --
backfill de `items.rarity` pour le Pokémon JP encore sans rareté après
LimitlessTCG (`limitlesstcg.py`) et Bulbapedia (`bulbapedia.py`), cf. mémoire
projet "limitlesstcg_rarity_backfill".

Pourquoi une 3e source alors que les deux premières ont déjà fait le plus
gros du travail (JP 25.9% -> 69.7%) : au lieu de wikitext à parser
(Bulbapedia) ou de HTML à scraper (LimitlessTCG), TCGdex publie ses données
carte par carte en fichiers TypeScript structurés (`rarity: "..."` en
simple champ), avec des noms JP natifs ET des dates de sortie -- bien plus
fiable pour matcher nos `set_code` que le matching de tokens anglais
approximatif utilisé ailleurs. Découvert et validé le 2026-08-08 :
- `PCG6` ("ホロンの研究塔" = Holon Research Tower) et `PCG4` ("金の空、銀の海"
  = Golden Sky Silvery Ocean) -- deux sets sur lesquels Bulbapedia/
  LimitlessTCG butaient (contamination numéro-Pokédex côté nos données) --
  ont bien `rarity` renseignée carte par carte ici.
- Confirme, une 3e fois indépendamment, que les decks préconstruits n'ont
  structurellement pas de rareté documentée (`rarity: "None"` explicite sur
  les 774 cartes de "MC" / Start Deck 100 Battle Collection) -- pas une
  lacune de source, un fait du TCG lui-même (contenu garanti, pas de tirage
  aléatoire à noter comme "rare").
- Ne couvre PAS non plus le pré-TCG (Carddass/Topsun/Vending, absents des
  171 sets JP du dépôt) -- même plafond structurel que documenté ailleurs.

ARCHITECTURE DIFFÉRENTE des deux autres sources pour la donnée de rareté
elle-même : pas de HTTP live carte par carte (l'API REST ne renvoie que des
`CardBrief` sans rareté en liste, il faudrait un aller-retour par carte --
testé, pas de mode "full" en masse documenté). À la place, on clone en
local le dossier `data-asia` du dépôt (sparse + shallow, ~73 Mo, licence
MIT) et on parse les fichiers `.ts` directement -- une seule opération git
pour tout le run, pas de pause de politesse nécessaire à ce niveau-là.

MAIS la correspondance set_code -> nom JP passe TOUJOURS par un fetch
Bulbapedia par set_code (cf. section suivante) -- celui-ci reste soumis au
même `Crawl-delay: 5` que `bulbapedia.py` (`REQUEST_PAUSE_SECONDS` importé
de ce module, pas dupliqué). Piège trouvé en testant (2026-08-08) : un
premier jet de ce module appelait `bulbapedia.fetch_wikitext` en boucle
serrée sans pause -- interrompu avant qu'un vrai dégât ne soit fait, mais
sans la pause explicite ci-dessous ça martèle leur serveur.

Correspondance set_code -> TCGdex : nos `set_code` JP n'ont pas
d'équivalent anglais direct chez TCGdex pour beaucoup de sets JP-only (pas
de section `/en/` pour ces sets), et `items.release_date` n'est jamais
rempli côté JP (source pricecharting.py, cf. mémoire projet
"jp_singles_tracking") donc inutilisable comme signal de matching. La
correspondance passe donc par le nom JP natif, obtenu via le champ
`jasetname=` de l'infobox Bulbapedia (déjà fetchable via
`bulbapedia.fetch_wikitext` + `JP_BULBAPEDIA_TITLE_OVERRIDES`/`_guess_title`
-- réutilise l'infrastructure existante plutôt que d'en reconstruire une).
Un article combiné (2 sets JP fusionnés en 1 set EN, cf. mémoire projet --
`jasetname` porte alors les deux noms séparés par "•", ex. "秘境の叫び •
怒りの神殿" pour "Legends Awakened") est géré en splittant sur ce séparateur
et en essayant chaque nom individuellement contre l'index TCGdex."""
from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from psycopg2.extras import execute_values

from ingestion.sources import bulbapedia
from shared.db import get_connection

REPO_URL = "https://github.com/tcgdex/cards-database.git"

# Vocabulaire de rareté vu dans les fichiers TCGdex JP (échantillonné avant
# d'écrire ce module, cf. docstring) -- recouvre en grande partie
# `bulbapedia.KNOWN_RARITIES`/`ABBREVIATED_RARITIES`, gardé séparé plutôt
# que fusionné : les deux sources ont chacune leurs propres libellés exacts
# et mieux vaut un mapping explicite par source qu'une supposition
# d'équivalence. Volontairement PAS "None" -- TCGdex l'utilise
# explicitement pour les cartes sans palier de rareté réel (Energies de
# base, cartes de deck préconstruit), même logique que `bulbapedia.py`.
KNOWN_RARITIES: frozenset[str] = frozenset({
    "Common", "Uncommon", "Rare", "Holo Rare", "Rare Holo", "Rare Holo EX",
    "Rare Holo GX", "Rare Holo LV.X", "Rare Holo Star", "Rare Holo V",
    "Rare Holo VMAX", "Rare Holo VSTAR", "Ultra Rare", "Secret Rare",
    "Rainbow Rare", "Shiny Rare", "Prism Rare", "Rare BREAK", "Rare ACE",
    "Rare Prime", "Amazing Rare", "Radiant Rare", "Double Rare", "Art Rare",
    "Special Art Rare", "Illustration Rare", "Special Illustration Rare",
    "Hyper Rare", "ACE SPEC Rare", "Shiny Ultra Rare", "Trainer Gallery Rare",
    "Classic Collection", "Promo",
})


def clone_data_asia(target_dir: Path) -> Path:
    """Sparse+shallow clone de `data-asia` (données JP/Asie) uniquement --
    pas tout le dépôt (le reste ne nous sert pas). Retourne le chemin vers
    `data-asia`."""
    subprocess.run(
        ["git", "clone", "--depth", "1", "--filter=blob:none", "--sparse", REPO_URL, str(target_dir)],
        check=True, capture_output=True, text=True,
    )
    subprocess.run(
        ["git", "sparse-checkout", "set", "data-asia"],
        cwd=target_dir, check=True, capture_output=True, text=True,
    )
    return target_dir / "data-asia"


def build_ja_name_index(data_asia: Path) -> dict[str, str]:
    """Nom JP natif -> chemin du dossier du set (ex. "拡張パック" ->
    .../PMCG/PMCG1). Lu depuis le fichier de métadonnées `<SetID>.ts` de
    chaque set (`name: { ja: '...' }` -- extraction par regex, pas besoin
    d'un vrai parseur TypeScript pour cette seule ligne)."""
    index: dict[str, str] = {}
    name_re = re.compile(r"ja:\s*['\"]([^'\"]+)['\"]")
    for meta_file in data_asia.glob("*/*.ts"):
        set_dir = meta_file.with_suffix("")
        if not set_dir.is_dir():
            continue
        text = meta_file.read_text(encoding="utf-8")
        m = name_re.search(text)
        if m:
            index[m.group(1).strip()] = str(set_dir)
    return index


_JASETNAME_RE = re.compile(r"jasetname\s*=\s*([^\n|}]+)")


def extract_ja_names(wikitext: str) -> list[str]:
    """Noms JP natifs depuis `|jasetname=...` de l'infobox Bulbapedia --
    un article combiné (2 sets JP fusionnés en 1 set EN, cf. docstring
    module) porte plusieurs noms séparés par "•", chacun essayé
    individuellement contre l'index TCGdex."""
    m = _JASETNAME_RE.search(wikitext)
    if not m:
        return []
    raw = m.group(1).strip()
    # Retire les éventuelles balises de référence wiki (<ref>...</ref>) et
    # liens externes qui traînent parfois en fin de paramètre.
    raw = re.sub(r"<ref.*?</ref>", "", raw, flags=re.DOTALL)
    raw = re.sub(r"\[\[.*?\]\]", "", raw)
    parts = [p.strip() for p in raw.split("•")]
    return [p for p in parts if p]


def parse_set_cards(set_dir: Path) -> dict[str, str]:
    """numérateur (sans padding) -> rareté, pour tous les fichiers carte
    d'un dossier de set TCGdex. Un fichier par carte, nommé par son
    `localId` zero-paddé (ex. "001.ts") -- le numérateur vient directement
    du nom de fichier, pas du contenu (plus fiable, jamais absent)."""
    rarity_re = re.compile(r"rarity:\s*['\"]([^'\"]+)['\"]")
    by_numerator: dict[str, str] = {}
    for card_file in set_dir.glob("*.ts"):
        numerator = card_file.stem
        if not numerator.isdigit():
            continue
        text = card_file.read_text(encoding="utf-8")
        m = rarity_re.search(text)
        if not m:
            continue
        rarity = m.group(1).strip()
        if rarity in KNOWN_RARITIES:
            by_numerator[numerator.lstrip("0") or "0"] = rarity
    return by_numerator


def sync_set_rarities(set_code: str, by_numerator: dict[str, str]) -> int:
    """Backfill `items.rarity` pour un `set_code` JP donné à partir d'un
    dict numérateur->rareté déjà extrait (cf. `parse_set_cards`). Même
    plafond de vraisemblance PAR CARTE que `bulbapedia.sync_set_rarities`
    (page_max*1.5) -- risque structurellement identique (un `set_code` mal
    apparié via le nom JP, ou un `code` contaminé par un numéro de
    Pokédex national plutôt qu'une position réelle dans le set)."""
    if not by_numerator:
        return 0
    page_max = max(int(n) for n in by_numerator)
    numerator_ceiling = int(page_max * 1.5)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, code FROM items
                   WHERE tcg = 'pokemon' AND language = 'JP' AND category = 'single'
                     AND set_code = %s AND rarity IS NULL""",
                (set_code,),
            )
            rows = cur.fetchall()

        updates = []
        for item_id, code in rows:
            if not (code and code.isdigit() and int(code) <= numerator_ceiling):
                continue
            rarity = by_numerator.get(code.lstrip("0") or "0")
            if rarity:
                updates.append((item_id, rarity))

        if not updates:
            return 0

        with conn.cursor() as cur:
            execute_values(
                cur,
                "UPDATE items SET rarity = data.rarity FROM (VALUES %s) AS data (id, rarity) WHERE items.id = data.id",
                updates,
                page_size=len(updates),
            )
        conn.commit()
    finally:
        conn.close()
    return len(updates)


def sync_all_remaining_jp_rarities() -> dict:
    """Boucle sur tous les `set_code` JP encore sans rareté : cherche leur
    nom JP natif via l'article Bulbapedia déjà identifié (réutilise
    `JP_BULBAPEDIA_TITLE_OVERRIDES`/`_guess_title`, pas une nouvelle
    correspondance), le matche contre l'index TCGdex, et backfill si
    trouvé. Un seul clone git pour tout le run (pas un par set)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT set_code FROM items
                WHERE tcg = 'pokemon' AND language = 'JP' AND category = 'single'
                  AND rarity IS NULL AND set_code IS NOT NULL
                ORDER BY set_code
            """)
            set_codes = [r[0] for r in cur.fetchall()]
    finally:
        conn.close()

    tmp_dir = Path(tempfile.mkdtemp(prefix="tcgdex_"))
    try:
        data_asia = clone_data_asia(tmp_dir)
        ja_index = build_ja_name_index(data_asia)

        total = 0
        skipped: list[str] = []
        errors: list[dict] = []
        for i, set_code in enumerate(set_codes):
            if i > 0:
                # Même Crawl-delay que bulbapedia.py -- ce module appelle
                # aussi bulbapedia.fetch_wikitext une fois par set_code (cf.
                # docstring module), pas de raison d'être moins poli ici.
                time.sleep(bulbapedia.REQUEST_PAUSE_SECONDS)
            try:
                title = (
                    bulbapedia.JP_BULBAPEDIA_TITLE_OVERRIDES.get(set_code)
                    or bulbapedia._guess_title(set_code)
                )
                result = bulbapedia.fetch_wikitext(title)
                if result is None:
                    skipped.append(set_code)
                    continue
                wikitext, _resolved = result
                ja_names = extract_ja_names(wikitext)
                set_dir = next((ja_index[n] for n in ja_names if n in ja_index), None)
                if set_dir is None:
                    skipped.append(set_code)
                    continue
                by_numerator = parse_set_cards(Path(set_dir))
                n = sync_set_rarities(set_code, by_numerator)
                if n == 0:
                    skipped.append(set_code)
                    print(f"  {set_code}: aucune rareté trouvée (ignoré)")
                else:
                    total += n
                    print(f"  {set_code}: {n} carte(s) traitée(s)")
            except Exception as exc:
                print(f"  {set_code}: erreur -- {exc}")
                errors.append({"set_code": set_code, "error": str(exc)})

        return {"total": total, "skipped": skipped, "errors": errors}
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def main():
    from dotenv import load_dotenv

    load_dotenv()
    print("== Backfill rareté Pokémon JP (TCGdex) ==")
    result = sync_all_remaining_jp_rarities()
    print(f"\nTerminé : {result['total']} traité(s) au total.")
    if result["skipped"]:
        print(f"Ignorés (aucune rareté trouvée) : {len(result['skipped'])} set(s)")
    if result["errors"]:
        print(f"Erreurs : {result['errors']}")


if __name__ == "__main__":
    main()
