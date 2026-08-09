# Migration Supabase (Postgres) → CockroachDB Basic : audit de compatibilité

Contexte : voir mémoire projet `turso_migration_eval` / `supabase_storage_plan`.
Supabase Free plafonne à 500MB (415MB atteints le 2026-08-05, `sales` 62%).
CockroachDB Basic offre 10GB gratuits en restant wire-compatible Postgres —
contrairement à Turso (SQLite/libSQL), qui aurait forcé une réécriture
complète du code. Ce doc audite construct par construct ce qui doit être
vérifié avant de committer à la bascule réelle.

Audit fait en lisant `db/schema.sql`, les 11 fichiers `web/lib/queries/*.ts`,
et les patterns d'écriture d'`ingestion/sources/apitcg.py` (représentatif des
autres sources : `execute_values` + `ON CONFLICT ... DO UPDATE` + commit par
lot, jamais de grosse transaction multi-statements explicite — bon signe pour
le modèle de retry optimiste de CRDB, cf. plus bas).

## Déjà compatible tel quel (confirmé par la doc CockroachDB)

- **`DISTINCT ON (...)`** — supporté nativement. Utilisé partout
  (`itemDetail.ts`, `undervalued.ts`, `sealedEv.ts`, `gradingRoi.ts` x2) comme
  pattern "dernière ligne par groupe" sur les tables append-only.
- **`ON CONFLICT (...) DO UPDATE SET ... EXCLUDED.x`** — c'est littéralement
  le mécanisme UPSERT natif de CRDB, zéro risque. Utilisé par tout
  `ingestion/sources/*.py`.
- **Window functions** — `ROW_NUMBER() OVER (PARTITION BY ...)` (`indices.ts`),
  `SUM(n) OVER (PARTITION BY tcg, set_code, rarity)` (`gradingRoi.ts`, la
  requête la plus lourde du projet). Bien supporté.
- **`ILIKE`**, **`NULLS LAST`**, **`JOIN ... USING (col)`**, CTEs chaînées
  (plusieurs `WITH` à la suite) — tous standards, supportés.
- **Types** : `BIGSERIAL`, `TEXT`, `DATE`, `NUMERIC(p,s)`, `TIMESTAMPTZ`,
  `INTEGER` — tous supportés par CRDB avec la même syntaxe.
- **Partial index** (`sync_runs`, `WHERE status = 'running'`) — supporté.
- **Casts `::type`** (`::int`, `::float8`, `::text`, `::date`) — même syntaxe
  que Postgres.
- **`= ANY(${array})`** (`indices.ts`) — CRDB supporte le type ARRAY et
  l'opérateur `ANY`.

## Différence connue mais sans impact ici

**`BIGSERIAL` → `unique_rowid()`** au lieu d'une vraie séquence PG : les ids
générés par CRDB sont uniques mais pas strictement croissants par ordre
d'insertion (ils encodent horloge+nœud, pas un compteur). Vérifié dans le
code : `id` n'est utilisé QUE comme tiebreaker de tri, toujours après une
vraie colonne métier (`sale_date`, `price`, `language`) — jamais comme proxy
d'ordre temporel. Exemple (`sales.ts`) : `ORDER BY s.sale_date DESC, s.id DESC`.
Aucun rewrite nécessaire.

## Testé sur le vrai cluster le 2026-08-05 (`db/run_compat_test.py`)

