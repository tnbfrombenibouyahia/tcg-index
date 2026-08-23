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
  - ✅ **Limite levée le 2026-08-22, singles + gradé, à la demande** :
    `active_listings` (compteur "en vente active" du bloc Liquidité)
    couvre désormais les singles ET les cartes gradées, Pokémon et One
    Piece, EN et JP -- Ungraded et gradé (`conditionIds:{4000}`/`{2750}`).
    **Un premier essai en BATCH par rotation a été tenté puis retiré la
    même journée** (`orchestrator.py::run_ebay_singles_listings_sync`,
    ~2,5 à ~5 semaines/cycle selon la portée -- historique dans les
    commentaires de `orchestrator.py`) : retour utilisateur explicite,
    un chiffre vieux d'un mois n'aide personne à décider d'un achat.
    Remplacé par un scrape **à la demande** (`pricing/active_listings_source.py`,
    appelé depuis `shared/verdict.py::compute_extended_signals`) -- au
    moment où une carte est consultée, si elle n'a pas déjà été scrapée
    aujourd'hui (cache = 1 ligne/jour calendaire, `pricing/repository.py::fetch_active_listing_count_for_date`),
    1 requête eBay part en direct (~0.3-1s de latence en plus sur ce
    `/verdict` précis), le résultat est mis en cache pour le reste de la
    journée. `card.code` requis (même garde "ne jamais deviner" que le
    reste du matching -- sans code la recherche eBay part trop générique,
    jusqu'à 143k "annonces actives" observées pour un nom seul). Le scellé,
    lui, reste sur son batch hebdomadaire existant (catalogue assez petit
    pour tenir en un seul run, `ingestion/sources/ebay.py::run_ebay_listings_sync`,
    inchangé).
  - **'graded' n'est PAS une note précise (psa7..psa10)** -- vérifié via
    l'API Taxonomy eBay (`get_item_aspects_for_category` sur 183454, CCG
    Individual Cards) : aucun aspect "Grade"/"Grading Company" n'existe
    pour cette catégorie, eBay ne permet de filtrer QUE sur le conditionId
    binaire Ungraded/Graded. C'est donc un comptage toutes notes confondues
    (PSA7 à PSA10 mélangées) -- `shared/verdict.py::compute_extended_signals`
    mappe tout grade PSA précis vers ce bucket `'graded'` unique avant la
    lecture, et le panneau annote le chiffre "(toutes notes)" dès que
    `grade !== 'ungraded'` -- jamais présenté comme "N PSA10"
    (`ne jamais deviner`, §01).

- **ROI gradation + calculateur d'arbitrage (§07)**, 100% côté client comme
  décrit dans le handoff -- aucun des deux calculs ne vit côté serveur, pour
  rester recalculable en live quand l'utilisateur change ses hypothèses.
  - **ROI gradation** : `extension/lib/gradingRoi.js` est un port JS 1:1 de
    `web/lib/gradingRoi.ts` (mêmes formules/constantes -- distribution de
    grades par cascade carte → set+rareté → set → tcg, EV nette, coût de
    soumission PSA par palier, ROI). Les ingrédients bruts (dernier prix
    connu par grade + comptage de ventes gradées aux 4 niveaux) viennent
    d'un nouveau champ `grading_roi_inputs` sur `/verdict`
    (`pricing/grading_roi.py` + `pricing/repository.py::fetch_grading_roi_inputs`,
    lit la table `grading_roi_inputs` déjà matérialisée côté site par
    `index/grading_roi_inputs.py` -- rien de nouveau à calculer côté
    Postgres). Palier PSA/frais divers/risque sous-note/frais revente sont
    éditables dans le panneau, recalcul immédiat (`input`/`change`) sans
    jamais rappeler `/verdict`. `None` (carte pas encore repassée dans son
    palier `--tier`, cf. docstring `pricing/repository.py`) affiche un
    message plutôt qu'un ROI inventé -- jamais affiché pour le scellé (pas
    de notion de gradation).
  - **Calculateur d'arbitrage** : aucune donnée serveur en plus -- réutilise
    `reference_price` déjà renvoyé par `/verdict` (même prix que le verdict
    ponctuel, cf. §07). Achat/livraison/douane saisis par l'utilisateur,
    bénéfice recalculé en live.
  - Testé via le même harness jsdom ponctuel que le panneau v2 (flux de
    messages réel `CARDQUANT_GET_SESSION`/`CARDQUANT_GET_VERDICT` stubé,
    pas les fonctions de rendu isolées) : cas avec/sans
    `grading_roi_inputs`, recalcul live sur changement de palier ET de
    frais, aucune erreur JS, aucun fragment "undefined"/"NaN".

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

