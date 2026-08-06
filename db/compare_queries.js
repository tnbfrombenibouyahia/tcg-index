// Compare les résultats des vraies requêtes de production (copiées telles
// quelles depuis web/lib/queries/*.ts, mêmes options client `postgres` que
// web/lib/db.ts) entre Supabase et CockroachDB, sur des paramètres réels
// existants dans les deux bases (resync fait juste avant via
// db/resync_data_to_cockroachdb.py). Dernier filet avant la bascule --
// valide le vrai client Node contre CRDB, pas juste la compat SQL brute
// déjà testée via db/test_cockroachdb_compat.sql.
//
// v2 (2026-08-06) : premier run a trouvé 2 vrais bugs CockroachDB en plus
// des 2 déjà connus -- corrigés ici et dans web/lib/queries/*.ts :
// - ::int -> ::int4 partout (CRDB fait de INT/::int un alias 64-bit,
//   contrairement à Postgres 32-bit -- le client Node renvoie alors une
//   string au lieu d'un number).
// - divergence : `<float8> / <int>` refusé par CRDB (implicite sur
//   Postgres) -- cast des deux côtés du `/`.
// - items.searchItems : ORDER BY sans tiebreaker final -- non déterministe
//   par nature SQL quand plusieurs lignes sont à égalité sur toutes les
//   clés de tri (ex. plusieurs cartes nommées exactement "Pikachu") --
//   chaque moteur peut légitimement renvoyer un ordre différent. Pas un bug
//   CockroachDB, mais un trou préexistant révélé par la comparaison --
//   ajout de `, id ASC` comme tiebreaker déterministe.
//
// Usage : node db/compare_queries.js   (depuis la racine du repo, lit .env)

// Pas de `dotenv` ni de `postgres` dans les dependances de la racine (le
// projet n'a pas de package.json racine) -- `postgres` vit dans
// web/node_modules (require explicite), et .env est parse a la main pour
// eviter une dependance de plus juste pour ce script jetable.
const fs = require("fs");
const path = require("path");
const postgres = require(path.join(__dirname, "..", "web", "node_modules", "postgres"));

