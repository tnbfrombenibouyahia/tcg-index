CardQuant Project
Extension navigateur + site d'analyse quantitative pour cartes à collectionner (Pokémon, One Piece — EN/JP). Document de référence : produit, principes, architecture, sources, schéma et formules — avant le premier commit.

Stack : Cloud SQL (Postgres) · Cloud Run Jobs + Cloud Scheduler · Firebase (Auth, Firestore, Storage, App Hosting) · calculs rejoués à chaque run, jamais incrémental.

01 — Le produit
L'extension est le produit principal, consulté en direct sur une annonce ; le site est la couche d'analyse avancée derrière un compte.

Extension navigateur — verdict en direct sur une annonce. Panneau latéral coulissant (type MetaMask, pas un popup classique) : identifie la carte (image ou titre), affiche dernières transactions, liquidité, ventes en cours, prix moyen EN/JP, score d'opportunité, ROI gradation, calculateur d'arbitrage, lien de double-vérification PriceCharting. Compte requis avant toute utilisation.

Site — couche premium, analyse quantitative type Bloomberg. Connexion pour débloquer l'extension (si techniquement possible), cartes/sets à suivre, sous-cote/surcote structurelle, analyse plus poussée que l'extension seule.

Fonctionnalité	Où	Donnée requise
Identification carte (image/titre)	Extension	nouveau pipeline, 2 passages — voir cascade ci-dessous
Verdict ponctuel (bonne affaire ?)	Extension	prices, servi par le backend pricing_api
Liquidité (carte/set)	Extension + site	sales + active_listings — requête directe, aucun stockage dédié
ROI gradation	Extension	price_snapshots par grade — calcul côté client
Calculateur d'arbitrage	Extension	prix de référence + saisie utilisateur (achat/livraison/douane) — calcul client, rien à stocker
Sous-cote/surcote structurelle	Site	opportunity_scores (§06)
Connexion extension ↔ site	Les deux	Firebase Authentication, Google Sign-In uniquement — accès 100% gratuit pour l'instant
Historique de recherche	Les deux	search_history (§06)
Cascade de reconnaissance d'image — deux passages, pas trois
OCR (Google Cloud Vision TEXT_DETECTION — nativement GCP, palier gratuit réel) extrait le texte imprimé (nom, numéro de carte — souvent quasi unique à lui seul), envoyé dans le pipeline de matching (regex sur code officiel + repli fuzzy nom/set/rareté).
Si l'OCR échoue (glare, angle, coque de gradation) : recherche par similarité visuelle — embedding léger type CLIP auto-hébergé sur Cloud Run, comparé aux images de référence du catalogue via pgvector (extension à activer sur Cloud SQL, pas un nouveau service).
Pas de 3ᵉ passage vision Claude : un modèle multimodal payant par appel casserait la sobriété de tout le reste de l'archi pour un gain marginal. Si les deux passages échouent, l'extension répond "non identifiée" plutôt que d'escalader vers un coût. Ne jamais deviner : un score sous le seuil de confiance renvoie les candidats plutôt qu'un choix arbitraire.
02 — Principes de conception
Dix règles posées dès le premier commit — chacune répond à un risque concret et mesurable.