1. **`generate_series(date, date, interval '1 day')`** — ❌ cassé tel quel.
   `CURRENT_DATE - INTERVAL '6 days'` est typé `timestamp` par CRDB (pas
   `date`), et il n'y a pas de signature `generate_series(timestamp, date,
   interval)` au catalogue → `UndefinedFunction`. **Fix confirmé** : caster
   explicitement les deux bornes en `::timestamp` avant l'appel, cast global
   en `::date` après (cf. `db/test_cockroachdb_compat.sql` section 1).
   **À corriger dans `web/lib/queries/itemTimeline.ts`.**
2. **`make_interval(days => N)`** — ❌ cassé tel quel. CRDB ne supporte pas
   la syntaxe d'argument nommé `=>` → `SyntaxError`. **Fix confirmé** :
   `(N || ' days')::interval` à la place (marche sur Postgres et CRDB).
   **À corriger dans `web/lib/queries/itemTimeline.ts` et
   `web/lib/queries/divergence.ts` (2 occurrences).**
3. **`FILTER (WHERE ...)` sur agrégats** — ✅ confirmé OK tel quel
   (`gradingRoi.ts` n'a besoin d'aucun changement sur ce point).
4. **`DISTINCT ON` + `SUM() OVER (PARTITION BY ...)` + `ON CONFLICT DO
   NOTHING`** — ✅ confirmé OK tel quel.
5. **Client `psycopg2`** — ✅ se connecte et exécute tout correctement une
   fois `sslrootcert` pointé sur un CA valide (cf. section SSL ci-dessous).
   Le client Node (`postgres` package, `web/lib/db.ts`) reste untested
   directement, mais Vercel tourne sous Linux, où `sslrootcert=system`
   fonctionne nativement (contrairement à Windows, cf. ci-dessous) — risque
   plus faible qu'anticipé.

### Notes de connexion (SSL) rencontrées en testant

- **Mise à jour 2026-08-09 (incident cron 3 jours) : le paragraphe ci-dessous
  s'est révélé faux sur un point clé.** `sslmode=verify-full` seul échoue
  partout (`root certificate file ... does not exist`) -- ça, confirmé. Mais
  `sslrootcert=system`, présenté ici comme un fix Linux fiable, a **aussi**
  échoué (`certificate verify failed`) sur un runner GitHub Actions
  (ubuntu-latest) : l'OpenSSL statique de `psycopg2-binary` ne s'appuie
  apparemment pas de façon fiable sur le magasin de certs de l'OS, ni sur
  Windows ni sur Linux -- pas un problème Windows-only comme on le pensait.
  **Le vrai fix, portable partout (Windows/Linux/CI)** : ne plus mettre
  `sslrootcert` dans `DATABASE_URL` du tout -- `shared/db.py::get_connection`
  le retire de la chaîne et impose `sslrootcert=certifi.where()` en code,
  résolu à chaque exécution dans l'environnement courant (jamais un chemin
  figé qui peut fuiter d'une machine à l'autre, cf. l'incident : un chemin
  Windows codé en dur dans le secret GitHub Actions `DATABASE_URL` a cassé
  `daily-sync`/`tiered-sync` du 7 au 9 août, échec quasi instantané à chaque
  run). **`DATABASE_URL` (local ET secret CI) ne doit contenir que
  `sslmode=verify-full`, sans `sslrootcert`.**
- ~~Sur Windows, `sslmode=verify-full` seul échoue (`root certificate file
  ... does not exist`) et `sslrootcert=system` échoue aussi (`certificate
  verify failed`) — l'OpenSSL embarqué dans `psycopg2-binary` ne se branche
  pas correctement sur le magasin de certificats Windows. Fix : pointer
  `sslrootcert` sur le bundle CA de `certifi`
  (`sslrootcert=<chemin>/site-packages/certifi/cacert.pem`). Spécifique à
  Windows + psycopg2, ne devrait pas se reproduire sur GitHub Actions
  (Linux) ni Vercel.~~ Diagnostic d'origine, corrigé par la note ci-dessus :
  le problème n'était pas Windows-only, et coder le chemin en dur (plutôt
  que `certifi.where()` en Python) est justement ce qui a permis au chemin
  local de fuiter dans un secret partagé.
- `CREATE TEMP TABLE` refusé par ce cluster (`temporary tables are only
  supported experimentally`) — sans impact réel : `db/schema.sql` n'utilise
  aucune table temporaire.

## Cloud provider + région du cluster

**AWS, pas GCP** — décidé le 2026-08-05. Pas une préférence : l'app sera
hébergée sur **Vercel**, dont les Vercel Functions tournent sous le capot sur
des instances **AWS** (`AWS_REGION` est même exposé dans l'environnement de
chaque fonction). Mettre CockroachDB sur GCP aurait forcé chaque requête DB
(live à chaque chargement de page, pas de cache) à traverser deux clouds
différents au lieu de rester dans le backbone AWS.

**Région : Frankfurt (`eu-central-1`) en priorité, Paris (`eu-west-3`) si
disponible dans le dropdown CockroachDB Basic** — dev + audience basés en
Europe de l'Ouest (France).

**⚠️ À ne pas oublier côté Vercel** : les Vercel Functions tournent par
défaut sur `iad1` (Washington DC, US), pas automatiquement près de l'Europe.
Il faut configurer explicitement la région des fonctions (`vercel.json` ou
réglage projet Vercel) sur `fra1` (Frankfurt) ou `cdg1` (Paris) — la même
ville que la région choisie côté CockroachDB, sinon chaque requête traverse
l'Atlantique deux fois pour rien (Vercel US → CockroachDB EU → Vercel US).

## Capacity : monthly limit, pas Unlimited

Décidé le 2026-08-05 — objectif $0 garanti (cf. mémoire `supabase_storage_plan`,
user a explicitement refusé Supabase Pro pour la même raison). À la création
du cluster, l'écran "Capacity" propose "Unlimited" (scale + facture
automatiquement au-delà du gratuit) vs "Set a monthly limit" (perte d'accès
au cluster une fois la limite atteinte, jamais de facturation). **Choisi :
"Set a monthly limit"**, réglé exactement sur le palier gratuit :
- Request Units : **50 000 000** (50M)
- Storage GiB : **10**

Doit afficher Dollars = **$0.00** — 100% du gratuit exploité, zéro risque de
dépassement facturé (le cluster se coupe à la frontière au lieu de continuer).
Une carte bancaire reste exigée par CockroachDB pour rester éligible au
palier gratuit passé l'essai de 30 jours (cf. plus haut), mais avec cette
limite le montant facturable réel restera toujours $0.

⚠️ Ce palier de $15/mois (50M RU + 10GiB) est **partagé entre tous les
clusters Basic de l'organisation** — si un 2e cluster (staging/test) est créé
plus tard, il pioche dans le même pot, pas un palier séparé.

## Comment tester (dès que le cluster Basic existe)

`db/test_cockroachdb_compat.sql` isole les 4 inconnues ci-dessus sur des
tables temporaires auto-suffisantes — aucune dépendance au schéma réel,
lançable en < 1 minute juste après la création du cluster, avant tout dump
de données réelles :

```
cockroach sql --url "$COCKROACHDB_URL" -f db/test_cockroachdb_compat.sql
```

(ou coller le contenu dans la console SQL web de CockroachDB Cloud).

Test de connectivité du client Node (`postgres` package) :

```
node -e "
const postgres = require('postgres');
const sql = postgres(process.env.COCKROACHDB_URL, { ssl: 'require' });
sql\`SELECT 1 AS ok\`.then(r => { console.log(r); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
"
```

