# CardQuant — extension navigateur (scaffold)

Panneau latéral coulissant, verdict en direct sur une annonce eBay One
Piece TCG — cf. `tcg-index-handoff.md` §01/§08/§09.

## État de ce scaffold

Fait :
- Manifest V3, service worker événementiel (pas de background page
  persistante), permissions scopées à `ebay.com/itm/*` (pas de joker
  `<all_urls>`, cf. §09).
- Extraction titre + prix affiché depuis le DOM de la page annonce eBay
  (sélecteurs best-effort, cf. commentaire en tête de `content/content.js`
  — eBay change son markup sans préavis).
- Appel `POST /verdict` sur `pricing_api` (signal A, §07-A) depuis le
  service worker plutôt que le content script, pour ne pas dépendre de la
  CSP de la page hôte.
- **Conversion de devise (`lib/fx.js`)** : `pricing_api` ne raisonne qu'en
  USD (PriceCharting, seule source MVP, cf. `shared/verdict.py`). Le
  panneau détecte `$`/`€`/`£` sur la page et convertit vers l'USD (taux
  BCE via api.frankfurter.dev, gratuit, sans clé, mis en cache 6h) avant
  d'appeler `/verdict` — le montant d'origine reste affiché entre
  parenthèses pour que la conversion soit visible, jamais implicite. Une
  devise non reconnue (ni `$`/`€`/`£`) est refusée plutôt que devinée.
- Panneau coulissant repris sur le design system du site ("TCG Terminal",
  cf. `web/app/globals.css`) : mêmes couleurs positive/negative, même mono
  pour les chiffres, pills tintées façon `GradingRoiWidget.tsx`. Header
  persistant (statut d'identification, distinct du verdict) + ligne
  d'écart annonce/référence (magnitude calculée en JS, seuils décidés côté
  serveur). Onglet replié coloré vert/jaune/rouge une fois le verdict
  connu. Pas de `backdrop-filter` : le fond réel de la page hôte (eBay)
  n'est jamais contrôlé, un flou de fond serait imprévisible -- fond quasi
  opaque à la place (cf. commentaire en tête de `content/panel.css`).
