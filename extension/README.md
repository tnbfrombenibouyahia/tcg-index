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
- Panneau coulissant (glassmorphisme clair, cf. §08), onglet replié coloré
  vert/jaune/rouge une fois le verdict connu.
- **Compte requis avant utilisation (§01/§09)** : `lib/auth.js` fait
  `chrome.identity.launchWebAuthFlow` (Google) puis échange le `id_token`
  contre une session Firebase via l'API REST Identity Toolkit
  (`accounts:signInWithIdp`) — aucun SDK à bundler. Le panneau affiche un
  bouton "Se connecter avec Google" tant qu'aucune session n'existe dans
  `chrome.storage.local`.
  - ✅ **Vérifié côté serveur** : `pricing_api` exige désormais un en-tête
    `Authorization: Bearer <id_token>` valide (cf. `pricing/auth.py`,
    vérification via l'API REST Identity Toolkit `accounts:lookup`) --
    `/verdict` répond `401` sans jeton ou avec un jeton invalide/expiré,
    ce n'est plus un mur d'UX uniquement. `background.js` rafraîchit le
    jeton automatiquement via `securetoken.googleapis.com` s'il est proche
    de l'expiration (1h de durée de vie, cf. `lib/auth.js::getValidIdToken`).
  - ⚠️ **Étape manuelle requise avant que la connexion fonctionne** :
    enregistrer `https://diipacpliojnijgdhcgjkjhlipednoch.chromiumapp.org/`
    dans la liste "Authorized redirect URIs" du client OAuth Web déjà
    provisionné par Firebase (Google Cloud Console → APIs & Services →
    Identifiants → client `606137510344-03e55c2usplh7urnvslctfiu83rul4si`).
    Aucune API publique pour cette étape (confirmé pendant ce chantier).
    Cet ID d'extension vient de la clé figée dans `manifest.json` (`key`) —
    il **changera** à la publication sur le Store (Chrome assigne un ID
    définitif à la création de la fiche), il faudra alors ajouter la
    nouvelle URI de redirection en plus (pas à la place, pour garder le dev
    local fonctionnel).

Pas fait (hors scope de ce scaffold) :
- ROI gradation, liquidité, calculateur d'arbitrage (§07) — décrits comme
  calculs côté client dans le handoff, pas encore implémentés ici.
- Vinted, Cardmarket — seul eBay (14 domaines pays, cf. `manifest.json`)
  est scopé pour l'instant.
- **Conversion de devise** : `pricing_api` compare toujours à un prix de
  référence en USD (PriceCharting, seule source MVP, cf. `shared/verdict.py`).
  Le panneau détecte la devise affichée (`$`/`€`/`£`) et refuse
  explicitement une devise ≠ USD plutôt que d'afficher un verdict
  silencieusement faux — donc pas de verdict du tout sur ebay.fr/.de/...
  tant qu'aucune conversion n'est branchée côté serveur.
- Identification par image (upload/capture depuis le panneau) — le back-end
  (`pricing/ocr.py`) sait déjà faire l'OCR, rien côté extension ne l'appelle
  encore (aujourd'hui seul le titre de l'annonce est envoyé).
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
3. Recharger l'extension après chaque modification (bouton ↻ sur la carte
   de l'extension dans `chrome://extensions`), puis rafraîchir l'onglet eBay.

## Icônes

Placeholders générés par script (monogramme "CQ", accent bleu `#3b82f6` du
site, cf. `web/app/globals.css`) — à remplacer par un vrai logo avant toute
soumission au Store.
