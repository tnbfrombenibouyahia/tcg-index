# TCG Market Index — Handoff Doc

Document de cadrage pour démarrer le build dans l'IDE. Objectif : construire un
« indice de marché » type finance pour les TCG (Pokémon, One Piece, puis autres),
couvrant **cartes ET scellé**, avec méthodologie publique.

> **Mise à jour 2026-07-30** : les sections ci-dessous sont le document de
> cadrage d'origine (gardé tel quel pour la trace du raisonnement). L'état
> réel du build est documenté en section 11, en fin de doc.

---

## 1. Le projet en une phrase

Un « Bloomberg du marché TCG » : des indices (base 100) qui suivent l'évolution
du marché Pokémon / One Piece dans son ensemble — scellé (displays, ETB) et cartes —
avec sous-indices par TCG, par série, par langue, et analyse de corrélations.

### Positionnement (décisions déjà prises)
- **Produit public, gratuit, communautaire.** Pas de monétisation.
- **Modèle A : indice transformé.** On ne redistribue pas les prix bruts carte-par-carte
  d'une source. On publie *notre indice* (produit dérivé), avec la méthodo expliquée.
  Les prix bruts sont un *input* de calcul, jamais l'output affiché.
- **Méthodologie publique** : le calcul de l'indice est documenté et transparent.

---

## 2. Principe d'architecture (règle d'or)

Flux **strictement unidirectionnel** :

```
[Ingestion]  ->  [Postgres]  ->  [Calcul indice]  ->  [API + Front]
 sources          append-only     job séparé          Next.js
```

- Les prix bruts **entrent** (ingestion) et sont archivés **append-only** (jamais d'UPDATE).
- L'indice se **calcule** à partir des prix archivés (job séparé, rejouable).
- Le front ne lit **que** l'indice, jamais `price_snapshots` directement.

Pourquoi séparer ingestion et calcul : quand on affinera la méthodo, on veut
**recalculer tout l'historique sans re-scraper**. Les prix bruts archivés le permettent.

Pourquoi append-only : **l'historique est l'actif du projet.** Personne ne nous le
donnera rétroactivement. Il se construit snapshot par snapshot à partir du jour 1.

---

## 3. Sources de données

### Constat de fond
Aucune API ne *produit* la donnée : toutes scrapent Cardmarket / TCGPlayer en amont
et livrent du JSON propre. Le choix porte sur : couverture scellé, historique fourni,
licence, multi-langues. Notre indice transformé reste notre production quelle que soit
la source du prix brut.

### Combo retenu (à valider par le test ci-dessous)
| Couche | Source | Rôle |
|---|---|---|
| **Référentiel** | **API TCG** (apitcg.com, open source) | Catalogue : quel item existe, set, langue, carte vs scellé |
| **Prix + historique** | **JustTCG** (justtcg.com) | Prix, historique (7d/30d/90d/180d/1y), filtre « Sealed » natif, licence dérivés OK |

- Docs API TCG : https://docs.apitcg.com/
- Docs JustTCG : https://justtcg.com/docs

### Plan B (si le scellé JustTCG est trop peu profond)
- **pokemon-api.com** — agrège Cardmarket EUR + eBay gradé + TCGPlayer, riche sur multi-marché.
  À brancher *uniquement pour le scellé*, en gardant JustTCG pour les cartes.
  C'est un module d'ingestion de plus, même interface, même table `price_snapshots`,
  juste un `source` différent.

### Écartées
- **cardmarketapi.com / tcg-cardmarket-api.com** : proxys de scraping, 1 appel = 1 carte,
  cache compté dans le quota, pas d'historique profond. Explosent tout quota gratuit sur
  un indice large.
- **eBay API** : usage hors licence (destinée à faire du business SUR eBay, pas à bâtir
  un indice) + accès Buy APIs réservé aux partenaires.

### Mise à jour — troisième source ajoutée en cours de build : PriceCharting (scraping)

JustTCG s'est révélé peu fiable en usage réel : quota gratuit trop bas pour
suivre tout le catalogue (100 req/jour, 20 items/requête — voir §11), et un
incident où l'API a renvoyé `401 INVALID_API_KEY` en pleine session malgré une
clé valide et un quota loin d'être atteint (bug côté leur infra, jamais
totalement élucidé).

