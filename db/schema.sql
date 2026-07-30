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
