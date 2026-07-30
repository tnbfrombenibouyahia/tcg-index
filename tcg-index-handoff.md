# TCG Market Index — Handoff Doc

Document de cadrage pour démarrer le build dans l'IDE. Objectif : construire un
« indice de marché » type finance pour les TCG (Pokémon, One Piece, puis autres),
couvrant **cartes ET scellé**, avec méthodologie publique.

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

---

## 4. TEST À FAIRE AVANT DE CODER L'ARCHI (bloquant)

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

Trois tables suffisent pour le MVP.

```sql
-- Référentiel : ce qu'on suit
CREATE TABLE items (
  id            BIGSERIAL PRIMARY KEY,
  external_id   TEXT NOT NULL,        -- id chez la source de référentiel
  source        TEXT NOT NULL,        -- 'apitcg'
  cardmarket_id TEXT,                 -- clé de jointure vers les prix si dispo
  tcgplayer_id  TEXT,                 -- idem
  tcg           TEXT NOT NULL,        -- 'pokemon', 'onepiece'
  category      TEXT NOT NULL,        -- 'sealed_display', 'sealed_etb', 'single'
  set_code      TEXT,                 -- set / série
  language      TEXT NOT NULL,        -- 'EN', 'JP', 'FR'
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
  currency      TEXT NOT NULL,        -- 'EUR', 'USD'
  volume        INTEGER,             -- nb de ventes si dispo, sinon NULL
  source        TEXT NOT NULL,        -- 'justtcg', 'pokemon-api'
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (item_id, captured_at, source)   -- un prix par item/jour/source
);

-- Indice calculé : l'output, ce que le front lit
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
| Calcul indice | **Python** | Script séparé, lit `price_snapshots`, écrit `index_values` |
| Base | **Postgres** | TimescaleDB en option plus tard pour le confort temporel |
| API + Front | **Next.js** | Routes API lisent `index_values` + pages |
| Charts | **Lightweight Charts** (TradingView, OSS) | Look « finance » gratuit ; Recharts si plus simple |
| Hébergement | **VPS** (Hetzner ~5€/mois) ou Postgres managé + Vercel | |
| Cron | **GitHub Actions** planifié (gratuit, versionné) | ou cron VPS |

Pas d'Airflow, pas de Kafka : quelques milliers d'items une fois par jour = un script
de ~200 lignes.

---

## 7. Structure du repo

```
/ingestion
  /sources
    apitcg.py         # référentiel : peuple/maj la table items
    justtcg.py        # prix : écrit dans price_snapshots
    pokemon_api.py    # (plan B) prix scellé
  orchestrator.py     # appelle les sources, INSERT ... ON CONFLICT DO NOTHING
/index
  calculate.py        # lit price_snapshots, écrit index_values
  methodology.py      # les formules (À DÉFINIR ENSEMBLE — cf. section 8)
/web                  # next.js
  /app/api            # routes qui lisent index_values -> JSON
  /app                # pages + charts
/db
  schema.sql          # les 3 tables ci-dessus
  migrations/
/shared
  db.py               # connexion partagée ingestion/index
```

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

1. **[TEST]** Valider le combo API TCG + JustTCG (section 4) — bloquant.
2. `db/schema.sql` — créer les 3 tables.
3. `ingestion/sources/apitcg.py` — peupler `items` (référentiel).
4. `ingestion/sources/justtcg.py` — premier snapshot de prix dans `price_snapshots`.
5. `orchestrator.py` + cron quotidien — **commencer à accumuler l'historique dès que possible.**
6. `index/methodology.py` + `calculate.py` — méthodo simple (équipondéré, base 100, chaînage).
7. `web/` — API + un premier chart Lightweight Charts sur l'indice global.
8. Itérer : corrélations, sous-indices par série/langue, volume.

> Le point 5 est prioritaire dans le temps : chaque jour sans snapshot est un jour
> d'historique perdu à jamais.

---

## 10. Rappels de cadrage

- Le front ne lit **jamais** les prix bruts. Uniquement `index_values`.
- On **empile**, on n'écrase jamais un prix.
- On stocke la devise d'origine, on convertit au calcul.
- Ajouter une source = un module derrière l'interface commune, rien d'autre à toucher.
- L'historique est l'actif. Le front est cosmétique.