**PriceCharting.com** (pas d'API officielle, scraping HTML — `robots.txt`
autorise `/game/` et `/console/`) s'est avéré supérieur sur plusieurs points :
pas de quota, une seule requête récupère tout un set (scellé + singles), et
les pages carte individuelles exposent les **valeurs gradées PSA** (7 à 10),
une donnée qu'aucune des deux API n'offre. C'est devenu la source de prix
principale ; JustTCG reste en place mais en pause (cf. §11).

---

## 4. TEST À FAIRE AVANT DE CODER L'ARCHI (bloquant)

> **Fait.** Réserve 1 et 2 validées pour Pokémon (échantillon élargi à 6 sets
> réels) : scellé 87% avec historique exploitable, singles 80%, `tcgplayer.id`
> présent sur 100% des produits API TCG. One Piece non testé via ce combo —
> le pivot vers PriceCharting (§3) l'a rendu obsolète pour ce TCG.

Deux réserves à lever avec les tiers gratuits, sur un échantillon de **2-3 sets récents
Pokémon + One Piece** :

### Réserve 1 — Profondeur du scellé chez JustTCG
Le filtre « Sealed » existe, mais est-ce que **tous les displays/ETB par set et par langue**
remontent avec un **historique exploitable**, ou juste une poignée de produits populaires ?
- [ ] Requêter la liste des produits scellés sur 2-3 sets récents
- [ ] Compter combien de displays/ETB remontent
- [ ] Vérifier que chacun a un historique (pas juste un prix spot)
- **Si trop peu profond → activer le plan B (pokemon-api.com) pour le scellé.**

### Réserve 2 — Identifiant partagé entre API TCG et JustTCG
Pour relier une entrée référentiel (API TCG) à son prix (JustTCG), il faut une clé fiable.
- [ ] Vérifier si les deux exposent un **ID Cardmarket ou TCGPlayer** commun
- [ ] Si oui → matcher dessus (propre)
- [ ] Si non → matcher sur nom + set + numéro (fragile, prévoir couche de réconciliation)

> Une heure de manipulation décide si le combo tient tel quel ou s'il faut un 3e larron.

---

## 5. Schéma de base (Postgres) — MVP

Trois tables suffisent pour le MVP (+ `sales`, ajoutée le 2026-07-30, cf. plus bas).

> **Schéma réel au 2026-07-30** (a évolué depuis la version d'origine
> ci-dessous — colonnes ajoutées en gras dans les commentaires) :

