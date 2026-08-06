-- Test isole des 4 inconnues de db/COCKROACHDB_MIGRATION.md sur un cluster
-- CockroachDB Basic vide, sans dependre du schema reel du projet -- objectif :
-- une reponse PASS/FAIL en moins d'une minute, avant de lancer la vraie
-- migration (dump/restore).
--
-- Usage : python -m db.run_compat_test
--
-- v2 (2026-08-05) : premiere execution reelle a trouve 2 incompatibilites
-- (cf. commentaires ci-dessous) + CREATE TEMP TABLE refuse par defaut sur
-- ce cluster ("temporary tables are only supported experimentally") --
-- remplace par des tables normales nommees _compat_test_* + DROP explicite,
-- plus simple que d'activer un flag experimental pour un test jetable.

-- ── 1. generate_series sur un range de DATE + cast ::date ──────────────────
-- Usage reel : web/lib/queries/itemTimeline.ts (calendrier complet du
-- graphique volume, jours sans vente inclus a 0).
--
-- ECHEC en v1 : generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day')
--   -> UndefinedFunction: unknown signature: generate_series(timestamp, date, interval)
--   CRDB type `CURRENT_DATE - INTERVAL '6 days'` en timestamp, pas date --
--   pas de generate_series(timestamp, date, interval) au catalogue. Fix :
--   caster explicitement les deux bornes en timestamp.
SELECT generate_series(
  (CURRENT_DATE - INTERVAL '6 days')::timestamp,
  CURRENT_DATE::timestamp,
  INTERVAL '1 day'
)::date AS d;
-- Attendu : 7 lignes, une par jour, de J-6 a J.

-- ── 2. Intervalle glissant "N jours" ────────────────────────────────────────
-- Usage reel : itemTimeline.ts + divergence.ts (fenetres 7/15/30/90/180j).
--
-- ECHEC en v1 : make_interval(days => 30) -> SyntaxError at or near ">"
--   CRDB ne supporte pas les arguments nommes (=>) sur make_interval. Fix
--   retenu : construction de chaine + cast, qui marche partout (Postgres et
--   CRDB) plutot que de chercher la syntaxe positionnelle de make_interval.
SELECT CURRENT_DATE - (30 || ' days')::interval AS d;
-- Attendu : une seule ligne, CURRENT_DATE - 30 jours.

-- ── 3. FILTER (WHERE ...) sur agregats ──────────────────────────────────────
-- Usage reel : gradingRoi.ts (MAX/COUNT ... FILTER), la requete la plus
-- lourde du projet (CTE a 5 etages + window functions).
DROP TABLE IF EXISTS _compat_test_filter;
CREATE TABLE _compat_test_filter (grade TEXT, price NUMERIC(12,2));
INSERT INTO _compat_test_filter VALUES ('ungraded', 10.00), ('psa9', 40.00), ('psa9', 45.00), ('psa10', 90.00);
SELECT
  MAX(price) FILTER (WHERE grade = 'ungraded') AS ungraded_price,
  COUNT(*) FILTER (WHERE grade = 'psa9') AS n9
FROM _compat_test_filter;
-- Attendu : ungraded_price = 10.00, n9 = 2.
DROP TABLE _compat_test_filter;

-- ── 4. Double-check : DISTINCT ON + window function + UPSERT ───────────────
-- Deja documentes comme supportes par la doc CRDB, mais autant verifier
-- pendant qu'on est connecte.
DROP TABLE IF EXISTS _compat_test_distinct;
CREATE TABLE _compat_test_distinct (item_id INT, grade TEXT, captured_at DATE, price NUMERIC(12,2));
INSERT INTO _compat_test_distinct VALUES
  (1, 'ungraded', '2026-08-01', 10),
  (1, 'ungraded', '2026-08-03', 12),
  (1, 'psa9',     '2026-08-02', 40);

SELECT DISTINCT ON (grade) grade, price, captured_at
FROM _compat_test_distinct ORDER BY grade, captured_at DESC;
-- Attendu : 2 lignes (ungraded @ 08-03/12, psa9 @ 08-02/40).

SELECT item_id, price, SUM(price) OVER (PARTITION BY item_id) AS total
FROM _compat_test_distinct;
-- Attendu : 3 lignes, total = 62 sur chacune.

INSERT INTO _compat_test_distinct (item_id, grade, captured_at, price) VALUES (1, 'ungraded', '2026-08-03', 99)
ON CONFLICT DO NOTHING;
-- Attendu : ne plante pas (pas de UNIQUE sur cette table de test, on verifie
-- juste que la syntaxe ON CONFLICT DO NOTHING passe).

DROP TABLE _compat_test_distinct;
