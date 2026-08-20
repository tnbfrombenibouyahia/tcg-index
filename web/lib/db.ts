import { mkdirSync } from "node:fs";
import { AuthTypes, Connector } from "@google-cloud/cloud-sql-connector";
import { ExternalAccountClient } from "google-auth-library";
import postgres from "postgres";
import { getVercelOidcToken } from "@vercel/oidc";

// Cloud SQL (cardquant-tcg), pas Supabase -- migration du 2026-08-19 (cf.
// tcg-index-handoff.md, shared/db.py côté Python). Connexion via le
// connecteur Cloud SQL + authentification IAM fédérée depuis le jeton OIDC
// Vercel (Workload Identity Federation), PAS un mot de passe statique dans
// une variable d'env : le compte de service cardquant-web-db@ n'est
// impersonnable QUE par ce projet Vercel précis (tcg_index), environnements
// production/preview (cf. condition sur le pool cardquant-vercel-pool), et
// n'a que SELECT côté Postgres (cf. db/create_web_user_cloudsql.py -- même
// principe pour le compte de service, granté à la main lors de la
// migration, pas par ce script-là qui gère le compte à mot de passe).
//
// Pourquoi pas juste une IP publique + mot de passe (ce que faisait
// Supabase, et CockroachDB avant) : Vercel n'a pas d'IP de sortie fixe pour
// ses fonctions serverless -- impossible de restreindre Cloud SQL par IP
// sans l'ouvrir à 0.0.0.0/0. Le connecteur IAM élimine le besoin
// d'autoriser une IP publique : aucune n'est autorisée sur l'instance
// (authorizedNetworks vide), tout passe par un tunnel mTLS établi via
// l'Admin API Cloud SQL.
const INSTANCE_CONNECTION_NAME = "cardquant-tcg:europe-west3:cardquant-db";
// Utilisateur IAM (cf. gcloud sql users create ... --type=cloud_iam_service_account)
// -- email du compte de service SANS le suffixe .gserviceaccount.com, limite
// de longueur d'identifiant Postgres oblige (contrainte Cloud SQL, pas un
// choix arbitraire).
const IAM_DB_USER = "cardquant-web-db@cardquant-tcg.iam";
const DATABASE_NAME = "cardquant";

const GCP_PROJECT_NUMBER = "606137510344";
const GCP_WORKLOAD_IDENTITY_POOL_ID = "cardquant-vercel-pool";
// "...provider2" et pas juste "...provider" : le premier essai avait une
// restriction --allowed-audiences mal configurée (attendait l'audience
// Vercel brute au lieu du nom de ressource complet du provider) --
// supprimé plutôt que recréé sous le même nom, GCP garde les providers
// supprimés ~30 jours avant de libérer le nom.
const GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = "cardquant-vercel-provider2";
const GCP_SERVICE_ACCOUNT_EMAIL = "cardquant-web-db@cardquant-tcg.iam.gserviceaccount.com";

// Pas de "https:" devant -- l'API STS (sts.googleapis.com/v1/token) rejette
// l'audience avec le schéma complet ("Invalid value for audience", testé en
// conditions réelles le 2026-08-19). Chemin protocol-relative uniquement,
// malgré ce qu'affiche un exemple de la doc Vercel (les deux formats
// coexistent dans leurs exemples selon l'usage -- Vertex AI vs STS direct).
//
// join() plutôt que deux template literals adjacentes concaténées par "+" :
// cette dernière forme donnait un résultat tronqué ("/locations/global/"
// disparaissait) une fois passée par le bundler Turbopack de ce build --
// reproduit et confirmé (console.error + JSON.stringify pendant `next
// build`), source pourtant correcte à l'oeil. Contournement, pas une
// compréhension complète de la cause -- si un futur upgrade Turbopack la
// corrige, cette forme reste correcte de toute façon.
const GCP_AUDIENCE = [
  "//iam.googleapis.com/projects/",
  GCP_PROJECT_NUMBER,
  "/locations/global/workloadIdentityPools/",
  GCP_WORKLOAD_IDENTITY_POOL_ID,
  "/providers/",
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID,
].join("");

