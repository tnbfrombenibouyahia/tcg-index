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
  release_date  DATE,                 -- date de sortie du set (NULL si inconnue/bucket non-standard)
  code          TEXT,                 -- numéro de carte dans le set (ex. '065/165'), NULL pour le scellé
  image_url     TEXT,                 -- image produit (taille 'medium'), NULL si absente côté source
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
  source        TEXT NOT NULL,        -- 'justtcg', 'pricecharting'
  grade         TEXT NOT NULL DEFAULT 'ungraded',  -- 'ungraded', 'psa7'..'psa10' ; toujours 'ungraded' pour le scellé
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (item_id, captured_at, source, grade)   -- un prix par item/jour/source/grade
);

-- Ventes individuelles (PriceCharting -- table "Sold Listings" des pages carte) :
-- append-only, grain différent de price_snapshots (une ligne par transaction
-- réelle, pas par jour). Sert au calcul de volume (par TCG/set/carte/année/
-- personnage via jointure sur items), pas encore utilisé par un calcul.
CREATE TABLE sales (
  id                BIGSERIAL PRIMARY KEY,
  item_id           BIGINT NOT NULL REFERENCES items(id),
  sale_date         DATE NOT NULL,
  price             NUMERIC(12,2) NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'USD',
  grade             TEXT NOT NULL DEFAULT 'ungraded',  -- même vocabulaire que price_snapshots.grade
  marketplace       TEXT NOT NULL,        -- 'ebay', 'tcgplayer' (marché d'origine de la vente)
  external_sale_id  TEXT NOT NULL,        -- id de l'annonce chez le marketplace, clé naturelle de dédup
  title             TEXT,                 -- titre de l'annonce (QA du matching)
  source            TEXT NOT NULL DEFAULT 'pricecharting',
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (marketplace, external_sale_id)
);

-- Volume d'échange quotidien : agrégat de `sales` (nb de ventes + $ total),
-- même grain (index_code, captured_at) que index_values mais pas de
-- chaînage -- chaque jour est indépendant. Alimente une future pondération
-- par volume de l'indice de prix (cf. handoff §8) ; couverture limitée aux
-- singles des sets récents pour l'instant (même scope que `sales`).
CREATE TABLE IF NOT EXISTS index_volume (
  id            BIGSERIAL PRIMARY KEY,
  index_code    TEXT NOT NULL,
  captured_at   DATE NOT NULL,
  sales_count   INTEGER NOT NULL,
  sales_value   NUMERIC(14,2) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (index_code, captured_at)
);

-- Ratio EV (Expected Value) d'un scellé "Booster Box" : compare son prix
-- marché à la valeur de ses singles en loose (ungraded) du même set, pour
-- repérer les scellés potentiellement sous-évalués (cf. discussion
-- 2026-07-31, index/sealed_ev.py pour la méthodo complète). Un seul scellé
-- retenu par set (le Booster Box standard, pas Case/Half/ETB/Tin). Deux
-- modes plutôt qu'un vrai calcul d'EV par pack : pas de données de
-- pull-rate disponibles, donc ce sont des signaux comparatifs entre sets,
-- pas une espérance statistique.
--
-- box_price = médiane des 3 dernières ventes individuelles (`sales`), pas
-- l'agrégat PriceCharting seul -- cf. incident Deoxys Booster Box (agrégat
-- corrompu par une vente d'édition italienne mal classée sur un item peu
-- liquide). box_reliability_score (0-100) quantifie la confiance dans ce
-- prix : dispersion entre les 3 ventes, étalement temporel, nombre de
-- ventes trouvées (cf. sealed_ev.py pour la formule). box_price_source
-- indique quand on retombe sur l'agrégat faute de ventes individuelles
-- ('pricecharting_aggregate' vs 'sales_median').
CREATE TABLE IF NOT EXISTS sealed_ev (
  id                    BIGSERIAL PRIMARY KEY,
  item_id               BIGINT NOT NULL REFERENCES items(id),  -- le Booster Box
  captured_at           DATE NOT NULL,
  box_price             NUMERIC(12,2) NOT NULL,
  box_price_source      TEXT NOT NULL DEFAULT 'pricecharting_aggregate',
  box_sales_used        INTEGER NOT NULL DEFAULT 0,
  box_dispersion        NUMERIC(10,4),
  box_span_days         INTEGER,
  box_reliability_score NUMERIC(5,1),
  singles_count         INTEGER NOT NULL,        -- nb de singles du set trouvés (transparence/QA)
  singles_total_value   NUMERIC(14,2) NOT NULL,  -- somme de tous les singles (loose)
  singles_top10_value   NUMERIC(14,2) NOT NULL,  -- somme des 10 singles les plus chers
  ev_ratio_total        NUMERIC(10,4) NOT NULL,  -- singles_total_value / box_price
  ev_ratio_top10        NUMERIC(10,4) NOT NULL,  -- singles_top10_value / box_price
  created_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE (item_id, captured_at)
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