Test de connectivité `psycopg2` :

```
python -c "
import psycopg2, os
conn = psycopg2.connect(os.environ['COCKROACHDB_URL'])
cur = conn.cursor()
cur.execute('SELECT 1')
print(cur.fetchone())
"
```

## Étapes suivantes (audit terminé et validé le 2026-08-05)

1. ✅ **Fait 2026-08-05** — `web/lib/queries/itemTimeline.ts` et
   `web/lib/queries/divergence.ts` corrigés (cf. fixes ci-dessus). Vérifié
   sans régression contre Supabase (toujours prod) : mêmes résultats exacts
   qu'avant réécriture (`generate_series` → 7 lignes 07-30→08-05,
   intervalle 30j → 2026-07-06).
2. ✅ **Fait 2026-08-05** — `db/schema.sql` appliqué tel quel sur le
   cluster CRDB via `python -m db.apply_schema_cockroachdb` (pas de fork
   nécessaire, aucune divergence de DDL requise). Vérifié : les 8 tables
   attendues sont présentes (`items`, `price_snapshots`, `sales`,
   `index_volume`, `sealed_ev`, `sync_runs`, `undervalued_scores`,
   `index_values`).
3. ✅ **Fait 2026-08-05** — pas de `pg_dump`/`psql` dispo sur la machine
   (vérifié), migration faite via `python -m db.migrate_data_to_cockroachdb`
   (psycopg2, lecture seule côté Supabase, batch `execute_values` par 2000
   lignes, `id` réinséré explicitement pour préserver les FK, `ORDER BY id`
   + curseur nommé côté source). ~1633s au total, dominé par `sales`
   (1144s/1.05M lignes). **`COUNT(*)` vérifié identique sur les 8 tables**
   entre Supabase et CockroachDB (1 632 784 lignes de chaque côté, table par
   table). Scripts : `db/migrate_data_to_cockroachdb.py`.
