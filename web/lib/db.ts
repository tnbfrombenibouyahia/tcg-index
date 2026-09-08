import { ExternalAccountClient } from "google-auth-library";
import postgres from "postgres";
import { getVercelOidcToken } from "@vercel/oidc";

// Cloud SQL (cardquant-tcg) -- connexion TCP directe (2026-09-07), PAS via
// @google-cloud/cloud-sql-connector. Remplace le tunnel local (mTLS + socket
// Unix /tmp, cf. git blame -- migration du 2026-08-19) qui s'est révélé
// fragile en usage serverless réel : 3 incidents en 24h le 2026-09-06/07 --
// épuisement de connexions (rafale de prefetch Next.js), timeout de build
// (singleton partagé sérialisé sur 1 connexion pendant `next build`), puis
// des blocages francs (`write CONNECT_TIMEOUT` sur le socket local, jusqu'à
// des invocations qui épuisaient les 300s de timeout Vercel) -- cf. mémoire
// projet. Le chronométrage ajouté pour diagnostiquer ces derniers a montré
// que la poignée de main IAM/OIDC elle-même est rapide (500-700ms) : le
// tunnel local (processus séparé par instance, socket qui peut rester
// "vivant" sur le disque /tmp d'un conteneur gelé/dégelé sans qu'un vrai
// listener réponde derrière) était le vrai point de fragilité, pas
// l'authentification.
//
// Toujours PAS de mot de passe statique : le jeton d'accès OAuth du compte
// de service impersonné (même chaîne Workload Identity Federation qu'avant)
// sert de mot de passe Postgres (authentification IAM Cloud SQL native,
// supportée nativement en TCP+SSL, sans connecteur -- cf.
// https://cloud.google.com/sql/docs/postgres/iam-authentication). postgres.js
// accepte `password` comme fonction (rappelée à chaque nouvelle connexion
// physique du pool, cf. node_modules/postgres/types/index.d.ts) : chaque
// connexion récupère un jeton frais, pas de logique de rafraîchissement
// manuelle à écrire.
//
// IP publique + authorizedNetworks ouvert à 0.0.0.0/0 (Vercel n'a pas d'IP de
// sortie fixe pour ses fonctions serverless, cf. commentaire historique de ce
// fichier) : le compromis sécurité assumé le 2026-09-07 -- la vraie barrière
// n'est plus le réseau mais l'auth (jeton IAM éphémère, ~1h, imposssible à
// obtenir sans l'identité du déploiement Vercel) + SSL obligatoire
// (sslMode=ENCRYPTED_ONLY côté instance, CA épinglée ci-dessous côté client,
// pas de rejectUnauthorized:false).
//
// Lue depuis l'environnement, PAS codée en dur : ce repo est public sur
// GitHub -- une IP fixe de base de prod confirmée acceptant 0.0.0.0/0 n'a
// rien à faire en clair dans l'historique git, même si l'IP seule ne
// suffit pas à se connecter (jeton IAM obligatoire derrière). À définir
// dans Vercel (env Production ET Preview, ce module tourne dans les deux) :
// CLOUD_SQL_HOST=35.242.206.132 (cf. `gcloud sql instances describe
// cardquant-db --format="value(ipAddresses)"` pour la retrouver si elle
// change).
const CLOUD_SQL_HOST = process.env.CLOUD_SQL_HOST;
if (!CLOUD_SQL_HOST) throw new Error("CLOUD_SQL_HOST manquante (variable d'environnement Vercel).");
const CLOUD_SQL_PORT = 5432;
// Utilisateur IAM (cf. gcloud sql users create ... --type=cloud_iam_service_account)
// -- email du compte de service SANS le suffixe .gserviceaccount.com, limite
// de longueur d'identifiant Postgres oblige (contrainte Cloud SQL, pas un
// choix arbitraire).
const IAM_DB_USER = "cardquant-web-db@cardquant-tcg.iam";
const DATABASE_NAME = "cardquant";