- **Liens de double-vérification manuelle (demande utilisateur, 2026-08-22)** :
  deux boutons en bas de la fiche carte pour recouper le verdict ailleurs.
  - **PriceCharting** : lien vers la VRAIE page produit exacte -- pas une
    recherche. PriceCharting est en plus la source même du prix de
    référence (`shared/verdict.py::compute_verdict_for_card`), donc le plus
    pertinent à vérifier. L'URL était déjà résolue en interne par le
    scrape/matching serveur (`pricing/sources/pricecharting_source.py::_find_row_for_card`)
    mais jamais exposée -- ajout d'une colonne `prices.url` (première
    `ALTER TABLE` de `db/schema.sql`, la table existait déjà en prod donc
    `CREATE TABLE IF NOT EXISTS` seul n'aurait rien ajouté) + un champ
    `url` sur `PriceQuote`/`SourcePriceOut`, peuplés sans requête
    supplémentaire (même scrape que celui qui sert déjà le prix). Absent
    (pas de bouton) si PriceCharting n'a pas matché cette carte -- jamais
    un lien de recherche de repli qui laisserait croire à un lien exact.
  - **Cardmarket** : pas d'ID exploitable en base (`items.cardmarket_id`
    existe mais n'est jamais rempli par apitcg.com pour ce catalogue) --
    lien de RECHERCHE plutôt qu'un lien produit deviné (même principe "ne
    jamais deviner", §01). Recherche par `card.code` (ex. "OP13-037"),
    bien plus précis que le nom seul -- vérifié en conditions réelles :
    5 résultats, tous la bonne carte, contre une dilution sur toute carte
    contenant les mêmes mots avec le nom seul. Repli sur le nom pour le
    scellé (pas de `code`).
  - Testé via un harness jsdom ponctuel : présence conditionnelle correcte
    selon `sources_compared[].url` (PriceCharting) et présence système
    (Cardmarket, toujours calculable), URLs exactes vérifiées.

- **Set + année (demande utilisateur, 2026-08-23)** : le badge de set,
  auparavant un simple préfixe de code ("OP13", tiré de `card.code.split("-")[0]`),
  montre maintenant un vrai nom de set lisible + son année ("One Piece ·
  Wings Of The Captain (2024)") -- `set_name`/`set_release_year`, nouveaux
  champs sur `CardCandidateOut` (carte confirmée ET picker de
  désambiguïsation). `set_name` dérivé du `set_code` (aucun nom de set
  lisible n'est stocké ailleurs, cf. `pricing/repository.py::set_label_from_code`,
  réimplantation volontairement séparée de l'équivalent JP-only dans
  `ingestion/sources/pricecharting.py` -- module volumineux/fragile, pas
  une dépendance à ajouter pour 4 lignes). `set_release_year` vient de
  `items.release_date`, structurellement absente côté JP -- mais One Piece
  JP réutilise le MÊME `set_code` que son homonyme EN (vérifié 100% de
  correspondance), donc `fetch_set_release_year` retrouve déjà l'année EN
  pour une carte JP sans repli explicite à coder.
  - **Pas de badge "Promo"/"Normal" séparé** -- essayé puis écarté : la
    rareté seule (`rarity == 'Promo'`) ne suffit pas à trancher de façon
    fiable, vérifié en base (des cartes de sets clairement promo/
    événementiels comme "... Pre-Release Cards"/"... Release Event Cards"
    gardent leur rareté normale, ex. "Secret Rare" -- inventer un
    classificateur binaire aurait mal classé ces cas). La rareté brute et
    le nom du set (souvent explicite par lui-même) sont affichés tels
    quels, jamais une classification devinée à la place de l'utilisateur.
  - Testé en conditions réelles contre la base (pas juste des mocks) :
    label + année corrects sur un set classique, un set promo (année
    absente, gérée), et le repli JP -> EN validé sur une vraie carte JP
    sans `release_date` propre. Harness jsdom : 3 cas (complet, promo sans
    année, aucune métadonnée) -- badges corrects, aucune erreur JS.

- **Drapeau langue dans le picker de désambiguïsation (demande
  utilisateur, 2026-08-23)** : deux candidats identiques par ailleurs (même
  carte, même rareté, EN vs JP) sont fréquents -- sans repère, impossible
  de savoir lequel est lequel en scannant vite la liste. `renderCandidate`
  préfixe maintenant le nom du drapeau langue (`LANGUAGE_FLAGS`, déjà
  utilisé ailleurs dans ce fichier pour la même raison). Testé via un
  harness jsdom : deux candidats identiques hors langue rendent bien deux
  drapeaux distincts (🇬🇧/🇯🇵).

Pas fait (hors scope de ce scaffold) :
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