// Échange le jeton OIDC Vercel (identité du déploiement -- projet + env,
// jamais un secret stocké) contre des identifiants Google via Workload
// Identity Federation, avec impersonation du compte de service ci-dessus.
// Doc Vercel : https://vercel.com/docs/oidc/gcp
function buildAuthClient() {
  // fromJSON() type le retour en nullable (cas générique : JSON qui ne
  // décrirait pas un compte external_account) -- ne peut pas arriver avec
  // le littéral ci-dessus, mais TypeScript ne le sait pas statiquement.
  const client = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: GCP_AUDIENCE,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    // join(), même raison que GCP_AUDIENCE ci-dessus.
    service_account_impersonation_url: [
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/",
      GCP_SERVICE_ACCOUNT_EMAIL,
      ":generateAccessToken",
    ].join(""),
    subject_token_supplier: {
      getSubjectToken: () => getVercelOidcToken({ audience: GCP_AUDIENCE }),
    },
  });
  if (!client) throw new Error("Échec de construction du client GCP (ExternalAccountClient.fromJSON a renvoyé null).");
  return client;
}

// startLocalProxy() (pas getOptions(), pensé pour le driver `pg`) : ouvre un
// socket Unix local que le connecteur relaie vers Cloud SQL en mTLS --
// postgres.js s'y connecte comme à un Postgres local classique, sans rien
// savoir du tunnel. /tmp : seul répertoire garanti inscriptible dans une
// fonction Vercel (le répertoire de déploiement lui-même est en lecture seule).
async function createClient() {
  const connector = new Connector({ auth: buildAuthClient() });
  const socketDir = "/tmp/cardquant-cloudsql";
  const socketPath = `${socketDir}/.s.PGSQL.5432`;
  // Le connecteur ne crée pas le dossier parent lui-même -- idempotent
  // (recursive: true ne relève pas d'erreur si déjà là, cf. conteneur
  // réutilisé entre invocations, même garde-fou que le singleton ci-dessous).
  mkdirSync(socketDir, { recursive: true });

  await connector.startLocalProxy({
    instanceConnectionName: INSTANCE_CONNECTION_NAME,
    authType: AuthTypes.IAM,
    listenOptions: { path: socketPath },
  });

  return postgres({
    host: socketPath.slice(0, socketPath.lastIndexOf("/")),
    port: 5432,
    user: IAM_DB_USER,
    database: DATABASE_NAME,
    // Le tunnel du connecteur est déjà chiffré (mTLS) -- pas de SSL en plus
    // sur cette dernière étape locale (unix socket, hors réseau de toute façon).
    ssl: false,
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

// Filet de sécurité : `Connector.startLocalProxy()` peut rester bloqué
// indéfiniment sans jamais rejeter sa promesse si l'écoute du socket échoue
// en interne (constaté en conditions réelles le 2026-08-19 -- EACCES sur
// Windows en dev local, cause probablement différente en prod mais le même
// symptôme -- pendaison plutôt qu'erreur -- resterait catastrophique pour
// une fonction serverless). Sans ce timeout, une seule connexion bloquée
// suffirait à faire pendre indéfiniment toute requête qui dépend de `sql`.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// Singleton via globalThis, TOUJOURS (pas seulement hors production comme
// l'ancienne version Supabase de ce fichier) : `next build` réévalue ce
// module plusieurs fois au sein du même worker lors de la collecte des
// pages (une fois par route qui l'importe, directement ou non), et sans ce
// garde-fou chaque réévaluation retente startLocalProxy() sur le MÊME
// chemin de socket -- EADDRINUSE dès la 2e tentative (constaté en
// conditions réelles sur Vercel le 2026-08-20). L'ancienne restriction
// "hors production" supposait un process = une évaluation en prod, vraie
// pour un import applicatif classique, fausse pour cette phase de build.
declare global {
  var __pgClient: ReturnType<typeof postgres> | undefined;
}

const sql =
  globalThis.__pgClient ??
  (await withTimeout(createClient(), 15_000, "Cloud SQL Connector : startLocalProxy n'a pas répondu sous 15s."));

globalThis.__pgClient = sql;

export default sql;
