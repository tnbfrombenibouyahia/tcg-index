// Point d'entrée du micro-service de verdict (pricing_api/, déployé sur
// Cloud Run -- cf. Dockerfile.pricing-api). En développement local :
// remplacer par "http://127.0.0.1:8001" (uvicorn pricing_api.main:app
// --reload --port 8001), déjà couvert par host_permissions du manifest.
// Il faut aussi ajouter l'origine chrome-extension://<id> (visible sur
// chrome://extensions une fois l'extension chargée) à
// PRICING_API_CORS_ORIGINS côté .env avant de relancer le service local.
const PRICING_API_URL = "https://pricing-api-606137510344.europe-west3.run.app";

// Site CardQuant -- "Se connecter" (content/content.js) ouvre
// `${SITE_URL}/?cardquant_login=1` dans un nouvel onglet (background.js).
// En développement local : remplacer par "http://localhost:3000".
const SITE_URL = "https://tcgindex.vercel.app";