// split sur \r?\n : le fichier est en CRLF (Windows), un \r trainant en fin
// de ligne empeche sinon le `(.*)$` de matcher (`.` ne matche pas \r).
for (const line of fs.readFileSync(path.join(__dirname, "..", ".env"), "utf-8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

const clientOpts = { prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10 };
const supabase = postgres(process.env.DATABASE_URL, clientOpts);
const crdb = postgres(process.env.COCKROACHDB_URL, clientOpts);

// Item bien fourni en ventes ungraded (cf. exploration prealable) -- bon
// candidat pour itemTimeline/divergence.
const BUSY_ITEM_ID = 31929;
// Item avec un prix psa10 -- bon candidat pour gradingRoi single-item.
const GRADED_ITEM_ID = 125;

const cases = [
  {
    name: "itemDetail.getItemById (fiche carte + DISTINCT ON grade)",
    run: (sql) => sql`
      SELECT
        id::int4 AS id, name, tcg, category,
        set_code AS "setCode", code, image_url AS "imageUrl", language, rarity,
        release_date::text AS "releaseDate"
      FROM items
      WHERE id = ${GRADED_ITEM_ID}
      LIMIT 1
    `,
  },
  {
    name: "itemDetail price history (DISTINCT ON grade, prix par grade)",
    run: (sql) => sql`
      SELECT DISTINCT ON (grade)
        grade, price::float8 AS price, currency, captured_at::text AS "capturedAt",
        volume, source
      FROM price_snapshots
      WHERE item_id = ${GRADED_ITEM_ID}
      ORDER BY grade, captured_at DESC, created_at DESC
    `,
  },
  {
    name: "itemTimeline.getItemDailyTimeline (generate_series + interval fix)",
    run: (sql) => sql`
      WITH days AS (
        SELECT generate_series(
          (CURRENT_DATE - (${30 - 1} || ' days')::interval)::timestamp,
          CURRENT_DATE::timestamp,
          interval '1 day'
        )::date AS d
      ),
      daily AS (
        SELECT sale_date AS d, COUNT(*)::int4 AS cnt, AVG(price)::float8 AS avg_price
        FROM sales
        WHERE item_id = ${BUSY_ITEM_ID}
          AND grade = 'ungraded'
          AND sale_date >= CURRENT_DATE - (${30 - 1} || ' days')::interval
          AND sale_date <= CURRENT_DATE
        GROUP BY sale_date
      )
      SELECT
        days.d::text                    AS date,
        COALESCE(daily.cnt, 0)::int4     AS count,
        daily.avg_price                  AS "avgPrice"
      FROM days
      LEFT JOIN daily ON daily.d = days.d
      ORDER BY days.d
    `,
  },
  {
    name: "divergence.getDivergence (interval fix + float/int fix, fenetres glissantes)",
    run: (sql) => sql`
      WITH cur AS (
        SELECT item_id, COUNT(*)::int4 AS vol, AVG(price)::float8 AS avg_price
        FROM sales
        WHERE grade = 'ungraded'
          AND sale_date >= CURRENT_DATE - (${30} || ' days')::interval
          AND sale_date < CURRENT_DATE
        GROUP BY item_id
        HAVING COUNT(*) >= 3
      ),
      prev AS (
        SELECT item_id, COUNT(*)::int4 AS vol, AVG(price)::float8 AS avg_price
        FROM sales
        WHERE grade = 'ungraded'
          AND sale_date >= CURRENT_DATE - (${60} || ' days')::interval
          AND sale_date < CURRENT_DATE - (${30} || ' days')::interval
        GROUP BY item_id
        HAVING COUNT(*) >= 3
      ),
      joined AS (
        SELECT
          cur.item_id,
          cur.vol AS volume_current,
          prev.vol AS volume_previous,
          cur.avg_price AS price_current,
          prev.avg_price AS price_previous,
          (cur.avg_price - prev.avg_price) / prev.avg_price * 100 AS price_change_pct,
          (cur.vol - prev.vol)::float8 / prev.vol::float8 * 100 AS volume_change_pct
        FROM cur
        JOIN prev USING (item_id)
      )
      SELECT j.item_id::int4 AS "itemId", j.volume_current AS "volumeCurrent",
             j.volume_previous AS "volumePrevious", j.price_current AS "priceCurrent",
             j.price_previous AS "pricePrevious", j.price_change_pct AS "priceChangePct",
             j.volume_change_pct AS "volumeChangePct"
      FROM joined j
      WHERE j.price_current >= 0
      ORDER BY ABS(j.price_change_pct) DESC
      LIMIT 50
    `,
  },
  {
    name: "undervalued.getUndervalued (DISTINCT ON item_id + JOIN)",
    run: (sql) => sql`
      WITH latest AS (
        SELECT DISTINCT ON (item_id)
          item_id, captured_at, market_price, undervalued_score
        FROM undervalued_scores
        ORDER BY item_id, captured_at DESC
      )
      SELECT l.item_id::int4 AS "itemId", i.name, i.tcg,
             l.captured_at::text AS "capturedAt",
             l.market_price::float8 AS "marketPrice",
             l.undervalued_score::float8 AS "undervaluedScore"
      FROM latest l
      JOIN items i ON i.id = l.item_id
      WHERE l.market_price >= 1.0
      ORDER BY l.undervalued_score DESC, l.item_id ASC
      LIMIT 50
    `,
  },
  {
    name: "sealedEv.getSealedEv (DISTINCT ON *, sealed_ev)",
    run: (sql) => sql`
      WITH latest AS (
        SELECT DISTINCT ON (item_id) *
        FROM sealed_ev
        ORDER BY item_id, captured_at DESC
      )
      SELECT l.item_id::int4 AS "itemId", i.name, i.tcg,
             l.captured_at::text AS "capturedAt",
             l.box_price::float8 AS "boxPrice",
             l.ev_ratio_total::float8 AS "evRatioTotal"
      FROM latest l
      JOIN items i ON i.id = l.item_id
      ORDER BY l.ev_ratio_total DESC, l.item_id ASC
      LIMIT 50
    `,
  },
  {
    name: "gradingRoi.fetchCandidates (FILTER + window SUM OVER PARTITION)",
    run: (sql) => sql`
      WITH graded_prices AS (
        SELECT DISTINCT ON (item_id, grade) item_id, grade, price
        FROM price_snapshots
        WHERE grade IN ('ungraded', 'psa7', 'psa8', 'psa9', 'psa9.5', 'psa10')
        ORDER BY item_id, grade, captured_at DESC, created_at DESC
      ),
      prices AS (
        SELECT
          item_id,
          MAX(price) FILTER (WHERE grade = 'ungraded') AS ungraded_price,
          MAX(price) FILTER (WHERE grade = 'psa10')    AS psa10_price
        FROM graded_prices
        GROUP BY item_id
      ),
      item_grade_counts AS (
        SELECT item_id, COUNT(*) FILTER (WHERE grade = 'psa9') AS n9
        FROM sales
        WHERE grade IN ('psa7', 'psa8', 'psa9', 'psa9.5', 'psa10')
        GROUP BY item_id
      ),
      context AS (
        SELECT i.id AS item_id, i.tcg, i.set_code, i.rarity,
               COALESCE(g.n9, 0) AS n9
        FROM items i
        LEFT JOIN item_grade_counts g ON g.item_id = i.id
        WHERE i.category = 'single'
      ),
      levels AS (
        SELECT item_id, n9,
               SUM(n9) OVER (PARTITION BY tcg, set_code) AS set_n9
        FROM context
      )
      SELECT i.id::int4 AS "itemId", i.name,
             p.ungraded_price::float8 AS "ungradedPrice",
             p.psa10_price::float8 AS "psa10Price",
             l.n9::int4 AS "cardN9", l.set_n9::int4 AS "setN9"
      FROM prices p
      JOIN items i ON i.id = p.item_id
      JOIN levels l ON l.item_id = p.item_id
      WHERE p.ungraded_price IS NOT NULL
        AND i.id = ${GRADED_ITEM_ID}
    `,
  },
  {
    name: "indices.getAllIndices (ROW_NUMBER OVER + = ANY array)",
    run: (sql) => sql`
      WITH ranked AS (
        SELECT
          index_code AS "indexCode", captured_at::text AS "capturedAt",
          value::float8 AS value, constituents::int4 AS constituents,
          ROW_NUMBER() OVER (PARTITION BY index_code ORDER BY captured_at DESC) AS rn
        FROM index_values
        WHERE index_code = ANY(${["PKM_DISPLAYS", "PKM_SINGLES", "OP_DISPLAYS", "OP_SINGLES"]})
      )
      SELECT "indexCode", "capturedAt", value, constituents FROM ranked WHERE rn <= 2 ORDER BY "indexCode", "capturedAt" DESC
    `,
  },
  {
    name: "items.searchItems (ILIKE nom/numero + tiebreaker id)",
    run: (sql) => sql`
      SELECT id::int4 AS id, name, tcg, category, set_code AS "setCode", code
      FROM items
      WHERE (name ILIKE ${"%pikachu%"} OR code ILIKE ${"%pikachu%"})
      ORDER BY (name ILIKE ${"pikachu"}) DESC, name ASC, id ASC
      LIMIT 20
    `,
  },
];

// Tolérance sur les nombres : AVG()/divisions en chaîne peuvent accumuler
// en ordre différent selon le moteur (l'addition flottante n'est pas
// associative) et Postgres/CockroachDB ne sérialisent pas forcément un
// float8 en texte avec la même précision -- une différence sur le 12e+
// chiffre significatif n'est pas un bug, juste du bruit IEEE754. 1e-9 en
// relatif est très en dessous de ce qui serait visible une fois arrondi à
// l'affichage (2 décimales).
function deepEqualWithTolerance(a, b) {
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    if (a === b) return true;
    const scale = Math.max(Math.abs(a), Math.abs(b), 1);
    return Math.abs(a - b) / scale < 1e-9;
  }
  if (a === b) return true;
  if (a === null || b === null || typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqualWithTolerance(v, b[i]));
  }
  if (typeof a === "object") {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => deepEqualWithTolerance(a[k], b[k]));
  }
  return false;
}

async function main() {
  let failures = 0;
  for (const c of cases) {
    let a, b;
    try {
      a = await c.run(supabase);
    } catch (e) {
      console.log(`ERREUR (Supabase) -- ${c.name}\n   ${e.message}\n`);
      failures++;
      continue;
    }
    try {
      b = await c.run(crdb);
    } catch (e) {
      console.log(`ERREUR (CockroachDB) -- ${c.name}\n   ${e.message}\n`);
      failures++;
      continue;
    }
    const same = deepEqualWithTolerance(a, b);
    console.log(`${same ? "OK  " : "DIFF"} -- ${c.name} (${a.length} lignes Supabase, ${b.length} lignes CockroachDB)`);
    if (!same) {
      failures++;
      console.log("   Supabase:   ", JSON.stringify(a).slice(0, 500));
      console.log("   CockroachDB:", JSON.stringify(b).slice(0, 500));
    }
  }
  console.log(`\n${cases.length - failures}/${cases.length} identiques.`);
  await supabase.end();
  await crdb.end();
  process.exit(failures > 0 ? 1 : 0);
}

main();