```sql
-- Référentiel : ce qu'on suit
CREATE TABLE items (
  id            BIGSERIAL PRIMARY KEY,
  external_id   TEXT NOT NULL,        -- id chez la source de référentiel
  source        TEXT NOT NULL,        -- 'apitcg'
  cardmarket_id TEXT,                 -- clé de jointure vers les prix si dispo
  tcgplayer_id  TEXT,                 -- idem
  tcg           TEXT NOT NULL,        -- 'pokemon', 'one-piece'
  category      TEXT NOT NULL,        -- 'sealed', 'single' (granularité display/etb pas dispo côté source)
  set_code      TEXT,                 -- set / série
  release_date  DATE,                 -- AJOUTÉ : date de sortie du set (NULL si bucket non-standard)
  code          TEXT,                 -- AJOUTÉ : numéro de carte (format varie par TCG, cf. §11)
  image_url     TEXT,                 -- AJOUTÉ : image produit, référence le CDN externe (pas de ré-hébergement)
  language      TEXT NOT NULL,        -- 'EN' ou 'JP' uniquement (FR écarté, cf. §11)
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source, external_id)
);

-- Prix bruts : append-only, jamais d'UPDATE
CREATE TABLE price_snapshots (
  id            BIGSERIAL PRIMARY KEY,
  item_id       BIGINT NOT NULL REFERENCES items(id),
  captured_at   DATE NOT NULL,        -- jour du snapshot
  price         NUMERIC(12,2) NOT NULL,
  currency      TEXT NOT NULL,        -- 'USD' en pratique (sources = TCGPlayer/PriceCharting)
  volume        INTEGER,             -- nb de ventes si dispo, sinon NULL (jamais rempli pour l'instant)
  source        TEXT NOT NULL,        -- 'justtcg', 'pricecharting'
  grade         TEXT NOT NULL DEFAULT 'ungraded',  -- AJOUTÉ : 'ungraded'/'psa7'..'psa10', toujours 'ungraded' pour le scellé
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (item_id, captured_at, source, grade)   -- un prix par item/jour/source/grade
);

-- AJOUTÉ 2026-07-30 : ventes individuelles (PriceCharting, table "Sold
-- Listings" des pages carte -- eBay/TCGPlayer/Goldin/Heritage/PWCC...).
-- Grain différent de price_snapshots : une ligne par transaction réelle, pas
-- par jour. Sert à calculer du volume par TCG/set/carte/année/personnage
-- (via jointure sur items) -- pas encore utilisé par un calcul, juste
-- archivé pour l'instant.
CREATE TABLE sales (
  id                BIGSERIAL PRIMARY KEY,
  item_id           BIGINT NOT NULL REFERENCES items(id),
  sale_date         DATE NOT NULL,
  price             NUMERIC(12,2) NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'USD',
  grade             TEXT NOT NULL DEFAULT 'ungraded',  -- même vocabulaire que price_snapshots.grade (PSA7-10 uniquement, cf. §11)
  marketplace       TEXT NOT NULL,        -- 'ebay', 'tcgplayer', 'goldin', 'heritage', 'pwcc'...
  external_sale_id  TEXT NOT NULL,        -- id de l'annonce chez le marketplace -- clé naturelle de dédup
  title             TEXT,
  source            TEXT NOT NULL DEFAULT 'pricecharting',
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (marketplace, external_sale_id)
);

-- Indice calculé : l'output, ce que le front lit (PAS ENCORE CONSTRUIT, cf. §11)
CREATE TABLE index_values (
  id            BIGSERIAL PRIMARY KEY,
  index_code    TEXT NOT NULL,        -- 'PKM_DISPLAYS', 'PKM_SINGLES', 'OP_DISPLAYS'...
  captured_at   DATE NOT NULL,
  value         NUMERIC(12,4) NOT NULL,  -- niveau en points (base 100)
  constituents  INTEGER NOT NULL,     -- nb d'items dans l'indice ce jour-là
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (index_code, captured_at)
);
```

### Points clés du schéma
- `UNIQUE` sur `price_snapshots` → protège des doublons si un job tourne deux fois.
- `volume` nullable → ne bloque pas quand la source ne le donne pas.
- `cardmarket_id` / `tcgplayer_id` sur `items` → clé de jointure vers les prix (cf. réserve 2).
- `index_values` totalement découplée des prix bruts → le front ne connaît pas `price_snapshots`.