4. ✅ **Fait 2026-08-06** — 9 requêtes réelles rejouées (`db/compare_queries.js`,
   vrai client Node `postgres`, pas psycopg2) contre Supabase et CockroachDB
   avec les mêmes paramètres, sur des données resynchronisées à l'identique
   (`db/resync_data_to_cockroachdb.py`, cf. section dédiée plus bas -- le
   cron tourne chaque nuit sur Supabase, CockroachDB doit être rattrapé
   avant toute comparaison). **9/9 identiques** (tolérance 1e-9 sur les
   `float8`, cf. section "Bugs trouvés" -- bruit IEEE754 normal entre deux
   moteurs, pas un bug). A trouvé et corrigé 3 bugs réels + 1 défaut
   préexistant non lié à CockroachDB, cf. section suivante.
5. ✅ **Fait 2026-08-06** — utilisateur `tcg-web` créé
   (`db/create_web_user_cockroachdb.py`), `GRANT SELECT` sur les 8 tables,
   séparé de `tcg-ingestion` (lecture/écriture, cron uniquement). Vérifié
   dans les deux sens : `SELECT` fonctionne, `INSERT` bloqué
   (`InsufficientPrivilege`). Connection string dans `.env` sous
   `COCKROACHDB_WEB_URL` (mot de passe généré aléatoirement, jamais passé
   par le chat). **C'est cette variable qu'il faudra utiliser côté Vercel**
   à la bascule, pas `COCKROACHDB_URL` (celle de `tcg-ingestion`).
6. ✅ **Fait** — région Vercel confirmée sur `fra1` (Frankfurt) via le header
   `X-Vercel-Id` après déploiement (`web/vercel.json`, `{"regions": ["fra1"]}`).
7. ✅ **Bascule faite le 2026-08-06** :
   - Secret GitHub Actions `DATABASE_URL` → `tcg-ingestion` (CockroachDB,
     lecture/écriture) — le cron écrira sur CockroachDB à partir du
     prochain run.
   - Variable Vercel `DATABASE_URL` (Production + Preview) →
     `tcg-web` (CockroachDB, lecture seule) — fait via le dashboard
     (mutation bloquée par le classificateur de permissions en CLI, geste
     volontaire de sécurité, contournée en le faisant à la main).
   - Nouveau déploiement production déclenché (`vercel --prod`) pour que
     le changement de variable prenne effet. Vérifié après coup : région
     `fra1` toujours correcte, page d'accueil affiche des données réelles
     (`PKM_SINGLES`/`OP_SINGLES`), logs Vercel propres (200, aucune erreur).
   - Supabase non supprimé, gardé en filet de sécurité -- mais n'est plus
     lu ni écrit par rien tant que rien n'y repointe.

## Migration terminée -- Supabase → CockroachDB

CockroachDB est maintenant la base de production, des deux côtés (lecture
web + écriture cron). Points d'attention pour la suite :
- Le resync `db/resync_data_to_cockroachdb.py` n'a plus besoin d'être
  relancé -- le cron écrit directement sur CockroachDB désormais, plus de
  dérive à rattraper.
- Garder Supabase actif encore un moment (pas de suppression) au cas où un
  problème imprévu forcerait un retour arrière rapide (il suffirait de
  reremettre `DATABASE_URL` sur la valeur Supabase des deux côtés).
- Repenser la stratégie de rétention de `sales` (cf. mémoire projet
  `supabase_storage_plan`) maintenant qu'on a 10GB de marge au lieu de
  500MB -- moins urgent, mais toujours la bonne pratique à garder pour ne
  pas revivre le même mur plus tard.

## Bugs trouvés en comparant les vraies requêtes (2026-08-06)