- **Compte requis avant utilisation (§01/§09)** : la connexion (Google
  Sign-In) se fait sur **le site** (`web/components/auth/AuthModal.tsx`,
  `signInWithPopup` + Firebase Auth JS SDK), pas dans l'extension. "Se
  connecter sur CardQuant" dans le panneau ouvre `tcgindex.vercel.app/
  ?cardquant_login=1` dans un nouvel onglet (`background.js`) ; une fois
  connecté là-bas, le site relaie la session à l'extension via
  `chrome.runtime.sendMessage` (`web/lib/cardquant-extension.ts`), reçue
  ici par `chrome.runtime.onMessageExternal` (`background.js`) et stockée
  (`lib/auth.js::storeExternalSession`). Le panneau se met à jour tout seul
  dès que la session arrive (`chrome.storage.onChanged`, cf.
  `content/content.js`) — pas besoin de revenir cliquer sur l'onglet eBay.
  - Pourquoi pas une connexion dans l'extension elle-même (implémentation
    précédente, `chrome.identity.launchWebAuthFlow`, jusqu'au 2026-08-19) :
    ça dupliquait la logique de connexion (déjà nécessaire sur le site pour
    le dashboard) dans l'extension — deux chemins à maintenir pour un seul
    compte. Un seul chemin (le site), l'extension ne fait plus que le
    recevoir et le rafraîchir.
  - ✅ **Vérifié côté serveur** : `pricing_api` exige un en-tête
    `Authorization: Bearer <id_token>` valide (cf. `pricing/auth.py`,
    vérification via l'API REST Identity Toolkit `accounts:lookup`) --
    `/verdict` répond `401` sans jeton ou avec un jeton invalide/expiré, ce
    n'est pas qu'un mur d'UX. `background.js` rafraîchit le jeton
    automatiquement via `securetoken.googleapis.com` s'il est proche de
    l'expiration (1h de durée de vie, cf. `lib/auth.js::getValidIdToken`).
  - ⚠️ **Couplage à surveiller à la publication Store** : le relais
    (`externally_connectable` du manifest + `CARDQUANT_EXTENSION_ID` codé
    en dur dans `web/lib/cardquant-extension.ts`) référence l'ID d'extension
    actuel (`diipacpliojnijgdhcgjkjhlipednoch`, stable en dev grâce à la clé
    figée dans `manifest.json`). Chrome assigne un ID définitif à la
    publication sur le Store — il faudra alors mettre à jour cette constante
    côté site **et redéployer le site** (pas juste un réglage Console cette
    fois), sans quoi le relais silencieusement ne fait plus rien (jamais
    d'erreur bloquante par design, cf. docstring de `relaySessionToExtension`).

- **Panneau v2 (score, moy. ventes, liquidité, comparaison langue, display
  scellé, grade éditable)** : contrat étendu (`pricing_api/schemas.py`),
  calculs dédiés côté serveur (`pricing/sales_stats.py`,
  `pricing/liquidity.py`, `pricing/opportunity_score.py`), orchestrés par
  `shared/verdict.py::compute_extended_signals` (séparé de
  `compute_verdict_for_card`, cf. son docstring) et branchés dans
  `content/content.js`. Frontière respectée : le content script ne capte
  que titre/prix/grade (+ fallback select de grade, auto-détecté puis
  éditable par l'utilisateur, redéclenche `/verdict` au changement) ; tout
  le reste (score 0-100, moy. 3/10 ventes, liquidité, prix par langue, prix
  du display) vient de la réponse `/verdict`, jamais recalculé côté client.
  Testé via un harness jsdom ponctuel (pas de suite JS permanente dans ce
  repo) sur les statuts ok/no_reference_price/ambiguous/not_found + les 2
  interactions (changement de grade, clic CTA) — aucune erreur JS, aucun
  fragment "undefined"/"NaN" dans le rendu.
  - ⚠️ **Limite connue, prioritaire à lever** : `active_listings` (compteur
    "en vente active" du bloc Liquidité) ne couvre aujourd'hui QUE le
    scellé côté ingestion (`ingestion/sources/ebay.py`) — pour une carte
    seule, ce compteur est toujours `None` (affiché "—", jamais un faux
    `0`, cf. `pricing/repository.py::fetch_latest_active_listing_count`).
    Sans ce chiffre, la carte "seule" (le cœur d'usage réel de
    l'extension) reste incomplète sur ce point précis — à traiter en
    étendant l'ingestion eBay Browse API aux singles, pas juste un
    ajustement d'affichage.

- **Identification par image (passage 2 de la cascade, §01)** : quand le
  titre ne suffit pas (statut ni `ok` ni `no_reference_price`/`ambiguous`),
  le panneau propose "Essayer avec la photo de l'annonce" -- récupère la
  photo principale du carrousel eBay (`.ux-image-carousel-item(.active)
  img`, sélecteurs vérifiés en conditions réelles le 2026-08-22 sur 2
  annonces distinctes -- l'ancien `#icImg` "classique" n'existe plus sur le
  layout actuel), demandée en résolution max si le CDN l'expose
  (`/s-l500.webp` → `/s-l1600.webp`, gratuit -- même objet, meilleure
  précision OCR). Envoie `image_url` à la place de `text` (jamais les deux
  -- `pricing/matching.py::identify_card` n'utilise `image_url` QUE si
  `text` est absent) ; le back-end (`pricing/ocr.py`, Cloud Vision) existait
  déjà et savait déjà répondre, rien n'avait jamais rien envoyé côté
  extension jusqu'ici. Pas de 3ᵉ passage si l'OCR échoue aussi (`ne jamais
  deviner`, §01) : le bouton ne réapparaît pas après un échec en mode
  image. Testé via un harness jsdom ponctuel (même principe que le panneau
  v2) : bouton présent/absent selon qu'une photo est trouvable, requête
  `text: null` + `image_url` confirmée, identification réussie affichée,
  pas de 3ᵉ tentative offerte après un double échec.

Pas fait (hors scope de ce scaffold) :
- ROI gradation, calculateur d'arbitrage (§07) — décrits comme calculs
  côté client dans le handoff, pas encore implémentés ici.
- Vinted, Cardmarket — seul eBay (14 domaines pays, cf. `manifest.json`)
  est scopé pour l'instant.
- Publication Chrome Web Store (§09) : compte développeur 5$, politique de
  confidentialité publiée, test privé avant review — checklist inchangée,
  rien fait ici.

## Développement local

1. `chrome://extensions` → activer le mode développeur → "Charger
   l'extension non empaquetée" → sélectionner ce dossier `extension/`.
2. Pour pointer vers un `pricing_api` local plutôt que Cloud Run : modifier
   `PRICING_API_URL` dans `lib/config.js` vers `http://127.0.0.1:8001`
   (`uvicorn pricing_api.main:app --reload --port 8001`, déjà couvert par
   `host_permissions` du manifest), puis ajouter l'origine
   `chrome-extension://<id>` (visible sur `chrome://extensions` une fois
   l'extension chargée) à `PRICING_API_CORS_ORIGINS` dans `.env` avant de
   relancer le service.
3. Pour pointer vers un site local (`npm run dev` dans `web/`) plutôt que
   `tcgindex.vercel.app` : modifier `SITE_URL` dans `lib/config.js` vers
   `http://localhost:3000` (déjà couvert par `externally_connectable`).
4. Recharger l'extension après chaque modification (bouton ↻ sur la carte
   de l'extension dans `chrome://extensions`), puis rafraîchir l'onglet eBay.

## Icônes

Placeholders générés par script (monogramme "CQ", accent bleu `#3b82f6` du
site, cf. `web/app/globals.css`) — à remplacer par un vrai logo avant toute
soumission au Store.
