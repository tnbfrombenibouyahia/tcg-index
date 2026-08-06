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
  rarity        TEXT,                 -- valeur brute de API TCG attributes.Rarity ; NULL pour le scellé et tant que non backfillé
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
-- lib/queries/gradingRoi.ts fait un DISTINCT ON (item_id, grade) trié par
-- captured_at DESC, created_at DESC sur toute la table (dernier prix par
-- carte/grade) -- la contrainte UNIQUE ci-dessus ne matche pas cet ordre de
-- tri, donc CockroachDB devait scanner + trier 434k lignes à chaque
-- chargement de /grading-roi. Cet index reprend exactement l'ordre du
-- ORDER BY : le DISTINCT ON peut alors streamer sans étape de tri séparée
-- (cf. idx_sales_grade_date ci-dessus, même incident 2026-08-06).
CREATE INDEX IF NOT EXISTS idx_price_snapshots_item_grade_captured
    ON price_snapshots (item_id, grade, captured_at DESC, created_at DESC) STORING (price);

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
  -- pas de colonne `source` ici (contrairement à price_snapshots) : ventes
  -- scrapées uniquement depuis PriceCharting, une valeur constante n'a rien
  -- à apporter -- supprimée le 2026-08-05 après avoir mesuré ~15-20 Mo
  -- gaspillés dessus (donnée+index) sur 500 Mo de plan Free, cf. mémoire
  -- projet "supabase_storage_plan".
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (marketplace, external_sale_id)
);
-- lib/queries/divergence.ts et lib/queries/gradingRoi.ts filtrent tous les
-- deux par grade + fenêtre de sale_date sur TOUTE la table (pas juste un
-- item_id) -- sans index, plein scan de `sales` (1M+ lignes) à chaque
-- chargement de /divergence ou /grading-roi, mesuré à ~3.3-3.9s de requête
-- pure (cf. discussion 2026-08-06, lenteur signalée par l'utilisateur).
-- STORING (item_id, price) évite un lookup vers la table principale pour
-- chaque ligne matchée. Ramène /divergence à ~0.7s de requête (indexé,
-- ~1% de la table scannée au lieu de 100%).
CREATE INDEX IF NOT EXISTS idx_sales_grade_date
    ON sales (grade, sale_date) STORING (item_id, price);

-- Supply active (pas un prix/une transaction) : comptage de listings actifs
-- (auction + fixed-price) par item, proxy de pression vendeuse ("combien de
-- gens essaient de se débarrasser de l'objet" -- demande utilisateur du
-- 2026-08-06, cf. mémoire projet "ebay_active_listings"). Grain gauge (photo
-- à l'instant T, comme price_snapshots) : `listing_count` plutôt qu'un prix,
-- pas de notion de devise.
--
-- Source : eBay Browse API (ingestion/sources/ebay.py). `buying_option`
-- vaut 'all' en v1 (auction + fixed-price combinés dans le même comptage
-- eBay, cf. ebay.py) -- séparer les deux doublerait le nombre de requêtes
-- par item pour un signal pas demandé explicitement ; 'auction'/'fixed_price'
-- restent des valeurs valides pour un futur découpage sans migration.
-- `grade` toujours 'ungraded' en v1 (seul le scellé est synchronisé, cf.
-- sync_active_listings_for_tcg -- pas de notion de gradation pour du scellé).
CREATE TABLE IF NOT EXISTS active_listings (
  id             BIGSERIAL PRIMARY KEY,
  item_id        BIGINT NOT NULL REFERENCES items(id),
  captured_at    DATE NOT NULL,
  marketplace    TEXT NOT NULL DEFAULT 'ebay',
  buying_option  TEXT NOT NULL DEFAULT 'all',    -- 'all' | 'auction' | 'fixed_price'
  grade          TEXT NOT NULL DEFAULT 'ungraded',
  listing_count  INTEGER NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (item_id, captured_at, marketplace, buying_option, grade)
);
CREATE INDEX IF NOT EXISTS idx_active_listings_item
    ON active_listings (item_id, captured_at DESC);

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

-- Journal des runs d'ingestion : une ligne par étape (pas par run entier),
-- écrite par ingestion/orchestrator.py via shared/sync_log.py. Sert au
-- dashboard "Live Market Data" côté web : status='running' + finished_at
-- NULL = étape en cours (le seul moyen de savoir "ce qui charge en ce
-- moment", vu que le cron GitHub Actions ne pousse aucun état ailleurs).
-- `tcg` est NULL pour les étapes qui portent sur les deux TCG à la fois
-- (calcul d'indice, EV scellé, volume) ; les étapes items/prices/grades_sales
-- ont une ligne par tcg (le prix scrape les deux dans le même appel Python,
-- mais on scinde `results` par tcg côté orchestrateur pour une fraîcheur
-- affichable séparément par TCG).
CREATE TABLE IF NOT EXISTS sync_runs (
  id            BIGSERIAL PRIMARY KEY,
  run_type      TEXT NOT NULL,        -- 'daily' | 'tier' | 'weekly'
  tier          TEXT,                 -- palier (cf. orchestrator.TIERS) si run_type='tier', sinon NULL
  step          TEXT NOT NULL,        -- 'items' | 'prices' | 'grades_sales' | 'index' | 'sealed_ev' | 'volume' | 'active_listings'
  tcg           TEXT,                 -- 'pokemon' | 'one-piece' | NULL (étape globale aux deux TCG)
  status        TEXT NOT NULL DEFAULT 'running',  -- 'running' | 'success' | 'error'
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  rows_written  INTEGER,
  detail        TEXT,                 -- résumé humain ("217 produits upsertés") ou message d'erreur
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON sync_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_running ON sync_runs (status) WHERE status = 'running';

-- Score de sous-évaluation par carte : compare une valeur théorique composite
-- (pull_cost × character_multiplier × collector_factor × demand_factor) au prix
-- marché réel pour détecter les cartes vendues en dessous de leur valeur
-- structurelle. undervalued_score > 1 = potentiellement sous-évalué.
--
-- MVP : collector_factor et demand_factor fixés à 1.0 (cf. index/undervalued.py
-- pour la méthodologie complète). pull_cost = pack_price × (1/pull_rate),
-- pull_rate dérivé structurellement depuis items.rarity (nb cartes de cette
-- rareté dans le set). pack_price dérivé du Booster Box (sealed_ev) ou table
-- statique de fallback (index/pack_price_table.py).
CREATE TABLE IF NOT EXISTS undervalued_scores (
  id                   BIGSERIAL PRIMARY KEY,
  item_id              BIGINT NOT NULL REFERENCES items(id),
  captured_at          DATE NOT NULL,
  -- inputs du calcul (pour audit/replay)
  pack_price           NUMERIC(12,2),          -- prix du pack dérivé (box/nb_packs)
  pull_rate            NUMERIC(10,6),          -- 1/nb_cartes_de_cette_rareté
  pull_cost            NUMERIC(12,2),          -- pack_price × (1/pull_rate)
  character_multiplier NUMERIC(6,4),           -- normalized_score/10 (table statique)
  collector_factor     NUMERIC(6,4) DEFAULT 1.0,
  demand_factor        NUMERIC(6,4) DEFAULT 1.0,
  -- output
  theoretical_value    NUMERIC(12,2) NOT NULL, -- valeur théorique composite
  market_price         NUMERIC(12,2) NOT NULL, -- dernier prix marché (price_snapshots ungraded)
  undervalued_score    NUMERIC(10,4) NOT NULL, -- theoretical_value / market_price
  created_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE (item_id, captured_at)
);
CREATE INDEX IF NOT EXISTS idx_undervalued_score
    ON undervalued_scores (captured_at DESC, undervalued_score DESC);
CREATE INDEX IF NOT EXISTS idx_undervalued_item
    ON undervalued_scores (item_id, captured_at DESC);

-- Ingrédients du calculateur ROI de gradation (cf. lib/gradingRoi.ts +
-- lib/queries/gradingRoi.ts, page /grading-roi) : PAS le ROI lui-même --
-- juste les données coûteuses à dériver (dernier prix par grade, comptage
-- des ventes gradées à 4 niveaux d'agrégation carte/set+rareté/set/tcg).
-- Miroir exact de l'interface RawRow (lib/queries/gradingRoi.ts) : mêmes
-- champs, mêmes CTE (graded_prices/item_grade_counts/context/levels)
-- désormais exécutées ici une fois par run --tier plutôt qu'à chaque
-- chargement de page.
--
-- Le calcul ROI proprement dit (frais PSA, risque de sous-note, %) reste
-- 100% dans lib/gradingRoi.ts (TypeScript, pur) -- jamais dupliqué ici --
-- puisqu'il doit rester recalculable en live côté client quand l'utilisateur
-- modifie les hypothèses dans le calculateur interactif. Cette table ne
-- fait gagner que la partie SQL (avant, plein scan de price_snapshots +
-- sales à chaque page vue -- ~3.3s mesurés, cf. mémoire projet
-- "slow_pages_missing_indexes" ; incident 2026-08-06).
CREATE TABLE IF NOT EXISTS grading_roi_inputs (
  id             BIGSERIAL PRIMARY KEY,
  item_id        BIGINT NOT NULL REFERENCES items(id),
  captured_at    DATE NOT NULL,
  ungraded_price NUMERIC(12,2) NOT NULL,
  psa7_price     NUMERIC(12,2),
  psa8_price     NUMERIC(12,2),
  psa9_price     NUMERIC(12,2),
  psa95_price    NUMERIC(12,2),
  psa10_price    NUMERIC(12,2),
  -- comptage de ventes gradées (sales.grade) à 4 niveaux d'agrégation --
  -- même cascade que resolveGradeDistribution (lib/gradingRoi.ts),
  -- appliquée côté TS à la lecture, jamais ici (cf. commentaire ci-dessus).
  card_n7        INTEGER NOT NULL DEFAULT 0,
  card_n8        INTEGER NOT NULL DEFAULT 0,
  card_n9        INTEGER NOT NULL DEFAULT 0,
  card_n95       INTEGER NOT NULL DEFAULT 0,
  card_n10       INTEGER NOT NULL DEFAULT 0,
  sr_n7          INTEGER NOT NULL DEFAULT 0,   -- set + rareté
  sr_n8          INTEGER NOT NULL DEFAULT 0,
  sr_n9          INTEGER NOT NULL DEFAULT 0,
  sr_n95         INTEGER NOT NULL DEFAULT 0,
  sr_n10         INTEGER NOT NULL DEFAULT 0,
  set_n7         INTEGER NOT NULL DEFAULT 0,
  set_n8         INTEGER NOT NULL DEFAULT 0,
  set_n9         INTEGER NOT NULL DEFAULT 0,
  set_n95        INTEGER NOT NULL DEFAULT 0,
  set_n10        INTEGER NOT NULL DEFAULT 0,
  tcg_n7         INTEGER NOT NULL DEFAULT 0,
  tcg_n8         INTEGER NOT NULL DEFAULT 0,
  tcg_n9         INTEGER NOT NULL DEFAULT 0,
  tcg_n95        INTEGER NOT NULL DEFAULT 0,
  tcg_n10        INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (item_id, captured_at)
);
CREATE INDEX IF NOT EXISTS idx_grading_roi_inputs_item
    ON grading_roi_inputs (item_id, captured_at DESC);

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