### Devises
eBay/US en USD, Cardmarket en EUR. **Ne pas convertir à l'ingestion.** Stocker le prix
dans sa devise d'origine, convertir au moment du calcul d'indice avec un taux qu'on
snapshote aussi (sinon on ne peut pas rejouer l'historique). Prévoir une petite table
`fx_rates (date, currency, rate)` quand on en arrivera là.

---

## 6. Stack technique

| Brique | Choix | Note |
|---|---|---|
| Ingestion | **Python** | Un module par source, interface commune `fetch() -> list[PriceRow]` |
| Scraping | **requests + BeautifulSoup4** | Ajouté pour PriceCharting (§3) — pas de blocage observé, Selenium jamais nécessaire |
| Calcul indice | **Python** | Script séparé, lit `price_snapshots`, écrit `index_values` — **pas encore codé** |
| Base | **Postgres (Supabase)** | Connexion via le *connection pooler* Supavisor, pas la connexion directe (IPv6-only, cf. §11) |
| API + Front | **Next.js** | Routes API lisent `index_values` + pages — **pas encore codé** |
| Charts | **Lightweight Charts** (TradingView, OSS) | Look « finance » gratuit ; Recharts si plus simple |
| Hébergement | **VPS** (Hetzner ~5€/mois) ou Postgres managé + Vercel | Postgres déjà sur Supabase |
| Cron | **GitHub Actions** planifié (gratuit, versionné) | ✅ en place depuis le 2026-07-30 (`.github/workflows/`, cf. §11) |

Pas d'Airflow, pas de Kafka : quelques milliers d'items une fois par jour = un script
de ~200 lignes.

---

## 7. Structure du repo

> **Réel au 2026-07-30** (✅ = existe, ⬜ = pas encore codé) :

```
/ingestion
  /sources
    apitcg.py         ✅ référentiel : peuple/maj items (sync_items), + client brut (list_sets/list_products)
    justtcg.py         ✅ prix scellé récent, en pause (incident 401, cf. §11)
    pricecharting.py   ✅ AJOUTÉ — scraping : prix set + singles + gradation PSA, pas dans le plan d'origine
    base.py            ✅ interface PriceRow (déclarative, pas strictement suivie — cf. note ci-dessous)
  probe_combo.py       ✅ sonde de validation Réserve 1/2 (§4), réutilisable via CLI
  orchestrator.py      ✅ AJOUTÉ 2026-07-30 — enchaîne référentiel + prix, appelé par le cron GitHub Actions
/.github/workflows
  daily-sync.yml         ✅ référentiel + prix ungraded, quotidien (06:00 UTC)
  grades-and-sales.yml   ✅ gradation PSA + historique de ventes, sets récents, 3x/semaine (lun/mer/ven 03:00 UTC)
/index
  calculate.py         ⬜ pas encore codé
  methodology.py        ⬜ pas encore codé — méthodologie toujours à définir (§8, session dédiée à venir)
/web                    ⬜ pas encore codé (next.js)
/db
  schema.sql           ✅ à jour (§5)
  apply_schema.py      ✅ AJOUTÉ — applique schema.sql via DATABASE_URL
  migrations/           ⬜ pas de dossier séparé — évolutions faites en ALTER TABLE ad hoc pour l'instant
/shared
  db.py                ✅ connexion partagée (psycopg2 + pooler Supabase)
```

Note sur `base.py` : l'idée d'origine (un `fetch()` générique consommé par un
orchestrateur central) n'a pas survécu telle quelle — `apitcg.py` et
`pricecharting.py` écrivent directement en base depuis leur propre
`sync_*()`/`main()`, chacun avec sa logique de matching/dédup spécifique à sa
source. Pas de perte de découplage réelle (le schéma reste la seule interface
partagée), juste pas d'orchestrateur unique pour l'instant.

### Interface commune des sources (à respecter)
Chaque source de prix expose la même signature, pour que l'orchestrateur soit agnostique
et qu'ajouter une source (plan B) ne touche ni le schéma ni le calcul :

```python
# ingestion/sources/base.py
from dataclasses import dataclass
from datetime import date

@dataclass
class PriceRow:
    external_id: str      # id de l'item chez la source de prix
    price: float
    currency: str
    captured_at: date
    volume: int | None
    source: str

def fetch() -> list[PriceRow]:
    ...
```

---

## 8. Méthodologie d'indice (À FAIRE ENSEMBLE — pas encore figée)

C'est le **cœur de valeur** du projet, à traiter séparément du code de plomberie.
Décisions à trancher avant de coder `methodology.py` :

- **Base 100 à une date de référence.** L'indice s'exprime en points, pas en euros.
  Permet d'agréger un display à 90€ et une carte à 3€ sans que l'un écrase l'autre.
- **Pondération.** Pour le MVP : **équipondéré au sein de chaque catégorie**, avec
  **sous-indices séparés** (displays / cartes) plutôt qu'un chiffre mélangé.
  (Pondéré par volume = mieux mais besoin du volume ; par capitalisation = tirage inconnu, écarté.)
- **Chaînage (piège technique).** Quand un nouveau set entre dans l'univers, ne pas
  l'ajouter brutalement (créerait un saut artificiel). Ajuster un facteur de chaînage
  pour que l'indice reste continu. À coder dès le départ, sinon l'historique devient
  inexploitable dès le premier nouveau set (~2 mois vu le rythme de sorties).

> Prochaine session dédiée : formules concrètes (niveau, facteur de chaînage, sous-indices)
> avec exemple chiffré.

---

## 9. Ordre de construction recommandé

1. ✅ **[TEST]** Valider le combo API TCG + JustTCG (section 4) — Pokémon validé, One Piece court-circuité par le pivot PriceCharting.
2. ✅ `db/schema.sql` — créer les tables (schéma étendu depuis, cf. §5).
3. ✅ `ingestion/sources/apitcg.py` — peupler `items` (référentiel) — **Pokémon et One Piece**, anglais uniquement (cf. §11).
4. 🟡 `ingestion/sources/justtcg.py` — fait puis **mis en pause** (incident 401, §11) ; `pricecharting.py` a pris le relais comme source de prix principale (pas prévu dans le plan d'origine).
5. ✅ `orchestrator.py` + cron — **fait le 2026-07-30**. `ingestion/orchestrator.py` enchaîne référentiel + prix ; deux workflows GitHub Actions planifiés (`.github/workflows/`) : quotidien (référentiel + prix ungraded, tous les sets mappés) et hebdomadaire (gradation PSA, sets récents uniquement — trop coûteux en requêtes pour du quotidien). Nécessite les secrets repo `APITCG_API_KEY` et `DATABASE_URL` (pooler !) pour tourner.
6. ⬜ `index/methodology.py` + `calculate.py` — **pas commencé**, discussion dédiée prévue en prochaine session.
7. ⬜ `web/` — pas commencé.
8. ⬜ Itérer : corrélations, sous-indices par série/langue, volume.

> Le point 5 était prioritaire dans le temps : chaque jour sans snapshot est un jour
> d'historique perdu à jamais. **Résolu le 2026-07-30** (cf. point 5 et §11) — reste
> à activer les secrets GitHub et vérifier le premier run réel.

---

## 10. Rappels de cadrage

- Le front ne lit **jamais** les prix bruts. Uniquement `index_values`.
- On **empile**, on n'écrase jamais un prix.
- On stocke la devise d'origine, on convertit au calcul.
- Ajouter une source = un module derrière l'interface commune, rien d'autre à toucher.
- L'historique est l'actif. Le front est cosmétique.

---

## 11. État actuel (2026-07-30)

### Infra
- Postgres hébergé sur **Supabase**. `DATABASE_URL` doit pointer sur le
  *connection pooler* (`aws-0-*.pooler.supabase.com:6543`), pas la connexion
  directe (`db.*.supabase.co:5432`) — cette dernière est IPv6-only et ne
  fonctionne pas sur un réseau sans route IPv6.
- Repo Git initialisé et poussé : **https://github.com/tnbfrombenibouyahia/tcg-index** (privé).
  `.env` exclu via `.gitignore` (clés API + mot de passe DB jamais commités).

### Référentiel (`items`)
| TCG | Items | Sealed | Singles | Avec image |
|---|---|---|---|---|
| Pokémon | 32 529 | 4 722 | 27 764 (~) | 32 502 (99,9%) |
| One Piece | 7 200 | 627 | 6 573 | 7 200 (100%) |

Anglais uniquement pour l'instant (API TCG, via TCGPlayer, ne couvre pas le
japonais). **Décision de scope langues** : anglais + japonais visés à terme
(marchés distincts, sous-indices séparés — pas de tentative de relier une
carte EN à son équivalent JP), **français écarté** (marché Cardmarket, mal
couvert par TCGPlayer/PriceCharting, source fiable pas identifiée).

### Prix (`price_snapshots`)
| Source | État | Couverture |
|---|---|---|
| JustTCG | **En pause** — `401 INVALID_API_KEY` en pleine session le 2026-07-29 malgré clé valide et quota loin d'être atteint ; cause jamais confirmée (probable incident côté leur infra). 435 items Pokémon scellé déjà en base (historique 7j chacun), rien perdu, reprise possible à tout moment (upsert idempotent). | Pokémon scellé récent uniquement |
| PriceCharting | Actif, source principale | Pokémon : 17 962 items avec prix (2 496 avec ≥1 palier gradé) ; One Piece : 4 203 items (583 gradés). 150/217 sets Pokémon mappés, 76/84 One Piece (mapping manuel set_code ↔ slug PriceCharting, pas de découverte automatique). |

Gradation PSA (`grade` sur `price_snapshots`, ajouté le 2026-07-30, sur
demande explicite) : 10 128 lignes gradées (psa7: 456, psa8: 899, psa9:
2 841, psa9.5: 2 894, psa10: 3 038), scope volontairement limité aux sets
sortis dans les 18 derniers mois (1 requête HTTP par carte côté
PriceCharting — tout le catalogue prendrait ~12h).

### Décisions prises pendant le build (pas dans le cadrage d'origine)
- **Prix scellé PriceCharting** : la colonne `used_price` ("Ungraded") sert de
  référence pour le scellé aussi, pas `new_price` ("factory sealed") —
  contre-intuitif mais confirmé sur données réelles (`new_price` souvent vide
  ou incohérent, la majorité du volume de vente scellé semble catégorisé
  "Used" côté source).
- **Images** : `items.image_url` référence directement le CDN externe
  (TCGPlayer via API TCG, PriceCharting en fallback documenté) — pas de
  ré-hébergement, donc pas de sujet de droits d'image ni de stockage.

### Ventes individuelles (`sales`, ajouté le 2026-07-30)
Chaque page carte individuelle PriceCharting a aussi une table "Sold
Listings" (date / titre / prix) par palier de gradation, en plus des prix
déjà scrapés — vérifié en conditions réelles sur Charizard #4 Base Set (373
ventes, 2023-12-09 → aujourd'hui, marketplaces au-delà d'eBay/TCGPlayer :
Goldin, Heritage, PWCC). Comme c'est la même page que celle déjà visitée
pour la gradation PSA, `fetch_card_details()` remplace l'ancien
`fetch_card_grades()` et extrait les deux en une seule requête HTTP —
aucun coût réseau supplémentaire.

