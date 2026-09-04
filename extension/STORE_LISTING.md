# Fiche Chrome Web Store — CardQuant

Texte prêt à coller dans le Developer Dashboard (chromewebstore.google.com/developer/dashboard). Rien d'inventé : périmètre exact du scaffold actuel (cf. `README.md`) — eBay uniquement (14 domaines pays), Pokémon + One Piece EN/JP, compte requis. Pas de chiffres d'installation/notation : l'extension n'est pas encore publiée.

## Nom (max 45 caractères)

```
CardQuant
```

## Description courte / résumé (max 132 caractères)

```
Le vrai prix des cartes Pokémon et One Piece sur eBay — verdict instantané, ROI gradation, arbitrage EN/JP.
```
(109 caractères)

## Catégorie

**Shopping** (le classement le plus proche : l'extension agit au moment de l'achat, sur une page marchande — pas un outil de productivité générique).

## Description détaillée

```
CardQuant affiche un verdict de prix en direct sur les annonces eBay de cartes à collectionner Pokémon et One Piece (EN/JP, brutes et gradées) — sans changer d'onglet.

COMMENT ÇA MARCHE
Ouvre une annonce eBay, clique sur l'icône CardQuant : le panneau identifie la carte (titre, ou photo si le titre ne suffit pas) et compare le prix affiché aux ventes réelles récentes et au prix catalogue de référence.

CE QUE LE PANNEAU MONTRE
— Verdict ponctuel : ce prix précis vs. le marché (bonne affaire / prix normal / survendu)
— Médiane des ventes récentes, ventes actives en cours
— Population de cartes gradées PSA connue pour cette carte
— Calculateur de ROI de gradation (paramètres éditables : palier PSA, frais, risque de sous-note)
— Comparateur de prix EN ↔ JP
— Divergence prix/volume (30 derniers jours vs. période précédente)
— Positionnement du prix dans son set
— Lien de double-vérification vers la fiche PriceCharting exacte

COMPTE REQUIS
La connexion se fait sur cardquant.io (Google Sign-In), pas dans l'extension — une fois connecté sur le site, la session est automatiquement reconnue par l'extension. Alertes, historique et watchlist suivent le même compte, y compris sur le terminal complet du site.

COUVERTURE ACTUELLE
— Marketplace : eBay (.com, .fr, .de, .co.uk, .it, .es, .ca, .com.au, .at, .ch, .ie, .nl, .be, .pl)
— Jeux : Pokémon et One Piece, anglais et japonais, brut et gradé PSA/CGC
— Prix indicatifs, agrégés depuis des sources tierces (PriceCharting, ventes eBay closes) — pas un conseil en investissement.

CONFIDENTIALITÉ
Lecture de la page active uniquement, sur les pages d'annonce eBay listées ci-dessus — jamais un autre site. Pas de suivi publicitaire, pas de revente de données. Politique de confidentialité complète : cardquant.io/privacy
```

## Icône fiche Store (128px) et captures d'écran

Voir `icons/icon128.png` (généré depuis la piste "1B · Monogramme CQ" du zip design, cf. mémoire projet "cardquant-rebrand").

Captures d'écran : faites le 2026-09-04, `store-screenshots/01-panneau-verdict.jpg` → `03-arbitrage-langue.jpg` (1216×948) — vraie annonce eBay (PSA 10 Monkey D. Luffy OP02-062, One Piece Card Game), extension chargée en mode développeur, compte de test connecté. Montrent le panneau réel : identité de carte + verdict ponctuel + score d'opportunité + analyse de prix + population par note (01), liquidité/ROI gradation/positionnement dans le set (02), arbitrage inter-langue EN/JP déplié (03). Le Chrome Web Store en exige au moins 1 (1280×800 ou 640×400 recommandé par Google — celles-ci sont 1216×948, à re-exporter au bon ratio si le dashboard les refuse).

## Questionnaire "Privacy practices" du dashboard

Réponses à cocher/coller, dérivées de `PRIVACY_POLICY.md` (aussi publiée sur `/privacy`) :
- **Cette extension collecte-t-elle des données utilisateur ?** Oui.
- **Types de données** : identité (email de compte via Google Sign-In), activité sur le web (titre/prix/photo de l'annonce eBay consultée, uniquement sur les domaines eBay listés).
- **Ces données sont-elles vendues à des tiers ?** Non.
- **Ces données sont-elles utilisées à des fins non liées à la fonctionnalité principale de l'extension ?** Non.
- **Ces données sont-elles utilisées pour déterminer la solvabilité (creditworthiness) ou à des fins de prêt ?** Non.
- **URL de la politique de confidentialité** : https://cardquant.io/privacy (à ajuster si le domaine change, cf. `.env`/déploiement).
- **Justification des permissions demandées** :
  - `storage` : mémorise la session (jeton Firebase) localement pour éviter une reconnexion à chaque page.
  - `host_permissions` (domaines eBay) : lire titre/prix/photo de l'annonce active pour identifier la carte.
  - `host_permissions` (pricing_api, Firebase, frankfurter.dev) : appels réseau vers notre propre backend et les services d'authentification/taux de change — jamais vers un tiers publicitaire.
