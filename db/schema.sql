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