Le test de compat initial (`db/test_cockroachdb_compat.sql`, psycopg2)
n'avait attrapé que 2 des 4 problèmes réels -- les 2 suivants ne se voient
qu'en rejouant les vraies requêtes avec le vrai client Node, sur des
données réelles avec des cas d'égalité :

1. **`INT`/`::int` = 64-bit sur CockroachDB, 32-bit sur Postgres.**
   Conséquence directe : le client `postgres` (npm) renvoie une **string**
   au lieu d'un **number** pour tout champ casté `::int` (`id`, `itemId`,
   `count`, `constituents`, tous les `n7`..`n10`...) -- vérifié avec
   `125::int` (string "125") vs `125::int4` (number 125). **Fix : tous les
   `::int` de sortie remplacés par `::int4`** dans les 10 fichiers
   `web/lib/queries/*.ts` concernés (`indices.ts` gardé en `::int` sur ses 2
   usages -- ce sont des casts de paramètre JS pour de l'arithmétique de
   date, jamais renvoyés au front, sans impact).

   **Plus grave, lié** : le générateur d'id par défaut de CockroachDB
   (`unique_rowid()`, utilisé par `BIGSERIAL`) produit des valeurs du genre
   `1199069219243786241` (19 chiffres) -- au-delà de `Number.MAX_SAFE_INTEGER`
   ET du plafond INT4 (~2.1 milliards). Sans intervention, la **première
   ligne créée après la bascule** (prochain run du cron) aurait fait
   échouer tout cast `::int4` dessus. **Fix : les 8 tables basculées sur de
   vraies séquences SQL croissantes** (`db/fix_id_sequences_cockroachdb.py`,
   chaque séquence démarrée à `MAX(id) actuel + 10000`) -- vérifié qu'un
   nouvel insert obtient bien un petit id séquentiel (10099), pas un
   `unique_rowid()`.

2. **`<float8> / <int>` refusé par CockroachDB**, implicite sur Postgres.
   `divergence.ts` : `(cur.vol - prev.vol)::float8 / prev.vol * 100` --
   `prev.vol` est un `COUNT(*)::int4`, division float/int rejetée par CRDB
   (`unsupported binary operator`). **Fix : cast explicite des deux côtés**,
   `prev.vol::float8`.

3. **`items.searchItems` (ILIKE) : `ORDER BY` sans tiebreaker final** --
   défaut préexistant, **pas un bug CockroachDB** : plusieurs cartes au nom
   strictement identique (ex. plusieurs "Pikachu") sont à égalité sur
   toutes les clés de tri ; sans tiebreaker, l'ordre pour les lignes à
   égalité n'est garanti par aucun moteur SQL, et Supabase/CockroachDB ont
   choisi des ordres différents (repéré par la comparaison, aurait pu
   arriver un jour même sans changer de DB). Même souci trouvé dans
   `undervalued.ts` (`undervalued_score` se répète souvent à l'identique
   entre cartes de même rareté/set) : les DEUX moteurs renvoyaient des
   **cartes différentes** dans le top 50, pas juste un ordre différent.
   **Fix : ajout d'un tiebreaker `id ASC` / `item_id ASC` final** dans
   `items.ts`, `undervalued.ts` et `sealedEv.ts` (ce dernier par prudence,
   pas de diff observé mais même risque structurel).

Scripts utilisés : `db/resync_data_to_cockroachdb.py` (rattrape le retard
Supabase → CockroachDB en incrémental, `items`/`sync_runs` en upsert complet
car modifiables en place, le reste en append-only `id > MAX(id)`),
`db/compare_queries.js` (9 requêtes réelles, comparaison avec tolérance
1e-9 sur les floats).

**Piège annexe** : un commentaire SQL ajouté dans `items.ts` utilisait des
backticks Markdown (`` `id ASC` ``) *à l'intérieur* d'un template literal
`sql\`...\`` -- ça ferme le template JS prématurément (backtick = caractère
spécial en JS, pas juste en Markdown), cassait la compilation TypeScript.
Repéré par `npx tsc --noEmit` (exit 0 après fix) -- réflexe à garder après
toute édition de commentaire *à l'intérieur* d'un bloc `sql\`...\``
(les commentaires classiques `//` hors template n'ont pas ce problème).