Cache dès le jour 1, invalidé en fin d'ingestion. Sans cache, le volume de lecture scale avec le trafic, pas avec la fréquence réelle de changement de la donnée. Route qui lit la DB → cache réchauffé une fois par nuit, jamais retouché entre deux runs.
Plafond de dépense avec marge, alertes actives dès la création. Un plafond réglé pile sur le seuil gratuit, sans alerte, bloque le service sans préavis. Marge au-dessus du seuil + alertes 50/75/100% actives avant le premier run.
Un seul concurrency: group sur tous les crons qui écrivent. Le calage horaire seul ne protège jamais d'un scheduler externe qu'on ne contrôle pas. Posé avant le premier run planifié.
Gradation/ventes toujours hors du batch nocturne. Servie à la demande — carte consultée = carte scrapée, jamais en proactif sur un catalogue que personne ne regarde en entier.
Référentiel au rythme du quota, jamais quotidien. Un quota mensuel serré s'épuise vite pour un bénéfice quasi nul. Cadence mensuelle dès le départ.
Secrets résolus en code, jamais un chemin figé. Résolu dynamiquement à chaque exécution, jamais une valeur figée qui peut fuiter d'une machine à l'autre.
Une colonne = un usage identifié avant l'ajout. L'usage se justifie avant la migration, pas après avoir mesuré le gâchis.
Rotation par item, jamais par catégorie entière. Tranches tournantes sur un pool d'items commun, choisies par une fonction stable du temps — jamais un lot entier sauté, jamais d'état à stocker.
Sources interchangeables derrière la même interface. Si une source devient indisponible, une autre prend le relais sans migration de schéma.
Vinted mis de côté explicitement, pas oublié. Le schéma (active_listings.marketplace) accepte déjà la valeur — juste une sonde à faire le jour où le sujet revient.
03 — Architecture & flux
La fraîcheur perçue (ce que voit l'utilisateur) et la fraîcheur de la source (quand la donnée a été capturée) sont deux choses séparées. La seconde est plafonnée par la cadence d'ingestion — scraper plus souvent qu'une fois par nuit ne rapporte rien de neuf sur un marché qui ne bouge pas à la minute. La première ne coûte rien à améliorer : un cache réchauffé juste après l'ingestion sert une donnée aussi fraîche que celle de cette nuit, à volume de lecture illimité, sans jamais retoucher la base. Les confondre est le piège le plus commun d'une architecture sans cache.

Levier 1 — fraîcheur de la source, plafonnée par l'ingestion. Un run par nuit, tout le catalogue, EN + JP.
Levier 2 — fraîcheur perçue, gratuite au-delà de l'ingestion. Un cache réchauffé après chaque run sert un nombre illimité de visiteurs sans coût marginal.
Le flux
Sources (PriceCharting EN+JP, eBay listings, Vinted à venir)
    │  écrit 1x/nuit, upsert
    ▼
Postgres (brut append-only + dérivé recalculé)
    │  recalcule
    ▼
Cache (Firestore, réchauffé fin d'ingestion, TTL ~24h)
    │  lit
    ▼
Front (Next.js)
Le front ne lit jamais Postgres directement — même le dérivé passe par le cache. Chemin séparé, optionnel : gradation/ventes à la demande, déclenché quand une carte est consultée dans l'extension, indépendant du batch nocturne (même source parfois, jamais la même table que le batch).

04 — Sources & calendrier
Sources
Site	Rôle	Méthode	Contrainte
apitcg.com	Référentiel — items, sets, rareté partielle, images	API REST	quota 1000 req/mois — impose la cadence mensuelle
pricecharting.com	Prix EN+JP (batch), gradation PSA + population (à la demande)	scraping HTML	pas d'API — 1 req/set en batch, 1 req/carte à la demande
eBay Browse API	Listings actifs — supply/pression vendeuse	API REST · OAuth2	5000 req/jour — rotation par tranche
LimitlessTCG · Bulbapedia · TCGdex	Backfill de la rareté	scraping · API MediaWiki	cadence alignée sur le référentiel mensuel
Google Cloud Vision	OCR — identification carte par image	API REST	palier gratuit 1000 unités/mois — à la demande
Vinted	Même rôle que eBay (profondeur de marché)	—	mis de côté pour l'instant, décision explicite
Jobs et horaires (état réel vérifié le 2026-08-26 via `gcloud scheduler jobs list` / `gcloud run jobs describe` — cf. note de migration en fin de section, la table ci-dessous remplace une version antérieure qui décrivait encore 3 jobs génériques ; calendrier de `population-monthly` mis à jour le 2026-08-27, cf. note en fin de section)
Cloud Scheduler (cron, UTC)	Cloud Run Job	Portée	Charge dominante
daily-sync · 01:17	ingestion-daily	Prix ungraded, tout le catalogue EN+JP	1 requête/set — ~226 sets
tiered-hot/recent/established/vintage/jp-singles · 5 horaires 03:05–04:13	ingestion-tiered (job unique, args `--tier <palier>` overridés par requête Scheduler)	Gradation PSA + ventes, par palier d'âge (rotation)	1 requête/carte, sous quota par tranche
ebay-listings · jeudi 04:05	ingestion-ebay-listings	Listings actifs scellé, pool commun EN+JP	2 requêtes/item — tranches sous quota
items-monthly · le 3, 02:00	ingestion-items	Référentiel complet (apitcg)	contraint par le quota apitcg (1000 req/mois)
rarity-backfill-weekly · vendredi 03:19	ingestion-rarity-backfill	Backfill rareté (LimitlessTCG/Bulbapedia)	cadence hebdomadaire
population-monthly (id inchangé, cadence hebdo depuis le 27/08) · mercredi 02:27	ingestion-population	Population PSA+CGC (miroir PriceCharting), tout le catalogue mappé	1 requête/set — ~234 sets EN + ~429 sets JP, ~50 min
Fuseau : UTC directement sur Cloud Scheduler (corrigé ici — cette section indiquait auparavant Europe/Paris, jamais le cas en pratique).

Pourquoi daily-sync avant les tiered : le job Prix a un budget de plusieurs dizaines de minutes — décaler les tiered/eBay après laisse la marge avant de toucher les mêmes tables d'agrégats. Le vrai filet reste `ingestion_writer_lock` (pg_advisory_lock, §02), pas le calage horaire seul : un soir où un job déborde, le suivant attend en file plutôt que d'écrire en parallèle.

Migration Cloud Scheduler + Cloud Run Jobs (2026-08-16) et nettoyage (2026-08-26) : les 6 jobs ci-dessus ont remplacé les 6 workflows `.github/workflows/*.yml` (daily-sync, tiered-sync, ebay-listings-sync, monthly-items-sync, monthly-population-sync, rarity-backfill-sync) le 16 août. Ces fichiers sont restés dans le repo, toujours déclenchés par GitHub, jusqu'au 26 août -- constaté ce jour-là : ils échouaient silencieusement depuis la migration, leur secret `DATABASE_URL` GitHub pointant encore vers l'ancien cluster CockroachDB (`tcg-index-prod-31243...cockroachlabs.cloud`), lui-même désactivé pour dépassement de quota Request Units. Supprimés le 26 août -- Cloud Scheduler est désormais l'unique déclencheur.

Population PSA+CGC opérationnelle depuis le 27 août (`population_snapshots` : 39 558 lignes, 663/663 sets EN+JP couverts). La première exécution manuelle le 26 août avait échoué au bout de 30 min -- pas un souci d'outillage local comme supposé dans une note précédente, mais le `timeoutSeconds` du job Cloud Run (1800s, valeur par défaut jamais ajustée à la création le 16 août) trop court face au volume réel : 663 sets à ~2s/requête minimum (throttle anti-détection, cf. `MIN_SECONDS_BETWEEN_REQUESTS` dans `pricecharting.py`) demandent ~50-65 min. Corrigé le 27 août (`gcloud run jobs update ingestion-population --region=europe-west3 --task-timeout=7200s`, aligné sur `ingestion-daily`), puis rejoué avec succès en 47min30s.

Cadence passée de mensuelle à hebdomadaire le même jour (`gcloud scheduler jobs update http population-monthly --schedule="27 2 * * 3"`, id Scheduler inchangé par simplicité) : le recensement source lui-même n'est mis à jour que mensuellement par PriceCharting (`orchestrator.py:385`, "population census updated monthly"), donc l'hebdo n'apporte rien de neuf la plupart des semaines -- le seul vrai gain est d'absorber un nouveau mapping de set en au plus 7 jours plutôt que 30, pour un surcoût de charge de scraping jugé acceptable (cadence hebdo déjà précédent avec `rarity-backfill-weekly`). Un daily aurait quadruplé la charge nocturne sur un site sans API pour zéro donnée neuve 29 jours sur 30 -- explicitement écarté.

Pourquoi une rotation par item, pas une alternance par jeu : Pokémon scellé seul (4 737 items, tous âges) demande 9 474 requêtes — plus que le quota quotidien (5000), même sur une journée entièrement dédiée. One Piece (EN+JP, 627 items+) tient seul en ~1 254+ requêtes et gâcherait le reste d'une journée réservée. La bonne maille est l'item, pas le TCG : pool commun Pokémon + One Piece découpé en tranches tournantes, choisies par date.today().toordinal() // 7 % N — sans état stocké. ~5 tranches de ~1150 items (2300 requêtes/nuit, large marge sous 5000) : chaque nuit touche un peu des deux TCG, cycle complet tous les 5 jours, marge prête pour Vinted plus tard sans retoucher le découpage.

Couverture d'images pour la reconnaissance visuelle (§01) : déjà mesurée sur ce catalogue — 32 502/32 529 items Pokémon (99,9%) et 7 200/7 200 One Piece (100%) ont une image_url exploitable via apitcg/TCGPlayer. Le passage 2 de la cascade a de quoi fonctionner dès le premier jour.

05 — GCP
Tout sur GCP, base de données comprise. Ce qui garde la sobriété intacte n'a jamais été le choix du cloud : c'est le cache qui empêche le front de taper la DB à chaque page vue (§03), et ça reste vrai quel que soit l'hébergeur de Postgres.

Service	Rôle	Palier gratuit	Coût réel estimé
Cloud SQL (PostgreSQL)	Base de données — db-f1-micro	aucun palier gratuit	~12-14€/mois (compute + 10 Go, europe-west3)
Cloud Run Jobs	Batch nightly (prix + eBay) + job mensuel	240 000 vCPU-s + 450 000 GiB-s/mois	0€
Cloud Run (service)	Gradation/ventes à la demande — pricing_api	2M requêtes + 180 000 vCPU-s/mois	0€ à cette échelle
Cloud Scheduler	Déclenche les 6 Cloud Run Jobs (10 déclencheurs cron, cf. §04 -- tiered en a 5 vers le même job)	3 jobs gratuits/mois/compte, ~0,10$/job/mois au-delà	~0,70$/mois (10 déclencheurs, 3 gratuits) -- corrigé le 2026-08-26, cette ligne annonçait encore "exactement 3 jobs"
Secret Manager	DATABASE_URL, clés apitcg/eBay	6 versions actives gratuites	0€
Artifact Registry + Cloud Build	Images de conteneur	paliers gratuits	0€
Cloud Logging	Observabilité des jobs	50 Go/mois gratuits	0€
Budget + Pub/Sub + Cloud Function	Coupe-circuit budget	alertes gratuites, 10 Go/mois	0€
Firestore (Spark)	Cache de lecture	50k lectures + 20k écritures/jour	0€
Firebase Authentication	Compte utilisateur — Google Sign-In	50 000 utilisateurs actifs/mois	0€
Cloud Storage	Avatars uploadés	5 Gio gratuits	0€
Firebase App Hosting	Le site — Next.js SSR sur Cloud Run	10 Gio bande passante/mois	0€
Total : ≈ 12-14€/mois. Cloud SQL est la seule ligne facturée dès le premier euro — les onze autres services restent dans leur palier gratuit à cette échelle. Le coupe-circuit budget devient d'autant plus nécessaire que GCP n'offre aucun plafond dur par défaut.

Pourquoi Firestore plutôt que Memorystore : Memorystore n'a aucun palier gratuit et facture la capacité provisionnée à la seconde, utilisée ou non — même 1 Gio en tier Basic tourne autour de 35€/mois, à lui seul plus que tout le budget. Firestore a un palier gratuit réel, taillé pour un trafic qui lit beaucoup et écrit peu.

Le plafond de connexions Cloud SQL (25 sur db-f1-micro) n'est pas un risque ici : ça l'aurait été si le front tapait Postgres à chaque page vue. Mais l'architecture (§03) fait l'inverse — le front ne lit que Firestore. Seuls le job d'ingestion et le réchauffage du cache ouvrent une connexion à la base.

Hébergement du site — Firebase App Hosting, pas Firebase Hosting tout court : ce dernier est pensé pour du statique/SPA, le SSR n'y passe que par des règles de proxy bricolées. App Hosting est conçu pour du Next.js avec App Router, tourne sur Cloud Run, intégration native à Auth/Storage/Firestore. Seule réserve : sa région la plus proche est europe-west4 (Pays-Bas), pas europe-west3 (Francfort) où vit Cloud SQL — décalage de latence mineur, absorbé sans drame puisque le front lit Firestore et non Postgres sur l'immense majorité des requêtes.

Ce qui ferait bouger ce chiffre : une croissance du catalogue au-delà de ~66 vCPU-h/mois de batch, un trafic de cache qui dépasse le palier gratuit Firestore, ou db-f1-micro qui devient trop juste. Premier signe à surveiller : le compteur de connexions actives sur Cloud SQL, qui doit rester proche de zéro hors des fenêtres de batch.

06 — Le schéma
Trois strates, dix tables : référentiel (peu volatile), mesures brutes (append-only, jamais d'UPDATE), calculs dérivés (rejoués, jamais mis à jour en place) — plus une strate de compte.

-- ============================================================
-- CardQuant -- schéma cible (3 strates : référentiel / brut / dérivé)
-- Postgres (Cloud SQL) -- refresh uniforme, sans palier par ancienneté
-- ============================================================

-- Référentiel : ce qu'on suit. Peuplé 1x/mois (1er du mois), jamais
-- par le run nocturne -- un nouveau produit n'apparaît pas plus vite
-- que le cycle mensuel, et le prix des produits déjà connus n'en
-- dépend pas.
CREATE TABLE items (
  id            BIGSERIAL PRIMARY KEY,
  external_id   TEXT NOT NULL,
  source        TEXT NOT NULL,
  tcg           TEXT NOT NULL,
  category      TEXT NOT NULL,
  set_code      TEXT,
  release_date  DATE,
  code          TEXT,
  image_url     TEXT,
  language      TEXT NOT NULL,
  name          TEXT NOT NULL,
  rarity        TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source, external_id)
);
CREATE INDEX idx_items_tcg_category ON items (tcg, category);

-- Prix bruts : append-only, jamais d'UPDATE. Rempli chaque nuit,
-- tout le catalogue, EN + JP -- un seul job, pas de palier hot/
-- recent/vintage. `grade` reste 'ungraded' pour ce chemin nocturne ;
-- une valeur graded (psa7..psa10) n'apparaît que via le chemin à la
-- demande (même table, écrivain différent).
CREATE TABLE price_snapshots (
  id            BIGSERIAL PRIMARY KEY,
  item_id       BIGINT NOT NULL REFERENCES items(id),
  captured_at   DATE NOT NULL,
  price         NUMERIC(12,2) NOT NULL,
  currency      TEXT NOT NULL,
  source        TEXT NOT NULL,
  grade         TEXT NOT NULL DEFAULT 'ungraded',
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (item_id, captured_at, source, grade)
);
CREATE INDEX idx_price_snapshots_item ON price_snapshots (item_id, captured_at DESC);

-- Supply active : comptage de listings, pas un prix. Rempli chaque
-- nuit par tranche tournante (pool commun EN+JP, cf. §04) --
-- `marketplace` accepte déjà 'vinted' pour que son ajout futur ne
-- touche ni schéma ni requêtes.
CREATE TABLE active_listings (
  id             BIGSERIAL PRIMARY KEY,
  item_id        BIGINT NOT NULL REFERENCES items(id),
  captured_at    DATE NOT NULL,
  marketplace    TEXT NOT NULL,        -- 'ebay' | 'vinted' (à venir)
  buying_option  TEXT NOT NULL DEFAULT 'all',
  grade          TEXT NOT NULL DEFAULT 'ungraded',
  listing_count  INTEGER NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (item_id, captured_at, marketplace, buying_option, grade)
);
CREATE INDEX idx_active_listings_item ON active_listings (item_id, captured_at DESC);

-- Ventes individuelles : append-only, MAIS pas remplie par un batch
-- nocturne -- écrite uniquement quand une carte est effectivement
-- consultée (chemin à la demande, cf. §03). L'historique reste un
-- actif qui s'accumule, juste au rythme du trafic réel plutôt que du
-- catalogue entier.
CREATE TABLE sales (
  id                BIGSERIAL PRIMARY KEY,
  item_id           BIGINT NOT NULL REFERENCES items(id),
  sale_date         DATE NOT NULL,
  price             NUMERIC(12,2) NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'USD',
  grade             TEXT NOT NULL DEFAULT 'ungraded',
  marketplace       TEXT NOT NULL,
  external_sale_id  TEXT NOT NULL,
  title             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (marketplace, external_sale_id)
);
CREATE INDEX idx_sales_item_date ON sales (item_id, sale_date DESC);

-- Cache mutable à TTL pour le verdict à la demande (équivalent
-- pricing_api) -- seule table du schéma qui subit un vrai UPDATE.
-- Jamais un historique : une ligne = le dernier prix connu par
-- item/source/grade, réchauffée quand `fetched_at` expire.
CREATE TABLE prices (
  id          BIGSERIAL PRIMARY KEY,
  item_id     BIGINT NOT NULL REFERENCES items(id),
  source      TEXT NOT NULL,
  grade       TEXT NOT NULL DEFAULT 'ungraded',
  price       NUMERIC(12,2) NOT NULL,
  currency    TEXT NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (item_id, source, grade)
);
CREATE INDEX idx_prices_item ON prices (item_id);

-- Indice calculé : l'unique table dérivée que le front lit -- et
-- seulement via le cache Firestore, jamais Postgres directement (cf.
-- diagramme §03). Recalculée en entier après chaque run nocturne,
-- jamais mise à jour en place.
CREATE TABLE index_values (
  id            BIGSERIAL PRIMARY KEY,
  index_code    TEXT NOT NULL,
  captured_at   DATE NOT NULL,
  value         NUMERIC(12,4) NOT NULL,
  constituents  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (index_code, captured_at)
);

-- Score structurel de sous-cote/surcote (signal B, cf. §07) -- PAS
-- le verdict ponctuel de l'extension (signal A, table `prices`) : un
-- signal persistant, recalculé chaque nuit, qui compare la valeur
-- théorique d'une carte (rareté × popularité du personnage) à son
-- prix marché réel. collector_factor/demand_factor fixés à 1.0 en
-- MVP -- non modélisés, pas bloquant pour démarrer.
CREATE TABLE opportunity_scores (
  id                    BIGSERIAL PRIMARY KEY,
  item_id               BIGINT NOT NULL REFERENCES items(id),
  captured_at           DATE NOT NULL,
  pull_cost             NUMERIC(12,2),
  character_multiplier  NUMERIC(6,4),
  collector_factor      NUMERIC(6,4) DEFAULT 1.0,
  demand_factor         NUMERIC(6,4) DEFAULT 1.0,
  theoretical_value     NUMERIC(12,2) NOT NULL,
  market_price          NUMERIC(12,2) NOT NULL,
  opportunity_score     NUMERIC(10,4) NOT NULL,
  created_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE (item_id, captured_at)
);
CREATE INDEX idx_opportunity_score ON opportunity_scores (captured_at DESC, opportunity_score DESC);

-- Comptes utilisateurs : auth déléguée à Firebase Authentication
-- (Google Sign-In) -- cette table ne stocke JAMAIS de mot de passe,
-- juste le profil CardQuant en plus de ce que Firebase gère déjà
-- (uid, email). Accès gratuit pour l'instant (décision explicite) :
-- pas de colonne plan/abonnement tant que le modèle payant n'est pas
-- tranché avant le lancement -- à ajouter à ce moment-là, pas avant.
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  firebase_uid  TEXT NOT NULL,
  display_name  TEXT,
  avatar_url    TEXT,          -- Cloud Storage, upload custom (pas juste la photo Google)
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (firebase_uid)
);

-- Historique de recherche par utilisateur -- alimente "dernières
-- recherches" dans l'extension/le site. Append-only comme le reste
-- du schéma : pas de fenêtre de rétention imposée ici, à purger plus
-- tard si le volume devient un sujet, pas un problème au lancement.
CREATE TABLE search_history (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id),
  item_id      BIGINT NOT NULL REFERENCES items(id),
  searched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_search_history_user ON search_history (user_id, searched_at DESC);

-- Journal d'exécution : une ligne par étape de job (3 jobs, pas de
-- tiers) -- même rôle d'observabilité qu'un dashboard de fraîcheur
-- "/live", sans la complexité des paliers par ancienneté.
CREATE TABLE sync_runs (
  id            BIGSERIAL PRIMARY KEY,
  run_type      TEXT NOT NULL,        -- 'nightly_prices' | 'nightly_listings' | 'monthly_referential'
  status        TEXT NOT NULL DEFAULT 'running',
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  rows_written  INTEGER,
  detail        TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_sync_runs_started ON sync_runs (started_at DESC);
Relations
Table	Strate	Relation
items	Référentiel	racine — toutes les autres tables référencent item_id
price_snapshots	Brut	item_id → items.id
active_listings	Brut	item_id → items.id
sales	Brut — rempli à la demande	item_id → items.id
prices	Cache mutable (TTL)	item_id → items.id
index_values	Dérivé	aucune FK — agrège price_snapshots par index_code
opportunity_scores	Dérivé	item_id → items.id
users	Référentiel (compte)	aucune FK — firebase_uid pointe vers Firebase Auth, hors Postgres
search_history	Brut	user_id → users.id, item_id → items.id
sync_runs	Journal	aucune FK — observabilité des 3 jobs
Pas de colonne palier, pas de matérialisation par précaution. Le ROI gradation se calcule en live côté client (§07), inutile de le matérialiser. Le score structurel (opportunity_scores) est un signal produit confirmé, pas une hypothèse à trancher plus tard. Pas de table pour l'arbitrage : calculateur 100% côté client, rien à stocker.

07 — Les formules
Cinq signaux, verrouillés avant d'écrire le SQL, pas après.

A — Verdict ponctuel (extension)

Pastille vert/jaune/rouge : ratio = prix_affiché / prix_de_référence
prix_de_référence = médiane des cotations PriceCharting (seule source de référence branchée en MVP). < 0.85 vert (bonne affaire) · 0.85–1.15 jaune (prix normal) · > 1.15 rouge (survendu). Seuils calibrés et validés en conditions réelles — configurables (.env), pas à retuner sans donnée contraire.

Score d'opportunité (jauge 0-100 du panneau, signal continu distinct de la pastille ci-dessus) : combine trois composantes pondérées — prix (60%), liquidité (25%), confiance d'identification (15%). La composante prix compare prix_affiché à la médiane des ventes réellement conclues les plus récentes (repli sur la moyenne des 10 dernières, puis sur prix_de_référence PriceCharting en tout dernier recours si aucune vente récente n'est connue) — jamais à prix_de_référence seul, pour ne pas afficher "Bonne affaire" sur un prix supérieur à ce qui s'est réellement vendu récemment.

Médiane plutôt que moyenne des 3 dernières ventes (corrigé le 2026-08-28) : une moyenne arithmétique sur 3 valeurs se fait fausser en entier par une seule vente mal classée par la source (ex. carte `item_id=73783`, Roronoa Zoro OP06-118 [Alternate Art Manga] — une vente à $30,64 mêlée à des ventes à $1475/$1750 faussait le score de -33% environ) ; mesuré sur toute la table `sales`, ~15% des couples (carte, grade) ont au moins une vente à >5x d'écart dans leurs 3 dernières. Fenêtre adaptative de 3 à 5 ventes : étendue à 4/5 ventes SEULEMENT si elles restent à ≤180 jours de la 3e (l'ancre, pas "aujourd'hui") — au-delà, la vente supplémentaire n'est plus un point de "maintenant" mais une vraie tendance de marché sur une carte peu liquide, que mélanger au signal récent biaiserait plutôt que de le robustifier. Validé contre `price_snapshots` (référence indépendante, pas dérivée de `sales`) : médiane-5 bat médiane-3 sous 180j d'écart, mais perd nettement au-delà (13,7% d'écart moyen à la référence pour médiane-3 vs 22,2% pour médiane-5 sur les groupes à ventes espacées de plus d'un an). Détail dans `pricing/sales_stats.py`.

B — Score structurel (site, sous-cote/surcote persistante)

score = valeur_théorique / prix_marché
valeur_théorique = pull_cost × character_multiplier × collector_factor × demand_factor
pull_cost = prix_du_pack × (1/taux_de_pull), taux_de_pull dérivé du nombre de cartes de cette rareté dans le set. collector_factor et demand_factor fixés à 1.0 en MVP — non modélisés, pas bloquant pour démarrer, à affiner avec un vrai signal de demande plus tard. Score > 1 = carte sous-cotée.

ROI gradation (extension, calcul côté client)

ROI = (valeur_attendue − prix_ungraded − frais) / (prix_ungraded + frais)
valeur_attendue = Σ P(grade=g) × prix_marché(grade=g)
P(grade=g) vient de la distribution historique des notes — cascade carte → set+rareté → set → tcg jusqu'au niveau qui a assez de ventes gradées pour être fiable. Recalculable en direct côté client quand l'utilisateur change ses hypothèses.

Liquidité (extension + site)

liquidité = ventes(30j) / annonces_actives_moyennes(30j)
Affichée en clair ("12 ventes / 30j · 4 annonces actives") plutôt qu'en score opaque — le ratio reste calculable derrière pour trier/filtrer.

Calculateur d'arbitrage (extension, 100% côté client)

bénéfice = prix_revente_moyen − (prix_achat + livraison + douane)
prix_achat/livraison/douane saisis par l'utilisateur. prix_revente_moyen = le même prix de référence que le verdict ponctuel (A) — aucune donnée en plus à collecter, rien n'est stocké côté serveur.

Indice global (site — signal agrégé, construit sur tout ce qui précède)

poids_i(t) = [volume_i(t) × liquidité_i(t)] / Σ_j [volume_j(t) × liquidité_j(t)]
indice(t)  = indice(t-1) × Σ_i [poids_i(t-1) × (prix_i(t) / prix_i(t-1))]
Base 100 au jour de lancement — pas base 0 : une lecture en pourcentage ("+43% depuis le lancement") a besoin d'un niveau de départ non nul. Pondéré par volume × liquidité (réutilise la formule liquidité ci-dessus) plutôt qu'équipondéré — une carte peu échangée, dont le prix est souvent bruité justement parce qu'elle se vend peu, pèse moins sur l'indice.

Le chaînage se résout par construction, pas par un correctif ponctuel. Les poids se recalculent chaque jour à partir de ceux de la veille (méthode Laspeyres chaînée) — quand une nouvelle carte ou un nouveau set entre dans l'univers, il entre avec son propre poids au jour J, sans saut artificiel ni facteur de chaînage à coder à part.

Tout en USD, aucune conversion. items.language (EN/JP) reste la vraie distinction produit — deux impressions physiques, deux historiques de prix — mais aucune table fx_rates : toute source non-USD (Vinted, à terme) convertit une fois à l'écriture, jamais à la lecture — même règle pour sales.

08 — Interface
Maquette statique validant la structure avant d'écrire le moindre composant : CardQuant Terminal — les 4 écrans en interactif. Prix et volumes illustratifs, pas des données de marché réelles.

Écran	Surface	Contenu clé
Dashboard	Site	Indice global (graphique), aperçu watchlist, recherches récentes
Watchlist	Site	Table triable/filtrable des scores d'opportunité (§07)
Fiche carte	Site	Historique de prix, liquidité, ventes récentes, ROI gradation interactif — point d'atterrissage du bouton extension
Panneau extension	Extension	Verdict ponctuel, stats rapides, calculateur d'arbitrage, liens vers les annonces trouvées
Direction visuelle : système "Terminal". Manrope + IBM Plex Mono, verre dépoli, thème clair unique — un choix assumé : desk de trading pour cartes à collectionner, chiffres en monospace, accent de couleur par univers (bleu Pokémon / rouge One Piece). Le composant propre à ce produit : le chrome du panneau extension (§01), qui n'a d'équivalent nulle part ailleurs dans le système.

09 — Publication extension
Chrome Web Store, extension Google — le canal visé dès le départ. Une partie de cette checklist est un vrai goulot d'étranglement de mise en prod : la review peut prendre de quelques heures à plusieurs semaines selon les permissions demandées, indépendamment de la qualité du code livré.

Compte développeur — 5$, une fois. Frais unique (pas par extension), couvre tout ce qui sera publié plus tard sous ce compte. À faire tôt : c'est un blocage administratif, pas technique.
Manifest V3 obligatoire. Le Store n'accepte plus de nouvelle soumission en Manifest V2. Service worker événementiel, pas de background page persistante — ça conditionne directement comment le panneau extension (§08) écoute les pages et communique avec le backend.
Permissions scopées aux domaines réels, jamais un joker. https://www.ebay.com/* et équivalents explicites — pas <all_urls>. Une permission large ralentit la review et affiche un avertissement dissuasif à l'installation.
Panneau strictement additif. Ne jamais masquer, modifier ou réécrire le contenu de la page hôte, aucune injection publicitaire ou de lien affilié — les règles anti-"ad injection"/"deceptive install" de Chrome ciblent précisément ce type d'extension.
Politique de confidentialité publiée + déclaration "Privacy practices". Obligatoire dès qu'il y a compte utilisateur ou lecture de contenu de page — les deux sont vrais ici.
Connexion Google dans l'extension ≠ connexion Google sur le site. Un simple redirect OAuth web ne marche pas dans une extension. Passe par chrome.identity (getAuthToken ou launchWebAuthFlow), à intégrer avec Firebase Auth (§05) — un vrai travail d'intégration.
Tester en privé avant la review publique. Chrome permet de charger l'extension en local (mode développeur) ou de la distribuer à des testeurs de confiance sans passer par la review publique.

10 — Chantiers futurs

Favoris (watchlist), backend livré le 2026-08-29 — extension/site restent à faire. Proposé le 2026-08-25 : un utilisateur pourrait sauvegarder une carte en favori (identité + langue précise, EN et JP comptent comme deux favoris distincts puisque ce sont deux `items`) directement depuis le panneau extension, puis la retrouver sur le site, connecté avec le même compte.

Décidé le 2026-08-29, sans attendre le choix du fournisseur de paiement : 3 favoris gratuits, au-delà réservé au premium. `user_entitlements.is_premium` (bascule manuelle en SQL pour l'instant, pas de parcours d'achat) fait office de jalon minimal — remplaçable plus tard par un webhook Stripe sans changer le point de vérification côté API. Le reste de la décision différée le 2026-08-25 (quel fournisseur, quel prix, portail self-service) n'est toujours pas tranché.

Construit : table `favorites` (firebase_uid + item_id, UNIQUE, add/remove — pas append-only comme sales/price_snapshots, cf. db/schema.sql) et `user_entitlements` ; logique DB dans pricing/favorites.py ; endpoints `GET/POST /favorites` + `DELETE /favorites/{item_id}` dans pricing_api/main.py, gate 402 côté serveur (jamais seulement côté extension/client, même principe que require_user sur /verdict) — testés dans tests/test_favorites_endpoint.py. Pas de table `users` : comme pour /verdict, l'identité vient directement de Firebase Auth (pricing.auth.verify_id_token), `firebase_uid` sert de clé.

Restant : bouton "surveiller" dans le panneau extension (extension/content/*, extension/background.js) et l'écran Watchlist du site (§08, prévu dès la maquette, jamais construit) qui consomme ces endpoints — web/ ne peut pas écrire directement en base (utilisateur DB en lecture seule, cf. web/lib/db.ts), donc web/ devra appeler pricing_api comme le fait déjà l'extension pour /verdict, pas une requête Postgres directe.
CardQuant · document de référence