- Scope identique à la gradation : sets des 18 derniers mois, singles
  uniquement (pas le scellé, pas vérifié si les pages scellé ont cette table).
- Vocabulaire de grade limité à PSA7-10 + ungraded (mêmes 6 onglets que
  `price_snapshots.grade`) — les onglets CGC/BGS/SGC/TAG/ACE et les grades
  bruts 1-6 existent sur la page mais sont ignorés (hors scope PSA décidé
  précédemment, pas de raison de l'élargir ici).
- Dédup sur `(marketplace, external_sale_id)` (id natif de l'annonce, ex.
  `ebay-157845176074`) — rejouable sans doublons, testé en conditions réelles
  (rerun identique → même nombre de lignes en base).
- **Limite découverte en marge** : chaque onglet de gradation semble plafonné
  à ~30 ventes visibles (pas de pagination trouvée). Sur une carte à ~1
  vente/semaine, ce plafond correspond à peu près à 7 mois d'historique — au
  delà, les ventes plus anciennes ne sont juste plus récupérables. C'est
  pour ça que le cron tourne 3x/semaine plutôt qu'1x : espacer davantage
  risque de perdre des ventes sur les cartes à volume plus élevé.
- Devise : USD figé en dur pour l'ingestion (comme `price_snapshots`) —
  décision explicite de ne traiter la conversion/l'affichage multi-devise que
  côté `web/` plus tard, pas à l'ingestion.
- Objectif : permettre un calcul de volume par TCG / set / carte / année /
  personnage via jointure sur `items`, sans scraping supplémentaire par
  dimension — pas encore branché sur `index/calculate.py` (toujours pas codé).

### Orchestration & cron (ajouté le 2026-07-30, mis à jour le même jour)
- `ingestion/orchestrator.py` : enchaîne référentiel (API TCG, pokemon +
  one-piece) puis prix (PriceCharting, tous les sets mappés). `--grades`
  ajoute, sur les sets récents, la gradation PSA **et** l'historique de
  ventes (même requête HTTP, cf. ci-dessus) ; `--skip-items` saute le
  référentiel (utilisé par le run grades/ventes, déjà fait par le quotidien).
- Deux workflows GitHub Actions (`.github/workflows/`) :
  - `daily-sync.yml` : tous les jours à 06:00 UTC — référentiel + prix ungraded.
  - `grades-and-sales.yml` : lundi/mercredi/vendredi à 03:00 UTC — gradation
    PSA + ventes, sets récents (1 requête/carte, trop coûteux en quotidien ;
    3x/semaine plutôt qu'1x à cause du plafond ~30 ventes/onglet, cf.
    ci-dessus).
  - Les deux ont aussi `workflow_dispatch` pour un déclenchement manuel.
- **À faire côté GitHub avant que ça tourne** : ajouter les secrets du repo
  (Settings > Secrets and variables > Actions) `APITCG_API_KEY` et
  `DATABASE_URL` (le pooler Supabase, pas la connexion directe — cf. §11
  infra). JustTCG n'est pas appelé par le cron (toujours en pause, reprise
  manuelle uniquement).