// CA du serveur Cloud SQL (`gcloud sql instances describe cardquant-db
// --format="value(serverCaCert.cert)"`) -- pas un secret (c'est un
// certificat public), épinglé ici pour vérifier l'identité du serveur plutôt
// que `rejectUnauthorized: false`. Valide jusqu'au 2036-08-13 ; si Cloud SQL
// fait tourner sa CA avant cette date (serverCaMode), reconnecter le nouveau
// certificat ici -- la connexion échouera proprement (erreur de vérification
// TLS) plutôt que de se dégrader silencieusement.
const CLOUD_SQL_SERVER_CA = `-----BEGIN CERTIFICATE-----
MIIDcTCCAlmgAwIBAgIBADANBgkqhkiG9w0BAQsFADBwMS0wKwYDVQQuEyQzNTg2
ZDM2My1lY2VjLTRiMmEtOTJkOC0zNDBkNjdjMTg0ODUxHDAaBgNVBAMTE0Nsb3Vk
IFNRTCBTZXJ2ZXIgQ0ExFDASBgNVBAoTC0dvb2dsZSwgSW5jMQswCQYDVQQGEwJV
UzAeFw0yNjA4MTYwOTE5MzRaFw0zNjA4MTMwOTIwMzRaMHAxLTArBgNVBC4TJDM1
ODZkMzYzLWVjZWMtNGIyYS05MmQ4LTM0MGQ2N2MxODQ4NTEcMBoGA1UEAxMTQ2xv
dWQgU1FMIFNlcnZlciBDQTEUMBIGA1UEChMLR29vZ2xlLCBJbmMxCzAJBgNVBAYT
AlVTMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxaVrzFst9TFThLbU
g0Li9sscepa/rvNjkMN4ASFU72rwYOkHWKwvvUgI41Q6iPpkkndhgA2HHGdKxzwK
WVufvGOGqU5ps8rk1XJox4IBvGp/1sYJSzXjf6+RabYYk4bINjWh+bSX+RzQcpqt
vSJ8w6EEFRi6bJmRxzFODrXfncg+rdaVIjYWk216QIf5wOHwx54Aa4F3sc5aDBF1
tvV5+wJQNe/Zkiv4tMSTcMr3xmC2PE7ngPxMuXw7Mz8l9YDnl4bUpERbrJirw1jA
wWOiuyItlu9qA3oXAyqUze12rT/7GnleWYhr4Zcn/ZAs07X3aV3jtBZdUFpIZRVg
qYsUtwIDAQABoxYwFDASBgNVHRMBAf8ECDAGAQH/AgEAMA0GCSqGSIb3DQEBCwUA
A4IBAQCToBBkEAWrqXSYHsZkfHLGFSHuLQGx1jw4rNA4RVHlst0Dhjz+Rh72lkS5
BRrSO99PivVX2pF4r/pQtq8SFbcRFFEQqbeHxqhFL35wFwvCOpNv+uAbWRBhmDAV
VfekXZrVPOlbaahG3QN2Ksk3Jb9Nf3fs00waxR+2mBFkYDATWOxMssShum4tdQSp
gZRGJzK+FmtkPQ0SkU1jnRN6wSXhbhgjlxzDheC/ZFu9oLvQLVHHvwHHudfrozGb
BhVzqSKE5nvLoA2JebjiplQxdzBoNtMTCgqE9AGkgwGdYDaY130oLbuo96htqw/r
5eAaWG1JcXAv2gerbMpk8FJyuLGu
-----END CERTIFICATE-----
`;

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
//
// Portée par défaut (cloud-platform, cf. google-auth-library::
// baseexternalclient.js DEFAULT_OAUTH_SCOPE) -- pas restreinte explicitement
// à sqlservice.admin : cloud-platform la couvre déjà (superset), et c'est
// cette même portée qui fonctionnait déjà pour le connecteur avant ce
// changement (l'authentification n'a jamais été le problème, cf. commentaire
// de tête -- seul le transport change ici).
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

// Un seul client d'auth par instance serverless (le cache interne de
// google-auth-library réutilise déjà le jeton tant qu'il n'est pas expiré --
// pas besoin de le refaire nous-mêmes), un `postgres()` par instance
// (singleton via globalThis ci-dessous, toujours utile : `next build`
// réévalue ce module plusieurs fois au sein du même worker pendant la
// collecte des pages, cf. commentaire historique -- sans garde, chaque
// réévaluation créerait un nouveau pool pour rien, plus de risque de
// contention réseau qu'avant vu qu'il n'y a plus de socket partagé à
// verrouiller).
function createClient() {
  const authClient = buildAuthClient();

  return postgres({
    host: CLOUD_SQL_HOST,
    port: CLOUD_SQL_PORT,
    user: IAM_DB_USER,
    database: DATABASE_NAME,
    ssl: { ca: CLOUD_SQL_SERVER_CA }, // vérifie l'identité du serveur (pas rejectUnauthorized:false)
    // Jeton d'accès du compte de service impersonné, rappelé par postgres.js
    // à CHAQUE nouvelle connexion physique du pool -- toujours frais (durée
    // de vie ~1h, largement supérieure à la durée d'une invocation), aucune
    // logique de rafraîchissement à écrire ici.
    password: async () => {
      const { token } = await authClient.getAccessToken();
      if (!token) throw new Error("Cloud SQL : jeton d'accès IAM vide (getAccessToken).");
      return token;
    },
    prepare: false,
    // 3 : garde le pire cas d'une rafale runtime (N instances x 3) très en
    // dessous d'une éventuelle rafale x5, cf. incident du 2026-09-06 --
    // toujours pertinent même sans connecteur (protège le nombre de
    // connexions PostgreSQL, pas le tunnel local qui a disparu).
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

// Singleton via globalThis, cf. commentaire de createClient() ci-dessus.
declare global {
  var __pgClient: ReturnType<typeof postgres> | undefined;
}

const sql = globalThis.__pgClient ?? createClient();

globalThis.__pgClient = sql;

export default sql;
