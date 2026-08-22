# Politique de confidentialité — CardQuant

**Dernière mise à jour : 22 août 2026**

Ce document couvre l'extension navigateur CardQuant et le site associé
(tcgindex.vercel.app), ci-après « CardQuant » ou « le service ». CardQuant
est un outil d'analyse de prix pour cartes à collectionner (One Piece TCG à
ce jour), consulté en direct sur des annonces eBay.

> ⚠️ **À compléter avant publication** : remplacer `[EMAIL DE CONTACT]`
> ci-dessous par une adresse réelle avant de soumettre au Chrome Web Store
> — Google exige un contact valide et le texte ne peut pas rester avec un
> champ vide.

## 1. Résumé

- CardQuant lit le contenu **des pages d'annonce eBay que vous consultez**
  (titre, prix, photo du produit) pour vous donner un verdict de prix — il
  ne lit jamais le contenu d'un autre site.
- Un compte (connexion Google) est requis pour utiliser l'extension.
- Aucune vente ni partage de vos données à des fins publicitaires ou
  commerciales. Aucune injection de publicité ou de lien affilié dans les
  pages que vous visitez.
- Les seuls tiers impliqués le sont pour faire fonctionner le service
  (authentification, hébergement, reconnaissance de texte sur image, taux
  de change) — jamais pour du tracking ou de la revente de données.

## 2. Données collectées

### 2.1 Compte utilisateur

La connexion se fait par **Google Sign-In** via Firebase Authentication,
exclusivement sur le site (jamais dans l'extension elle-même). Nous
recevons et stockons :
- votre identifiant Firebase (uid), votre adresse email et le nom affiché
  associés à votre compte Google ;
- si vous personnalisez votre profil sur le site : un avatar que vous
  choisissez d'uploader (stocké séparément de la photo de votre compte
  Google).

CardQuant ne voit et ne stocke jamais votre mot de passe Google —
l'authentification est entièrement déléguée à Firebase/Google.

### 2.2 Contenu des pages d'annonce eBay

L'extension s'exécute uniquement sur les pages d'annonce individuelle des
domaines eBay suivants : ebay.com, .fr, .de, .co.uk, .it, .es, .ca,
.com.au, .at, .ch, .ie, .nl, .be, .pl (URLs de la forme
`https://www.ebay.<domaine>/itm/*`). Sur ces pages, et uniquement
celles-ci, l'extension lit :
- le titre de l'annonce, le prix affiché et sa devise ;
- si vous cliquez « Essayer avec la photo de l'annonce » (utilisé quand le
  titre seul ne suffit pas à identifier la carte) : l'URL de la photo
  principale du produit telle qu'affichée sur l'annonce — jamais une photo
  personnelle, votre webcam ou un fichier de votre appareil.

Ce contenu est envoyé à notre service `pricing_api` pour identifier la
carte et calculer un verdict de prix. La photo, quand elle est utilisée,
est transmise à l'API Google Cloud Vision (reconnaissance de texte
uniquement) pour en extraire le texte imprimé.

L'extension ne lit jamais le contenu d'un site autre qu'eBay, et jamais
plus que le titre/prix/photo décrits ci-dessus sur une page eBay (pas vos
messages, votre historique d'achat, vos informations de paiement, etc.).

### 2.3 Historique de recherche

Chaque carte identifiée avec succès est associée à votre compte
(`item_id` + date/heure) pour alimenter la fonctionnalité « dernières
recherches » de l'extension et du site.

### 2.4 Session locale

Un jeton de session (Firebase ID token + refresh token, adresse email, nom
affiché) est stocké localement dans votre navigateur
(`chrome.storage.local`) pour éviter de vous reconnecter à chaque page.
Cette donnée reste sur votre appareil, n'est jamais synchronisée vers nos
serveurs au-delà du jeton nécessaire à chaque appel API, et est effacée
quand vous vous déconnectez.

### 2.5 Ce que nous ne collectons pas

Pas de mot de passe, pas d'information de paiement ou bancaire, pas
d'historique de navigation en dehors des pages d'annonce eBay où
l'extension est active, pas de données issues d'autres onglets ou sites,
pas de cookies tiers de tracking, pas de vente de données à des tiers.

## 3. Utilisation des données

Les données ci-dessus servent exclusivement à :
- identifier la carte présente sur l'annonce consultée ;
- calculer et afficher le verdict de prix, les statistiques de ventes, la
  liquidité, le ROI de gradation, le calculateur d'arbitrage ;
- faire fonctionner votre compte (connexion, historique de recherche,
  watchlist si vous en créez une sur le site) ;
- assurer la sécurité et le bon fonctionnement du service (ex. limiter les
  abus des API tierces facturées à l'usage).

Aucune de ces données n'est utilisée à des fins publicitaires, de profilage
commercial, ou revendue à un tiers.

## 4. Partage avec des tiers

CardQuant s'appuie sur les services tiers suivants, chacun pour une
fonction précise et documentée — jamais pour partager vos données à
d'autres fins :

| Service | Rôle | Donnée transmise |
|---|---|---|
| Firebase Authentication (Google) | Connexion Google Sign-In | Identifiant de compte Google |
| Google Cloud Vision | Reconnaissance de texte sur la photo de l'annonce (seulement si vous déclenchez ce mode) | URL de la photo produit eBay |
| Google Cloud (Cloud Run, Cloud SQL) | Hébergement du backend et de la base de données | Données décrites en §2 |
| api.frankfurter.dev | Taux de change (conversion EUR/GBP → USD) | Aucune donnée personnelle — montant et devises uniquement |

Nous ne partageons vos données avec aucun autre tiers, et ne les vendons
jamais.

## 5. Conservation des données

Vos données de compte et votre historique de recherche sont conservés tant
que votre compte existe. La session locale (§2.4) est effacée dès que vous
vous déconnectez ou désinstallez l'extension.

## 6. Vos droits

Vous pouvez à tout moment :
- vous déconnecter depuis le panneau de l'extension (efface immédiatement
  la session locale) ;
- demander l'accès, la correction ou la suppression de vos données de
  compte en nous contactant à **[EMAIL DE CONTACT]**. Nous n'avons pas
  encore de suppression de compte en libre-service dans l'interface — une
  demande par email est traitée manuellement.

## 7. Sécurité

Les échanges avec nos serveurs se font en HTTPS. L'accès à notre base de
données est protégé par des identifiants dédiés et n'est jamais exposé
publiquement. Nous ne stockons aucun mot de passe (authentification
déléguée à Firebase/Google).

## 8. Permissions du navigateur

L'extension ne demande que les permissions strictement nécessaires à son
fonctionnement : `storage` (session locale, §2.4) et l'accès réseau limité
aux domaines eBay listés en §2.2, à notre API de verdict, aux services
Firebase d'authentification et au service de taux de change — jamais un
accès générique à tous les sites que vous visitez.

## 9. Modifications de cette politique

Cette politique peut être mise à jour ; la date en haut de page reflète la
dernière révision. Les changements substantiels seront signalés dans
l'extension ou sur le site.

## 10. Contact

Pour toute question sur cette politique ou vos données : **[EMAIL DE CONTACT]**.