- Chaque sync est déjà idempotente (upsert / `ON CONFLICT DO NOTHING`) : un
  run manqué ou rejoué ne crée pas de doublons — vérifié en conditions
  réelles pour `sales` aussi.
- Storage Supabase : plan **Free (500 MB)** utilisé délibérément pendant la
  phase d'évaluation (upgrade Pro seulement si l'app montre de la valeur).
  À ~140 MB/mois de croissance mesurée (31 MB au 2026-07-30), le quota se
  remplit en ~3-4 mois — `orchestrator.py` affiche la taille de la base à
  chaque run (`print_storage_usage()`) pour le voir venir dans les logs
  Actions plutôt que d'être surpris par un run qui échoue faute de place.
- Pas encore vérifié : le tout premier run réel en conditions Actions (temps
  d'exécution, quota de minutes GitHub sur le repo privé — 2000 min/mois côté
  gratuit, à surveiller si les runs traînent).

### Connu, pas résolu
- Méthodologie d'indice (§8) : toujours à définir, session dédiée à venir —
  `sales` donne maintenant la matière pour une pondération par volume, mais
  rien n'est branché.
- JustTCG : blocage non résolu, à retenter/contacter le support si besoin.
- `web/` et `index/` : dossiers vides, rien de commencé.
- `sales` : scope singles/sets récents uniquement pour l'instant, pas testé
  sur le scellé.
