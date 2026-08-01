"""Source de prix (scraping) : PriceCharting (pricecharting.com).

Contrairement à API TCG / JustTCG, PriceCharting n'a pas d'API publique : on
scrape le HTML de leurs pages de set ("console"), qui contiennent en une seule
requête tous les produits du set (singles ET scellé) avec leur prix courant.
`robots.txt` autorise `/game/` et `/console/` (vérifié manuellement le
2026-07-29) ; `requests` + un User-Agent standard suffit, pas de blocage
observé sur une dizaine de pages testées.

Réconciliation avec `items` : PriceCharting n'expose pas d'ID partagé fiable
avec nos items (le TCGPlayer ID n'existe que sur les pages carte individuelle,
et seulement pour le catalogue anglais — vide pour le One Piece japonais). On
matche donc, au sein d'un même `set_code` :
- les singles par numéro de carte, extrait du titre PriceCharting (ex.
  "Charizard ex #199" -> 199) et comparé à `items.code` (ex. '199/165').
- le scellé par nom normalisé (le titre PriceCharting est en général un
  sous-ensemble du nom API TCG, ex. "Elite Trainer Box" vs
  "151 Elite Trainer Box").

Colonne de prix : `used_price` (libellée "Ungraded" dans le HTML) est la plus
systématiquement remplie, pour les singles ET le scellé — `new_price`
("factory sealed") est souvent vide ou donne des valeurs incohérentes pour le
scellé TCG (probablement parce que la plupart des ventes eBay de boîtes
scellées sont classées "Used" côté source). Confirmé en conditions réelles,
décision utilisateur du 2026-07-29 (cf. mémoire projet).

Cette source nécessite un mapping explicite entre nos `set_code` (API TCG) et
les slugs `/console/` PriceCharting (les deux catalogues ne nomment pas leurs
sets pareil) : voir `PRICECHARTING_SET_SLUGS` ci-dessous, à enrichir set par
set. Pas de découverte automatique pour l'instant (217 sets Pokémon à
recouper un jour, hors scope de ce premier passage).
"""
import re
import time
import unicodedata
import zlib
from datetime import date, datetime

import requests
from bs4 import BeautifulSoup
from psycopg2.extras import execute_values

from shared.db import get_connection

BASE_URL = "https://www.pricecharting.com"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
}

# Pas de système de quota documenté ici (contrairement à JustTCG), mais on
# reste poli : une pause entre deux pages de set.
MIN_SECONDS_BETWEEN_REQUESTS = 2.0

# our set_code (items.set_code, cf. apitcg.py) -> slug de la page /console/
# correspondante sur PriceCharting.
#
# Généré le 2026-07-29 par un matching automatique (score de Dice sur les
# tokens du nom/slug, cf. scratchpad build_set_mapping.py) entre les 217 sets
# API TCG et les ~740 slugs /console/pokemon-* trouvés dans le sitemap.xml de
# PriceCharting, puis vérifié à la main pour les cas ambigus (plusieurs sets
# pointant vers le même slug -> on ne garde que le meilleur, le reste retombe
# en "non mappé"). ~150/217 sets couverts ; le reste (surtout des buckets
# "Promos"/divers sans vrai équivalent, cf. mémoire projet sur les
# "junk sets" API TCG) nécessiterait une revue manuelle au cas par cas.
PRICECHARTING_SET_SLUGS = {
    'pokemon-aquapolis': 'pokemon-aquapolis',
    'pokemon-arceus': 'pokemon-arceus',
    'pokemon-base-set': 'pokemon-base-set',
    'pokemon-base-set-2': 'pokemon-base-set-2',
    'pokemon-battle-academy': 'pokemon-2020-battle-academy',
    'pokemon-battle-academy-2022': 'pokemon-2022-battle-academy',
    'pokemon-battle-academy-2024': 'pokemon-2024-battle-academy',
    'pokemon-black-and-white': 'pokemon-black-&-white',
    'pokemon-boundaries-crossed': 'pokemon-boundaries-crossed',
    'pokemon-burger-king-promos': 'pokemon-burger-king',
    'pokemon-call-of-legends': 'pokemon-call-of-legends',
    'pokemon-celebrations': 'pokemon-celebrations',
    'pokemon-champions-path': "pokemon-champion's-path",
    'pokemon-crown-zenith': 'pokemon-crown-zenith',
    'pokemon-crystal-guardians': 'pokemon-crystal-guardians',
    'pokemon-dark-explorers': 'pokemon-dark-explorers',
    'pokemon-delta-species': 'pokemon-delta-species',
    'pokemon-deoxys': 'pokemon-deoxys',
    'pokemon-detective-pikachu': 'pokemon-detective-pikachu',
    'pokemon-diamond-and-pearl': 'pokemon-diamond-&-pearl',
    'pokemon-double-crisis': 'pokemon-double-crisis',
    'pokemon-dragon': 'pokemon-dragon',
    'pokemon-dragon-frontiers': 'pokemon-dragon-frontiers',
    'pokemon-dragon-majesty': 'pokemon-dragon-majesty',
    'pokemon-dragon-vault': 'pokemon-dragon-vault',
    'pokemon-dragons-exalted': 'pokemon-dragons-exalted',
    'pokemon-emerald': 'pokemon-emerald',
    'pokemon-emerging-powers': 'pokemon-emerging-powers',
    'pokemon-ex-battle-stadium': 'pokemon-ex-battle-stadium',
    'pokemon-expedition': 'pokemon-expedition',
    'pokemon-fossil': 'pokemon-fossil',
    'pokemon-generations': 'pokemon-generations',
    'pokemon-great-encounters': 'pokemon-great-encounters',
    'pokemon-gym-challenge': 'pokemon-gym-challenge',
    'pokemon-gym-heroes': 'pokemon-gym-heroes',
    'pokemon-heartgold-soulsilver': 'pokemon-heartgold-&-soulsilver',
    'pokemon-hidden-fates': 'pokemon-hidden-fates',
    'pokemon-hidden-legends': 'pokemon-hidden-legends',
    'pokemon-holon-phantoms': 'pokemon-holon-phantoms',
    'pokemon-jungle': 'pokemon-jungle',
    'pokemon-kalos-starter-set': 'pokemon-kalos-starter',
    'pokemon-legend-maker': 'pokemon-legend-maker',
    'pokemon-legendary-collection': 'pokemon-legendary-collection',
    'pokemon-legendary-treasures': 'pokemon-legendary-treasures',
    'pokemon-legends-awakened': 'pokemon-legends-awakened',
    'pokemon-majestic-dawn': 'pokemon-majestic-dawn',
    'pokemon-mcdonalds-promos-2011': 'pokemon-mcdonalds-2011',
    'pokemon-mcdonalds-promos-2012': 'pokemon-mcdonalds-2012',
    'pokemon-mcdonalds-promos-2014': 'pokemon-mcdonalds-2014',
    'pokemon-mcdonalds-promos-2015': 'pokemon-mcdonalds-2015',
    'pokemon-mcdonalds-promos-2016': 'pokemon-mcdonalds-2016',
    'pokemon-mcdonalds-promos-2017': 'pokemon-mcdonalds-2017',
    'pokemon-mcdonalds-promos-2018': 'pokemon-mcdonalds-2018',
    'pokemon-mcdonalds-promos-2019': 'pokemon-mcdonalds-2019',
    'pokemon-mcdonalds-promos-2022': 'pokemon-mcdonalds-2022',
    'pokemon-mcdonalds-promos-2023': 'pokemon-mcdonalds-2023',
    'pokemon-mcdonalds-promos-2024': 'pokemon-mcdonalds-2024',
    'pokemon-me-ascended-heroes': 'pokemon-ascended-heroes',
    'pokemon-me01-mega-evolution': 'pokemon-mega-evolution',
    'pokemon-me02-phantasmal-flames': 'pokemon-phantasmal-flames',
    'pokemon-me03-perfect-order': 'pokemon-perfect-order',
    'pokemon-me04-chaos-rising': 'pokemon-chaos-rising',
    'pokemon-me05-pitch-black': 'pokemon-pitch-black',
    'pokemon-my-first-battle': 'pokemon-my-first-battle',
    'pokemon-mysterious-treasures': 'pokemon-mysterious-treasures',
    'pokemon-neo-destiny': 'pokemon-neo-destiny',
    'pokemon-neo-discovery': 'pokemon-neo-discovery',
    'pokemon-neo-genesis': 'pokemon-neo-genesis',
    'pokemon-neo-revelation': 'pokemon-neo-revelation',
    'pokemon-next-destinies': 'pokemon-next-destinies',
    'pokemon-noble-victories': 'pokemon-noble-victories',
    'pokemon-plasma-blast': 'pokemon-plasma-blast',
    'pokemon-plasma-freeze': 'pokemon-plasma-freeze',
    'pokemon-plasma-storm': 'pokemon-plasma-storm',
    'pokemon-platinum': 'pokemon-platinum',
    'pokemon-pop-series-1': 'pokemon-pop-series-1',
    'pokemon-pop-series-2': 'pokemon-pop-series-2',
    'pokemon-pop-series-3': 'pokemon-pop-series-3',
    'pokemon-pop-series-4': 'pokemon-pop-series-4',
    'pokemon-pop-series-5': 'pokemon-pop-series-5',
    'pokemon-pop-series-6': 'pokemon-pop-series-6',
    'pokemon-pop-series-7': 'pokemon-pop-series-7',
    'pokemon-pop-series-8': 'pokemon-pop-series-8',
    'pokemon-pop-series-9': 'pokemon-pop-series-9',
    'pokemon-power-keepers': 'pokemon-power-keepers',
    'pokemon-rising-rivals': 'pokemon-rising-rivals',
    'pokemon-ruby-and-sapphire': 'pokemon-ruby-&-sapphire',
    'pokemon-rumble': 'pokemon-rumble',
    'pokemon-sandstorm': 'pokemon-sandstorm',
    'pokemon-secret-wonders': 'pokemon-secret-wonders',
    'pokemon-shining-fates': 'pokemon-shining-fates',
    'pokemon-shining-legends': 'pokemon-shining-legends',
    'pokemon-skyridge': 'pokemon-skyridge',
    'pokemon-sm-burning-shadows': 'pokemon-burning-shadows',
    'pokemon-sm-celestial-storm': 'pokemon-celestial-storm',
    'pokemon-sm-cosmic-eclipse': 'pokemon-cosmic-eclipse',
    'pokemon-sm-crimson-invasion': 'pokemon-crimson-invasion',
    'pokemon-sm-forbidden-light': 'pokemon-forbidden-light',
    'pokemon-sm-guardians-rising': 'pokemon-guardians-rising',
    'pokemon-sm-lost-thunder': 'pokemon-lost-thunder',
    'pokemon-sm-team-up': 'pokemon-team-up',
    'pokemon-sm-ultra-prism': 'pokemon-ultra-prism',
    'pokemon-sm-unbroken-bonds': 'pokemon-unbroken-bonds',
    'pokemon-sm-unified-minds': 'pokemon-unified-minds',
    'pokemon-southern-islands': 'pokemon-southern-islands',
    'pokemon-stormfront': 'pokemon-stormfront',
    'pokemon-supreme-victors': 'pokemon-supreme-victors',
    'pokemon-sv-black-bolt': 'pokemon-black-bolt',
    'pokemon-sv-paldean-fates': 'pokemon-paldean-fates',
    'pokemon-sv-prismatic-evolutions': 'pokemon-prismatic-evolutions',
    'pokemon-sv-scarlet-violet-151': 'pokemon-scarlet-&-violet-151',
    'pokemon-sv-shrouded-fable': 'pokemon-shrouded-fable',
    'pokemon-sv-white-flare': 'pokemon-white-flare',
    'pokemon-sv02-paldea-evolved': 'pokemon-paldea-evolved',
    'pokemon-sv03-obsidian-flames': 'pokemon-obsidian-flames',
    'pokemon-sv04-paradox-rift': 'pokemon-paradox-rift',
    'pokemon-sv05-temporal-forces': 'pokemon-temporal-forces',
    'pokemon-sv06-twilight-masquerade': 'pokemon-twilight-masquerade',
    'pokemon-sv07-stellar-crown': 'pokemon-stellar-crown',
    'pokemon-sv08-surging-sparks': 'pokemon-surging-sparks',
    'pokemon-sv09-journey-together': 'pokemon-journey-together',
    'pokemon-sv10-destined-rivals': 'pokemon-destined-rivals',
    'pokemon-sve-scarlet-violet-energies': 'pokemon-scarlet-&-violet',
    'pokemon-swsh02-rebel-clash': 'pokemon-rebel-clash',
    'pokemon-swsh03-darkness-ablaze': 'pokemon-darkness-ablaze',
    'pokemon-swsh04-vivid-voltage': 'pokemon-vivid-voltage',
    'pokemon-swsh05-battle-styles': 'pokemon-battle-styles',
    'pokemon-swsh06-chilling-reign': 'pokemon-chilling-reign',
    'pokemon-swsh07-evolving-skies': 'pokemon-evolving-skies',
    'pokemon-swsh08-fusion-strike': 'pokemon-fusion-strike',
    'pokemon-swsh09-brilliant-stars': 'pokemon-brilliant-stars',
    'pokemon-swsh10-astral-radiance': 'pokemon-astral-radiance',
    'pokemon-swsh11-lost-origin': 'pokemon-lost-origin',
    'pokemon-swsh12-silver-tempest': 'pokemon-silver-tempest',
    'pokemon-team-magma-vs-team-aqua': 'pokemon-team-magma-&-team-aqua',
    'pokemon-team-rocket': 'pokemon-team-rocket',
    'pokemon-team-rocket-returns': 'pokemon-team-rocket-returns',
    'pokemon-trick-or-trade-booster-bundle-2023': 'pokemon-trick-or-trade-2023',
    'pokemon-trick-or-trade-booster-bundle-2024': 'pokemon-trick-or-trade-2024',
    'pokemon-triumphant': 'pokemon-triumphant',
    'pokemon-undaunted': 'pokemon-undaunted',
    'pokemon-unleashed': 'pokemon-unleashed',
    'pokemon-unseen-forces': 'pokemon-unseen-forces',
    'pokemon-xy-ancient-origins': 'pokemon-ancient-origins',
    'pokemon-xy-fates-collide': 'pokemon-fates-collide',
    'pokemon-xy-furious-fists': 'pokemon-furious-fists',
    'pokemon-xy-phantom-forces': 'pokemon-phantom-forces',
    'pokemon-xy-primal-clash': 'pokemon-primal-clash',
    'pokemon-xy-roaring-skies': 'pokemon-roaring-skies',
    'pokemon-xy-steam-siege': 'pokemon-steam-siege',

    # One Piece — généré le 2026-07-29 par le même matching automatique contre
    # les 65 slugs /console/one-piece-* (hors consoles "japanese-", API TCG ne
    # référence que le catalogue anglais pour ce TCG), complété à la main pour
    # les variantes promo/pre-release qui pointent clairement vers leur set
    # parent (safe : le matching par numéro+set_code ne peut pas mal assigner
    # un prix même si le slug parent n'est pas un match parfait).
    'one-piece-500-years-in-the-future': 'one-piece-500-years-in-the-future',
    'one-piece-500-years-in-the-future-pre-release-cards': 'one-piece-500-years-in-the-future',
    'one-piece-a-fist-of-divine-speed': 'one-piece-fist-of-divine-speed',
    'one-piece-a-fist-of-divine-speed-release-event-cards': 'one-piece-fist-of-divine-speed',
    'one-piece-adventure-on-kamis-island': "one-piece-adventure-on-kami's-island",
    'one-piece-adventure-on-kamis-island-release-event-cards': "one-piece-adventure-on-kami's-island",
    'one-piece-awakening-of-the-new-era': 'one-piece-awakening-of-the-new-era',
    'one-piece-awakening-of-the-new-era-1st-anniversary-tournament-cards': 'one-piece-awakening-of-the-new-era',
    'one-piece-carrying-on-his-will': 'one-piece-carrying-on-his-will',
    'one-piece-carrying-on-his-will-3rd-anniversary-tournament-cards': 'one-piece-carrying-on-his-will',
    'one-piece-emperors-in-the-new-world': 'one-piece-emperors-in-the-new-world',
    'one-piece-emperors-in-the-new-world-2nd-anniversary-tournament-cards': 'one-piece-emperors-in-the-new-world',
    'one-piece-extra-booster-anime-25th-collection': 'one-piece-extra-booster-anime-25th-collection',
    'one-piece-extra-booster-memorial-collection': 'one-piece-extra-booster-memorial-collection',
    'one-piece-extra-booster-one-piece-heroines-edition': 'one-piece-extra-booster-heroines-edition',
    'one-piece-kingdoms-of-intrigue': 'one-piece-kingdoms-of-intrigue',
    'one-piece-kingdoms-of-intrigue-pre-release-cards': 'one-piece-kingdoms-of-intrigue',
    'one-piece-learn-together-deck-set': 'one-piece-learn-together-deck-set',
    'one-piece-legacy-of-the-master': 'one-piece-legacy-of-the-master',
    'one-piece-legacy-of-the-master-release-event-cards': 'one-piece-legacy-of-the-master',
    'one-piece-paramount-war': 'one-piece-paramount-war',
    'one-piece-paramount-war-pre-release-cards': 'one-piece-paramount-war',
    'one-piece-pillars-of-strength': 'one-piece-pillars-of-strength',
    'one-piece-pillars-of-strength-pre-release-cards': 'one-piece-pillars-of-strength',
    'one-piece-premium-booster-the-best-': 'one-piece-premium-booster',
    'one-piece-premium-booster-the-best-vol-2': 'one-piece-premium-booster-2',
    'one-piece-romance-dawn': 'one-piece-romance-dawn',
    'one-piece-royal-blood': 'one-piece-royal-blood',
    'one-piece-royal-blood-release-event-cards': 'one-piece-royal-blood',
    'one-piece-starter-deck-1-straw-hat-crew': 'one-piece-starter-deck-1-straw-hat-crew',
    'one-piece-starter-deck-11-uta': 'one-piece-starter-deck-11-uta',
    'one-piece-starter-deck-12-zoro-and-sanji': 'one-piece-starter-deck-12',
    'one-piece-starter-deck-14-3d2y': 'one-piece-starter-deck-14-3d2y',
    'one-piece-starter-deck-15-red-edwardnewgate': 'one-piece-starter-deck-15-edward-newgate',
    'one-piece-starter-deck-16-green-uta': 'one-piece-starter-deck-16-uta',
    'one-piece-starter-deck-17-blue-donquixote-doflamingo': 'one-piece-starter-deck-17-donquixote-donflamingo',
    'one-piece-starter-deck-18-purple-monkeydluffy': 'one-piece-starter-deck-18-monkeydluffy',
    'one-piece-starter-deck-19-black-smoker': 'one-piece-starter-deck-19-smoker',
    'one-piece-starter-deck-2-worst-generation': 'one-piece-starter-deck-2-worst-generation',
    'one-piece-starter-deck-20-yellow-charlotte-katakuri': 'one-piece-starter-deck-20-charlotte-katakuri',
    'one-piece-starter-deck-22-ace-newgate': 'one-piece-starter-deck-22-ace-&-newgate',
    'one-piece-starter-deck-23-red-shanks': 'one-piece-starter-deck-23-red-shanks',
    'one-piece-starter-deck-24-green-jewelry-bonney': 'one-piece-starter-deck-24-green-jewelry-bonney',
    'one-piece-starter-deck-25-blue-buggy': 'one-piece-starter-deck-25-blue-buggy',
    'one-piece-starter-deck-26-purpleblack-monkeydluffy': 'one-piece-starter-deck-26-purple-monkeydluffy',
    'one-piece-starter-deck-27-black-marshalldteach': 'one-piece-starter-deck-27-black-marshalldteach',
    'one-piece-starter-deck-28-greenyellow-yamato': 'one-piece-starter-deck-28-yellow-yamato',
    'one-piece-starter-deck-29-egghead': 'one-piece-starter-deck-29-egghead',
    'one-piece-starter-deck-3-the-seven-warlords-of-the-sea': 'one-piece-starter-deck-3-the-seven-warlords-of-the-sea',
    'one-piece-starter-deck-31-red-monkeydluffy': 'one-piece-starter-deck-31-red-monkeydluffy',
    'one-piece-starter-deck-32-green-roronoa-zoro': 'one-piece-starter-starter-deck-32-green-roronoa-zoro',
    'one-piece-starter-deck-33-blue-kuzan': 'one-piece-starter-starter-deck-33-blue-kuzan',
    'one-piece-starter-deck-34-purple-charlotte-katakuri': 'one-piece-starter-starter-deck-34-purple-charlotte-katakuri',
    'one-piece-starter-deck-35-redblack-sabo': 'one-piece-starter-starter-deck-35-red-black-sabo',
    'one-piece-starter-deck-36-yellow-eustasscaptainkid': 'one-piece-starter-starter-deck-36-yellow-eustass-captain-kid',
    'one-piece-starter-deck-4-animal-kingdom-pirates': 'one-piece-starter-deck-4-animal-kingdom-pirates',
    'one-piece-starter-deck-5-film-edition': 'one-piece-starter-deck-5-film-edition',
    'one-piece-starter-deck-6-absolute-justice': 'one-piece-starter-deck-6-absolute-justice',
    'one-piece-starter-deck-7-big-mom-pirates': 'one-piece-starter-deck-7-big-mom-pirates',
    'one-piece-starter-deck-8-monkeydluffy': 'one-piece-starter-deck-8-monkeydluffy',
    'one-piece-starter-deck-9-yamato': 'one-piece-starter-deck-9-yamato',
    'one-piece-starter-deck-ex-luffy-ace': 'one-piece-starter-deck-ex-30-luffy-&-ace',
    'one-piece-super-pre-release-starter-deck-1-straw-hat-crew': 'one-piece-starter-deck-1-straw-hat-crew',
    'one-piece-super-pre-release-starter-deck-2-worst-generation': 'one-piece-starter-deck-2-worst-generation',
    'one-piece-super-pre-release-starter-deck-3-the-seven-warlords-of-the-sea': 'one-piece-starter-deck-3-the-seven-warlords-of-the-sea',
    'one-piece-super-pre-release-starter-deck-4-animal-kingdom-pirates': 'one-piece-starter-deck-4-animal-kingdom-pirates',
    'one-piece-the-azure-seas-seven': "one-piece-azure-sea's-seven",
    'one-piece-the-azure-seas-seven-release-event-cards': "one-piece-azure-sea's-seven",
    'one-piece-the-time-of-battle': 'one-piece-the-time-of-battle',
    'one-piece-the-time-of-battle-release-event-cards': 'one-piece-the-time-of-battle',
    'one-piece-two-legends': 'one-piece-two-legends',
    'one-piece-two-legends-pre-release-cards': 'one-piece-two-legends',
    'one-piece-ultra-deck-the-three-brothers': 'one-piece-ultra-deck-the-three-brothers',
    'one-piece-ultra-deck-the-three-captains': 'one-piece-ultra-deck-the-three-captains',
    'one-piece-wings-of-the-captain': 'one-piece-wings-of-the-captain',
    'one-piece-wings-of-the-captain-pre-release-cards': 'one-piece-wings-of-the-captain',
}


# Slugs /console/{one-piece,pokemon}-japanese-... pour le scellé JAPONAIS --
# distinct de PRICECHARTING_SET_SLUGS ci-dessus parce qu'aucune source
# référentielle (API TCG ne référence que l'anglais, cf. apitcg.py) ne connaît
# ce catalogue : ces items sont créés directement depuis PriceCharting (cf.
# sync_jp_sealed_items_for_set), pas juste recoupés contre un item apitcg
# existant. `language='JP'` sur l'item créé fait la distinction avec son
# homonyme EN qui partage le même set_code.
#
# One Piece : généré le 2026-08-01 par matching automatique nom/slug contre le
# sitemap PriceCharting (vérifié à la main), moins 4 slugs exclus faute
# d'équivalent EN fiable -- décrit ci-dessous car ce TCG réutilise le set_code
# EN comme clé (le Japon y publie ses sets en parallèle des sets EN avec la
# même numérotation/nom, donc un mapping direct fiable existe : 56/60 slugs
# JP trouvés). Deux buckets promo génériques (`-promo`,
# `-carddass-hyper-battle-promo`, même nature que les "junk sets" API TCG, cf.
# mémoire projet), `-extra-booster-egghead-crisis` (set récent absent de
# PRICECHARTING_SET_SLUGS côté EN) et `-starter-deck-21-gear5` (numéro de
# starter deck sans équivalent EN mappé).
#
# Pokémon : ajouté le 2026-08-01. Contrairement à One Piece, le catalogue JP
# de Pokémon n'a PAS de correspondance fiable avec les set_code EN (391 slugs
# JP sur le sitemap PriceCharting contre 217 set_code EN, moins de 30 avec un
# nom qui matche -- l'historique de sorties diffère structurellement, cf.
# mémoire projet). Le modèle "même set_code que l'EN" ne s'applique donc pas :
# la clé est un set_code JP-natif synthétique (`pokemon-jp-<slug sans le
# préfixe "pokemon-japanese-">`, cf. `_set_label_from_code` qui retire ce
# préfixe "jp-" pour l'affichage), propre à ce dict, sans lien avec
# PRICECHARTING_SET_SLUGS.
#
# La sélection des ~150 slugs retenus (sur 391 candidats) vient d'un crawl
# complet des pages /console/pokemon-japanese-* (script ad hoc, pas commité),
# filtré en deux temps :
# 1. la page doit avoir au moins une ligne "Booster Box"/"Booster Pack" une
#    fois les singles Energy et numérotés retirés (cf. `_JP_SEALED_SINGLE_CARD_RE`,
#    `_JP_SEALED_ENERGY_RE`) -- élimine mécaniquement les buckets promo/
#    deck/sticker/magazine qui n'ont jamais vendu de boosters ;
# 2. le nombre de lignes "scellé" restantes après filtrage doit être <= 6 --
#    élimine les sets d'ère vintage (Neo/e-Card/DP JP) dont les cartes
#    Pokémon/Dresseur ne portent AUCUN numéro imprimé (contrairement aux sets
#    récents) : sur ces pages, `_extract_number` ne matche jamais rien et la
#    quasi-totalité du set (parfois 100+ cartes) se retrouve à tort classée
#    "scellé" -- aucun filtre par mot-clé ne peut les distinguer de façon
#    fiable d'un vrai produit scellé (ce sont de simples noms de Pokémon/
#    Dresseur). 13 sets rejetés par ce filtre sur 166 qui passaient le
#    critère 1, tous vérifiés à la main comme faux positifs (vintage sans
#    numérotation, ou le bucket `-promo`).
# Le filtrage laisse passer un bruit résiduel mineur et accepté (ex.
# `pokemon-japanese-cd-promo` inclut 2 items promo CD non scellés à côté
# d'un vrai Booster Box ; `pokemon-japanese-vs` inclut 1 carte Deoxys promo)
# -- comme pour le matching EN (cf. ratio <30% flaggé plutôt que filtré),
# pas la peine de viser 100% pour ~2 items sur les ~300 couverts.
PRICECHARTING_JP_SEALED_SLUGS = {
    'one-piece-500-years-in-the-future': 'one-piece-japanese-500-years-in-the-future',
    'one-piece-a-fist-of-divine-speed': 'one-piece-japanese-fist-of-divine-speed',
    'one-piece-adventure-on-kamis-island': "one-piece-japanese-adventure-on-kami's-island",
    'one-piece-awakening-of-the-new-era': 'one-piece-japanese-awakening-of-the-new-era',
    'one-piece-carrying-on-his-will': 'one-piece-japanese-carrying-on-his-will',
    'one-piece-emperors-in-the-new-world': 'one-piece-japanese-emperors-in-the-new-world',
    'one-piece-extra-booster-anime-25th-collection': 'one-piece-japanese-extra-booster-anime-25th-collection',
    'one-piece-extra-booster-memorial-collection': 'one-piece-japanese-extra-booster-memorial-collection',
    'one-piece-extra-booster-one-piece-heroines-edition': 'one-piece-japanese-extra-booster-heroines-edition',
    'one-piece-kingdoms-of-intrigue': 'one-piece-japanese-kingdoms-of-intrigue',
    'one-piece-legacy-of-the-master': 'one-piece-japanese-legacy-of-the-master',
    'one-piece-paramount-war': 'one-piece-japanese-paramount-war',
    'one-piece-pillars-of-strength': 'one-piece-japanese-pillars-of-strength',
    'one-piece-premium-booster-the-best-': 'one-piece-japanese-premium-booster',
    'one-piece-premium-booster-the-best-vol-2': 'one-piece-japanese-premium-booster-2',
    'one-piece-romance-dawn': 'one-piece-japanese-romance-dawn',
    'one-piece-royal-blood': 'one-piece-japanese-royal-blood',
    'one-piece-starter-deck-1-straw-hat-crew': 'one-piece-japanese-starter-deck-1-straw-hat-crew',
    'one-piece-starter-deck-11-uta': 'one-piece-japanese-starter-deck-11-uta',
    'one-piece-starter-deck-12-zoro-and-sanji': 'one-piece-japanese-starter-deck-12',
    'one-piece-starter-deck-14-3d2y': 'one-piece-japanese-starter-deck-14-3d2y',
    'one-piece-starter-deck-15-red-edwardnewgate': 'one-piece-japanese-starter-deck-15-edward-newgate',
    'one-piece-starter-deck-16-green-uta': 'one-piece-japanese-starter-deck-16-uta',
    'one-piece-starter-deck-17-blue-donquixote-doflamingo': 'one-piece-japanese-starter-deck-17-donquixote-donflamingo',
    'one-piece-starter-deck-18-purple-monkeydluffy': 'one-piece-japanese-starter-deck-18-monkeydluffy',
    'one-piece-starter-deck-19-black-smoker': 'one-piece-japanese-starter-deck-19-smoker',
    'one-piece-starter-deck-2-worst-generation': 'one-piece-japanese-starter-deck-2-worst-generation',
    'one-piece-starter-deck-20-yellow-charlotte-katakuri': 'one-piece-japanese-starter-deck-20-charlotte-katakuri',
    'one-piece-starter-deck-22-ace-newgate': 'one-piece-japanese-starter-deck-22-ace-&-newgate',
    'one-piece-starter-deck-23-red-shanks': 'one-piece-japanese-starter-deck-23-red-shanks',
    'one-piece-starter-deck-24-green-jewelry-bonney': 'one-piece-japanese-starter-deck-24-green-jewelry-bonney',
    'one-piece-starter-deck-25-blue-buggy': 'one-piece-japanese-starter-deck-25-blue-buggy',
    'one-piece-starter-deck-26-purpleblack-monkeydluffy': 'one-piece-japanese-starter-deck-26-purple-monkeydluffy',
    'one-piece-starter-deck-27-black-marshalldteach': 'one-piece-japanese-starter-deck-27-black-marshalldteach',
    'one-piece-starter-deck-28-greenyellow-yamato': 'one-piece-japanese-starter-deck-28-yellow-yamato',
    'one-piece-starter-deck-29-egghead': 'one-piece-japanese-starter-deck-29-egghead-arc',
    'one-piece-starter-deck-3-the-seven-warlords-of-the-sea': 'one-piece-japanese-starter-deck-3-the-seven-warlords-of-the-sea',
    'one-piece-starter-deck-31-red-monkeydluffy': 'one-piece-japanese-starter-deck-31-red-monkeydluffy',
    'one-piece-starter-deck-32-green-roronoa-zoro': 'one-piece-japanese-starter-deck-32-green-roronoa-zoro',
    'one-piece-starter-deck-33-blue-kuzan': 'one-piece-japanese-starter-deck-33-blue-kuzan',
    'one-piece-starter-deck-34-purple-charlotte-katakuri': 'one-piece-japanese-starter-deck-34-purple-charlotte-katakuri',
    'one-piece-starter-deck-35-redblack-sabo': 'one-piece-japanese-starter-deck-35-red-black-sabo',
    'one-piece-starter-deck-36-yellow-eustasscaptainkid': 'one-piece-japanese-starter-deck-36-yellow-eustass-captain-kid',
    'one-piece-starter-deck-4-animal-kingdom-pirates': 'one-piece-japanese-starter-deck-4-animal-kingdom-pirates',
    'one-piece-starter-deck-5-film-edition': 'one-piece-japanese-starter-deck-5-film-edition',
    'one-piece-starter-deck-6-absolute-justice': 'one-piece-japanese-starter-deck-6-absolute-justice',
    'one-piece-starter-deck-7-big-mom-pirates': 'one-piece-japanese-starter-deck-7-big-mom-pirates',
    'one-piece-starter-deck-8-monkeydluffy': 'one-piece-japanese-starter-deck-8-monkeydluffy',
    'one-piece-starter-deck-9-yamato': 'one-piece-japanese-starter-deck-9-yamato',
    'one-piece-starter-deck-ex-luffy-ace': 'one-piece-japanese-starter-deck-30-luffy-&-ace',
    'one-piece-the-azure-seas-seven': "one-piece-japanese-azure-sea's-seven",
    'one-piece-the-time-of-battle': 'one-piece-japanese-the-time-of-battle',
    'one-piece-two-legends': 'one-piece-japanese-two-legends',
    'one-piece-ultra-deck-the-three-brothers': 'one-piece-japanese-ultra-deck-the-three-brothers',
    'one-piece-ultra-deck-the-three-captains': 'one-piece-japanese-ultra-deck-the-three-captains',
    'one-piece-wings-of-the-captain': 'one-piece-japanese-wings-of-the-captain',

    # Pokémon -- cf. commentaire au-dessus du dict pour la méthode de
    # sélection (152 slugs retenus sur 391 candidats).
    'pokemon-jp-20th-anniversary': 'pokemon-japanese-20th-anniversary',
    'pokemon-jp-25th-anniversary-collection': 'pokemon-japanese-25th-anniversary-collection',
    'pokemon-jp-25th-anniversary-promo': 'pokemon-japanese-25th-anniversary-promo',
    'pokemon-jp-abyss-eye': 'pokemon-japanese-abyss-eye',
    'pokemon-jp-advent-of-arceus': 'pokemon-japanese-advent-of-arceus',
    'pokemon-jp-alolan-moonlight': 'pokemon-japanese-alolan-moonlight',
    'pokemon-jp-alter-genesis': 'pokemon-japanese-alter-genesis',
    'pokemon-jp-amazing-volt-tackle': 'pokemon-japanese-amazing-volt-tackle',
    'pokemon-jp-ancient-roar': 'pokemon-japanese-ancient-roar',
    'pokemon-jp-awakened-heroes': 'pokemon-japanese-awakened-heroes',
    'pokemon-jp-awakening-psychic-king': 'pokemon-japanese-awakening-psychic-king',
    'pokemon-jp-bandit-ring': 'pokemon-japanese-bandit-ring',
    'pokemon-jp-battle-partners': 'pokemon-japanese-battle-partners',
    'pokemon-jp-battle-rainbow': 'pokemon-japanese-battle-rainbow',
    'pokemon-jp-battle-region': 'pokemon-japanese-battle-region',
    'pokemon-jp-beat-of-the-frontier': 'pokemon-japanese-beat-of-the-frontier',
    'pokemon-jp-best-of-xy': 'pokemon-japanese-best-of-xy',
    'pokemon-jp-black-bolt': 'pokemon-japanese-black-bolt',
    'pokemon-jp-blue-shock': 'pokemon-japanese-blue-shock',
    'pokemon-jp-blue-sky-stream': 'pokemon-japanese-blue-sky-stream',
    'pokemon-jp-bonds-to-the-end-of-time': 'pokemon-japanese-bonds-to-the-end-of-time',
    'pokemon-jp-cd-promo': 'pokemon-japanese-cd-promo',
    'pokemon-jp-champion-road': 'pokemon-japanese-champion-road',
    'pokemon-jp-clay-burst': 'pokemon-japanese-clay-burst',
    'pokemon-jp-cold-flare': 'pokemon-japanese-cold-flare',
    'pokemon-jp-collection-moon': 'pokemon-japanese-collection-moon',
    'pokemon-jp-collection-x': 'pokemon-japanese-collection-x',
    'pokemon-jp-collection-y': 'pokemon-japanese-collection-y',
    'pokemon-jp-crimson-haze': 'pokemon-japanese-crimson-haze',
    'pokemon-jp-crossing-the-ruins': 'pokemon-japanese-crossing-the-ruins',
    'pokemon-jp-cruel-traitor': 'pokemon-japanese-cruel-traitor',
    'pokemon-jp-cyber-judge': 'pokemon-japanese-cyber-judge',
    'pokemon-jp-dark-order': 'pokemon-japanese-dark-order',
    'pokemon-jp-dark-phantasma': 'pokemon-japanese-dark-phantasma',
    'pokemon-jp-dark-rush': 'pokemon-japanese-dark-rush',
    'pokemon-jp-darkness-that-consumes-light': 'pokemon-japanese-darkness-that-consumes-light',
    'pokemon-jp-detective-pikachu': 'pokemon-japanese-detective-pikachu',
    'pokemon-jp-double-blaze': 'pokemon-japanese-double-blaze',
    'pokemon-jp-double-crisis': 'pokemon-japanese-double-crisis',
    'pokemon-jp-dragon-selection': 'pokemon-japanese-dragon-selection',
    'pokemon-jp-dragon-storm': 'pokemon-japanese-dragon-storm',
    'pokemon-jp-dream-league': 'pokemon-japanese-dream-league',
    'pokemon-jp-dream-shine-collection': 'pokemon-japanese-dream-shine-collection',
    'pokemon-jp-e-starter-deck': 'pokemon-japanese-e-starter-deck',
    'pokemon-jp-eevee-heroes': 'pokemon-japanese-eevee-heroes',
    'pokemon-jp-emerald-break': 'pokemon-japanese-emerald-break',
    'pokemon-jp-ex-battle-boost': 'pokemon-japanese-ex-battle-boost',
    'pokemon-jp-explosive-walker': 'pokemon-japanese-explosive-walker',
    'pokemon-jp-facing-a-new-trial': 'pokemon-japanese-facing-a-new-trial',
    'pokemon-jp-fairy-rise': 'pokemon-japanese-fairy-rise',
    'pokemon-jp-forbidden-light': 'pokemon-japanese-forbidden-light',
    'pokemon-jp-freeze-bolt': 'pokemon-japanese-freeze-bolt',
    'pokemon-jp-full-metal-wall': 'pokemon-japanese-full-metal-wall',
    'pokemon-jp-fusion-arts': 'pokemon-japanese-fusion-arts',
    'pokemon-jp-future-flash': 'pokemon-japanese-future-flash',
    'pokemon-jp-gaia-volcano': 'pokemon-japanese-gaia-volcano',
    'pokemon-jp-gg-end': 'pokemon-japanese-gg-end',
    'pokemon-jp-glory-of-team-rocket': 'pokemon-japanese-glory-of-team-rocket',
    'pokemon-jp-go': 'pokemon-japanese-go',
    'pokemon-jp-gx-battle-boost': 'pokemon-japanese-gx-battle-boost',
    'pokemon-jp-gx-ultra-shiny': 'pokemon-japanese-gx-ultra-shiny',
    'pokemon-jp-hail-blizzard': 'pokemon-japanese-hail-blizzard',
    'pokemon-jp-heartgold-collection': 'pokemon-japanese-heartgold-collection',
    'pokemon-jp-heat-wave-arena': 'pokemon-japanese-heat-wave-arena',
    'pokemon-jp-incandescent-arcana': 'pokemon-japanese-incandescent-arcana',
    'pokemon-jp-inferno-x': 'pokemon-japanese-inferno-x',
    'pokemon-jp-infinity-zone': 'pokemon-japanese-infinity-zone',
    'pokemon-jp-intense-fight-in-the-destroyed-sky': 'pokemon-japanese-intense-fight-in-the-destroyed-sky',
    'pokemon-jp-islands-await-you': 'pokemon-japanese-islands-await-you',
    'pokemon-jp-jet-black-spirit': 'pokemon-japanese-jet-black-spirit',
    'pokemon-jp-jungle': 'pokemon-japanese-jungle',
    'pokemon-jp-legendary-heartbeat': 'pokemon-japanese-legendary-heartbeat',
    'pokemon-jp-legendary-shine-collection': 'pokemon-japanese-legendary-shine-collection',
    'pokemon-jp-lost-abyss': 'pokemon-japanese-lost-abyss',
    'pokemon-jp-lost-link': 'pokemon-japanese-lost-link',
    'pokemon-jp-magma-vs-aqua-two-ambitions': 'pokemon-japanese-magma-vs-aqua-two-ambitions',
    'pokemon-jp-mask-of-change': 'pokemon-japanese-mask-of-change',
    'pokemon-jp-matchless-fighter': 'pokemon-japanese-matchless-fighter',
    'pokemon-jp-mega-brave': 'pokemon-japanese-mega-brave',
    'pokemon-jp-mega-dream-ex': 'pokemon-japanese-mega-dream-ex',
    'pokemon-jp-mega-symphonia': 'pokemon-japanese-mega-symphonia',
    'pokemon-jp-megalo-cannon': 'pokemon-japanese-megalo-cannon',
    'pokemon-jp-miracle-of-the-desert': 'pokemon-japanese-miracle-of-the-desert',
    'pokemon-jp-miracle-twins': 'pokemon-japanese-miracle-twins',
    'pokemon-jp-movie-commemoration-random': 'pokemon-japanese-movie-commemoration-random',
    'pokemon-jp-mysterious-mountains': 'pokemon-japanese-mysterious-mountains',
    'pokemon-jp-night-unison': 'pokemon-japanese-night-unison',
    'pokemon-jp-night-wanderer': 'pokemon-japanese-night-wanderer',
    'pokemon-jp-nihil-zero': 'pokemon-japanese-nihil-zero',
    'pokemon-jp-ninja-spinner': 'pokemon-japanese-ninja-spinner',
    'pokemon-jp-paradigm-trigger': 'pokemon-japanese-paradigm-trigger',
    'pokemon-jp-paradise-dragona': 'pokemon-japanese-paradise-dragona',
    'pokemon-jp-phantom-gate': 'pokemon-japanese-phantom-gate',
    'pokemon-jp-plasma-gale': 'pokemon-japanese-plasma-gale',
    'pokemon-jp-pokekyun-collection': 'pokemon-japanese-pokekyun-collection',
    'pokemon-jp-premium-champion-pack': 'pokemon-japanese-premium-champion-pack',
    'pokemon-jp-psycho-drive': 'pokemon-japanese-psycho-drive',
    'pokemon-jp-rage-of-the-broken-heavens': 'pokemon-japanese-rage-of-the-broken-heavens',
    'pokemon-jp-raging-surf': 'pokemon-japanese-raging-surf',
    'pokemon-jp-rapid-strike-master': 'pokemon-japanese-rapid-strike-master',
    'pokemon-jp-rebel-clash': 'pokemon-japanese-rebel-clash',
    'pokemon-jp-red-collection': 'pokemon-japanese-red-collection',
    'pokemon-jp-red-flash': 'pokemon-japanese-red-flash',
    'pokemon-jp-remix-bout': 'pokemon-japanese-remix-bout',
    'pokemon-jp-rising-fist': 'pokemon-japanese-rising-fist',
    'pokemon-jp-rocket-gang-strikes-back': 'pokemon-japanese-rocket-gang-strikes-back',
    'pokemon-jp-ruler-of-the-black-flame': 'pokemon-japanese-ruler-of-the-black-flame',
    'pokemon-jp-rulers-of-the-heavens': 'pokemon-japanese-rulers-of-the-heavens',
    'pokemon-jp-scarlet-ex': 'pokemon-japanese-scarlet-ex',
    'pokemon-jp-shield': 'pokemon-japanese-shield',
    'pokemon-jp-shining-legends': 'pokemon-japanese-shining-legends',
    'pokemon-jp-shiny-collection': 'pokemon-japanese-shiny-collection',
    'pokemon-jp-shiny-star-v': 'pokemon-japanese-shiny-star-v',
    'pokemon-jp-shiny-treasure-ex': 'pokemon-japanese-shiny-treasure-ex',
    'pokemon-jp-silver-lance': 'pokemon-japanese-silver-lance',
    'pokemon-jp-single-strike-master': 'pokemon-japanese-single-strike-master',
    'pokemon-jp-sky-legend': 'pokemon-japanese-sky-legend',
    'pokemon-jp-sky-splitting-charisma': 'pokemon-japanese-sky-splitting-charisma',
    'pokemon-jp-skyscraping-perfection': 'pokemon-japanese-skyscraping-perfection',
    'pokemon-jp-snow-hazard': 'pokemon-japanese-snow-hazard',
    'pokemon-jp-soulsilver-collection': 'pokemon-japanese-soulsilver-collection',
    'pokemon-jp-space-juggler': 'pokemon-japanese-space-juggler',
    'pokemon-jp-spiral-force': 'pokemon-japanese-spiral-force',
    'pokemon-jp-split-earth': 'pokemon-japanese-split-earth',
    'pokemon-jp-star-birth': 'pokemon-japanese-star-birth',
    'pokemon-jp-stellar-miracle': 'pokemon-japanese-stellar-miracle',
    'pokemon-jp-super-burst-impact': 'pokemon-japanese-super-burst-impact',
    'pokemon-jp-super-electric-breaker': 'pokemon-japanese-super-electric-breaker',
    'pokemon-jp-sword': 'pokemon-japanese-sword',
    'pokemon-jp-tag-all-stars': 'pokemon-japanese-tag-all-stars',
    'pokemon-jp-tag-bolt': 'pokemon-japanese-tag-bolt',
    'pokemon-jp-terastal-festival': 'pokemon-japanese-terastal-festival',
    'pokemon-jp-the-town-on-no-map': 'pokemon-japanese-the-town-on-no-map',
    'pokemon-jp-thunder-knuckle': 'pokemon-japanese-thunder-knuckle',
    'pokemon-jp-thunderclap-spark': 'pokemon-japanese-thunderclap-spark',
    'pokemon-jp-time-gazer': 'pokemon-japanese-time-gazer',
    'pokemon-jp-triplet-beat': 'pokemon-japanese-triplet-beat',
    'pokemon-jp-ultra-force': 'pokemon-japanese-ultra-force',
    'pokemon-jp-ultra-moon': 'pokemon-japanese-ultra-moon',
    'pokemon-jp-ultra-sun': 'pokemon-japanese-ultra-sun',
    'pokemon-jp-ultradimensional-beasts': 'pokemon-japanese-ultradimensional-beasts',
    'pokemon-jp-violet-ex': 'pokemon-japanese-violet-ex',
    'pokemon-jp-vmax-climax': 'pokemon-japanese-vmax-climax',
    'pokemon-jp-vmax-rising': 'pokemon-japanese-vmax-rising',
    'pokemon-jp-vs': 'pokemon-japanese-vs',
    'pokemon-jp-vstar-universe': 'pokemon-japanese-vstar-universe',
    'pokemon-jp-web': 'pokemon-japanese-web',
    'pokemon-jp-white-collection': 'pokemon-japanese-white-collection',
    'pokemon-jp-white-flare': 'pokemon-japanese-white-flare',
    'pokemon-jp-wild-blaze': 'pokemon-japanese-wild-blaze',
    'pokemon-jp-wild-force': 'pokemon-japanese-wild-force',
    'pokemon-jp-wind-from-the-sea': 'pokemon-japanese-wind-from-the-sea',
}


def fetch_console_page(slug: str) -> str:
    resp = requests.get(f"{BASE_URL}/console/{slug}", headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.text


def _parse_price(text: str) -> float | None:
    text = text.strip().replace(",", "").replace("$", "")
    if not text or text == "-":
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _parse_rows_from_soup(soup: BeautifulSoup) -> list[dict]:
    table = soup.find("table", id="games_table")
    if table is None:
        return []

    rows = []
    for tr in table.select("tbody tr[data-product]"):
        title_link = tr.select_one("td.title a")
        if title_link is None:
            continue
        price_span = tr.select_one("td.used_price span.js-price")
        used_price = _parse_price(price_span.get_text() if price_span else "")
        href = title_link.get("href")
        # Miniature (`<td class="image"><img class="photo" src="...">`) --
        # jamais utilisée côté EN (déjà couvert par l'image API TCG, cf.
        # mémoire projet "item_images"), mais c'est la seule source d'image
        # disponible pour les items créés directement depuis PriceCharting
        # (scellé JP, cf. sync_jp_sealed_items_for_set) : autant la capturer
        # ici puisque la page est déjà récupérée, zéro requête en plus.
        img = tr.select_one("td.image img.photo")
        rows.append({
            "pricecharting_id": tr.get("data-product"),
            "title": title_link.get_text(strip=True),
            "used_price": used_price,
            "url": f"{BASE_URL}{href}" if href and href.startswith("/") else href,
            "image_url": img.get("src") if img else None,
        })
    return rows


def parse_console_rows(html: str) -> list[dict]:
    """Extrait chaque ligne du tableau de set : id PriceCharting, titre, prix Ungraded.

    Une seule page (~150 lignes max) : pour un set complet, voir
    `fetch_all_console_rows`.
    """
    return _parse_rows_from_soup(BeautifulSoup(html, "html.parser"))


def _extract_next_page_form(soup: BeautifulSoup) -> dict | None:
    """Le tableau de set est plafonné à ~150 lignes par page ; la suite se
    charge via un formulaire POST à curseur (`class="js-next-page"`), pas une
    query string classique — `?page=2`/`?per_page=500` sont ignorés, confirmé
    en conditions réelles (cf. mémoire projet). Sans ce POST, les sets de plus
    de 150 produits sont silencieusement tronqués."""
    form = soup.find("form", class_="js-next-page")
    if form is None:
        return None
    fields = {}
    for inp in form.find_all("input"):
        name = inp.get("name")
        if name:
            fields[name] = inp.get("value", "")
    return fields


def fetch_all_console_rows(slug: str, max_pages: int = 20) -> list[dict]:
    """Récupère toutes les pages d'un set (suit la pagination par curseur)."""
    all_rows = []
    resp = requests.get(f"{BASE_URL}/console/{slug}", headers=HEADERS, timeout=30)
    resp.raise_for_status()
    html = resp.text

    for _ in range(max_pages):
        soup = BeautifulSoup(html, "html.parser")
        all_rows.extend(_parse_rows_from_soup(soup))
        next_fields = _extract_next_page_form(soup)
        if not next_fields:
            break
        time.sleep(MIN_SECONDS_BETWEEN_REQUESTS)
        resp = requests.post(f"{BASE_URL}/console/{slug}", headers=HEADERS, data=next_fields, timeout=30)
        resp.raise_for_status()
        html = resp.text
    return all_rows


# Sur la page carte individuelle (pas la page de set), les 6 colonnes ont un
# sens fixe et fiable : Ungraded/Grade7/Grade8/Grade9/Grade9.5/PSA10 — pas
# l'ambiguïté qu'on a sur la page de set entre used_price/new_price selon que
# la ligne est une carte ou un scellé (cf. mémoire projet). Le scellé n'a pas
# de gradation, donc cette fonction n'est utilisée que pour les singles.
GRADE_FIELD_TO_LABEL = {
    "used_price": "ungraded",
    "complete_price": "psa7",
    "new_price": "psa8",
    "graded_price": "psa9",
    "box_only_price": "psa9.5",
    "manual_only_price": "psa10",
}


def _parse_card_grades(soup: BeautifulSoup) -> dict:
    table = soup.find("table", id="price_data")
    if table is None:
        return {}

    grades = {}
    for field_id, grade in GRADE_FIELD_TO_LABEL.items():
        td = table.find("td", id=field_id)
        if td is None:
            continue
        span = td.select_one("span.price.js-price")
        price = _parse_price(span.get_text() if span else "")
        if price is not None:
            grades[grade] = price
    return grades


# Onglets de la table "Sold Listings" (ventes eBay/TCGPlayer individuelles,
# section id="js-usability-game-historicSales") -- mêmes 6 paliers que
# GRADE_FIELD_TO_LABEL, la page réutilise les mêmes noms de section. Les
# ~13 autres onglets (CGC/BGS/SGC/TAG/ACE, grades bruts 1-6) sont ignorés :
# hors du scope PSA7-10 déjà en place pour price_snapshots (cf. mémoire
# projet "grading_tiers"), pas la peine d'élargir le vocabulaire de `grade`.
#
# Chaque onglet semble plafonné à ~30 lignes visibles (constaté le
# 2026-07-30 : l'onglet "box-only" d'une carte à ~1 vente/semaine montre
# exactement ~30 lignes sur les 7 derniers mois) -- pas un historique
# illimité, les ventes plus anciennes que ce plafond ne sont pas
# récupérables. D'où la cadence 2-3x/semaine plutôt qu'hebdo (cf. mémoire
# projet "sales_volume_tracking") : réduit le risque de rater des ventes
# sur les cartes à volume plus élevé.
SALES_TAB_TO_GRADE = {
    "used": "ungraded",
    "cib": "psa7",
    "new": "psa8",
    "graded": "psa9",
    "box-only": "psa9.5",
    "manual-only": "psa10",
}


def _parse_sales_from_div(div, grade: str) -> list[dict]:
    rows = []
    for tr in div.select("tr[id]"):
        marketplace, sep, external_id = tr.get("id", "").partition("-")
        if not sep:
            continue
        date_td = tr.select_one("td.date")
        price_span = tr.select_one("td.numeric span.js-price")
        if date_td is None or price_span is None:
            continue
        price = _parse_price(price_span.get_text())
        if price is None:
            continue
        try:
            sale_date = datetime.strptime(date_td.get_text(strip=True), "%Y-%m-%d").date()
        except ValueError:
            continue
        title_link = tr.select_one("td.title a")
        rows.append({
            "marketplace": marketplace,
            "external_sale_id": external_id,
            "sale_date": sale_date,
            "price": price,
            "grade": grade,
            "title": title_link.get_text(strip=True) if title_link else None,
        })
    return rows


def _parse_card_sales(soup: BeautifulSoup) -> list[dict]:
    """Ventes individuelles (date/titre/prix) par palier de gradation. Plusieurs
    <div> peuvent partager la même classe `completed-auctions-{tab}` (le bouton
    d'onglet dans la nav en a une, le conteneur de table une autre) -- on ne
    garde que celui qui contient effectivement une <table>."""
    all_sales = []
    for tab, grade in SALES_TAB_TO_GRADE.items():
        div = next(
            (d for d in soup.find_all("div", class_=f"completed-auctions-{tab}") if d.find("table")),
            None,
        )
        if div is None:
            continue
        all_sales.extend(_parse_sales_from_div(div, grade))
    return all_sales


def fetch_card_details(url: str) -> dict:
    """Une seule requête HTTP par carte, deux usages : prix par palier de
    gradation (table `price_data`) ET historique de ventes individuelles
    (onglets `completed-auctions-*`) -- les deux vivent sur la même page,
    pas la peine de la requêter deux fois."""
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    return {
        "grades": _parse_card_grades(soup),
        "sales": _parse_card_sales(soup),
    }


# Pokémon: "Charizard ex #199" -> 199. One Piece: "... OP06-118" -> 118 (pas
# encore validé en conditions réelles, cf. mémoire projet : One Piece est
# reporté après Pokémon).
_NUMBER_PATTERNS = [
    re.compile(r"#(\d+)\s*$"),
    re.compile(r"-(\d+)\s*$"),
]


def _extract_number(title: str) -> int | None:
    for pattern in _NUMBER_PATTERNS:
        m = pattern.search(title)
        if m:
            return int(m.group(1))
    return None


def _code_numerator(code: str | None) -> int | None:
    """Pokémon: '117/128' -> 117 (avant le '/'). One Piece: 'OP06-118' -> 118
    (après le dernier '-') — deux formats de code différents selon le TCG."""
    if not code:
        return None
    code = code.strip()
    if "/" in code:
        head = code.split("/")[0].strip()
        return int(head) if head.isdigit() else None
    if "-" in code:
        tail = code.rsplit("-", 1)[-1].strip()
        return int(tail) if tail.isdigit() else None
    return int(code) if code.isdigit() else None


def _normalize_name(name: str) -> str:
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    name = re.sub(r"[^a-z0-9]+", " ", name.lower())
    return " ".join(name.split())


_QUALIFIER_RE = re.compile(r"[\(\[][^\)\]]*[\)\]]")
_QUALIFIER_CONTENT_RE = re.compile(r"[\(\[]([^\)\]]*)[\)\]]")

# Seuil de confiance minimum pour départager par contenu de qualificatif :
# en-dessous, on préfère ne pas matcher plutôt que d'assigner un prix à la
# mauvaise variante (One Piece a souvent 3-4+ variantes par numéro — Alternate
# Art, Manga, Anniversary... — bien plus que Pokémon).
_QUALIFIER_MATCH_THRESHOLD = 0.5


def _has_qualifier(text: str) -> bool:
    """Détecte un marqueur de variante entre crochets/parenthèses, ex. '[Metal]',
    '(151 Metal Card)' — sert à départager des items qui partagent le même numéro."""
    return bool(_QUALIFIER_RE.search(text))


def _qualifier_tokens(text: str) -> frozenset:
    """Mots contenus dans les qualificatifs entre crochets/parenthèses (pas tout
    le titre) : ex. 'Roronoa Zoro [Alternate Art Manga] OP06-118' -> {alternate,
    art, manga}. Un titre sans qualificatif donne un ensemble vide."""
    contents = _QUALIFIER_CONTENT_RE.findall(text)
    return frozenset(_normalize_name(" ".join(contents)).split())


def _qualifier_dice(a: frozenset, b: frozenset) -> float:
    if not a and not b:
        return 1.0  # les deux "plain" (aucun qualificatif) -> match parfait
    if not a or not b:
        return 0.0  # un seul des deux a un qualificatif -> pas la même variante
    return 2 * len(a & b) / (len(a) + len(b))


def _best_single_match(pc_title: str, candidates: list[dict]) -> dict | None:
    """Plusieurs items peuvent partager le même numéro de carte (variantes :
    Alternate Art, Manga, Metal...). On départage par similarité du *contenu*
    du qualificatif entre crochets/parenthèses, pas juste sa présence — One
    Piece a souvent plus de 2 variantes par numéro, un simple booléen ne
    suffit plus (cf. mémoire projet)."""
    if len(candidates) == 1:
        return candidates[0]
    pc_qual = _qualifier_tokens(pc_title)
    scored = sorted(
        ((_qualifier_dice(pc_qual, _qualifier_tokens(c["name"])), c) for c in candidates),
        key=lambda pair: pair[0],
        reverse=True,
    )
    best_score, best = scored[0]
    if best_score < _QUALIFIER_MATCH_THRESHOLD:
        return None
    if len(scored) >= 2 and scored[1][0] == best_score:
        return None  # toujours ambigu après départage : on ne devine pas
    return best


_SEALED_NOISE_WORDS = {"sealed"}


def _match_sealed_item(pc_title: str, candidates: list[dict]) -> dict | None:
    """Comparaison par ensemble de mots (insensible à l'ordre et aux mots en plus
    côté catalogue), pour absorber les variations de formulation entre les deux
    sources (ex. 'Sealed Poster Collection' vs notre '151 Poster Collection',
    ou 'Elite Trainer Box [Pokemon Center]' vs notre '... Pokemon Center Elite
    Trainer Box...' où l'ordre des mots diffère)."""
    pc_tokens = set(_normalize_name(pc_title).split()) - _SEALED_NOISE_WORDS
    exact = [c for c in candidates if set(_normalize_name(c["name"]).split()) == pc_tokens]
    if len(exact) == 1:
        return exact[0]
    contains = [c for c in candidates if pc_tokens <= set(_normalize_name(c["name"]).split())]
    if len(contains) == 1:
        return contains[0]
    if len(contains) > 1:
        return min(contains, key=lambda c: len(c["name"]))
    return None


def _select_canonical_rows(matches: list[tuple[dict, dict]]) -> dict:
    """Plusieurs lignes PriceCharting (ex. normale + Reverse Holo) peuvent matcher
    le même item quand notre catalogue ne distingue pas ces tirages. On ne garde
    qu'une ligne par item, en préférant celle sans qualificatif de variante
    (la version de base) plutôt que la première rencontrée au hasard du scraping."""
    by_item: dict = {}
    for row, item in matches:
        by_item.setdefault(item["id"], []).append(row)

    canonical = {}
    for item_id, item_rows in by_item.items():
        if len(item_rows) == 1:
            canonical[item_id] = item_rows[0]
            continue
        plain = [r for r in item_rows if not _has_qualifier(r["title"])]
        canonical[item_id] = plain[0] if plain else item_rows[0]
    return canonical


# La contrainte UNIQUE porte sur (item_id, captured_at, source, grade) depuis
# l'ajout de la gradation : même en omettant `grade` (défaut 'ungraded'),
# ON CONFLICT doit cibler les 4 colonnes, pas les 3 d'origine.
_UPSERT_PRICE_SNAPSHOTS_SQL = """
    INSERT INTO price_snapshots (item_id, captured_at, price, currency, volume, source)
    VALUES %s
    ON CONFLICT (item_id, captured_at, source, grade) DO NOTHING
"""

_UPSERT_PRICE_SNAPSHOTS_WITH_GRADE_SQL = """
    INSERT INTO price_snapshots (item_id, captured_at, price, currency, volume, source, grade)
    VALUES %s
    ON CONFLICT (item_id, captured_at, source, grade) DO NOTHING
"""

_UPSERT_SALES_SQL = """
    INSERT INTO sales (item_id, sale_date, price, currency, grade, marketplace, external_sale_id, title, source)
    VALUES %s
    ON CONFLICT (marketplace, external_sale_id) DO NOTHING
"""


def sync_price_snapshots_for_set(
    set_code: str, tcg: str, fetch_grades: bool = False, max_cards: int | None = None,
) -> dict:
    """Scrape la page de set PriceCharting mappée à `set_code` et archive les prix matchés.

    `fetch_grades=True` : pour chaque single ET chaque scellé matchés, va aussi
    chercher, sur sa page produit individuelle (1 requête HTTP de plus par item
    — coûteux à grande échelle, cf. mémoire projet sur le scope "sets récents") :
    - pour les singles seulement : les prix PSA7-10 (-> `price_snapshots`)
    - pour les deux : l'historique de ventes individuelles eBay/TCGPlayer
      (-> `sales`, filtré à grade='ungraded' pour le scellé qui n'a pas de
      gradation). Sert à calculer un prix de box par médiane des dernières
      ventes plutôt que l'agrégat PriceCharting seul, cf. index/sealed_ev.py --
      un agrégat basé sur une seule vente mal classée (mauvaise édition/langue)
      peut être très éloigné du marché réel sur un produit à faible volume.
    Tout vient de la même page, donc de la même requête HTTP (cf. `fetch_card_details`).
    `max_cards` plafonne le nombre d'items traités par set (utile pour tester
    ou pour un run à budget limité).
    """
    slug = PRICECHARTING_SET_SLUGS.get(set_code)
    if not slug:
        raise ValueError(
            f"Pas de mapping PriceCharting pour set_code={set_code!r}. "
            f"Ajoute-le dans PRICECHARTING_SET_SLUGS."
        )

    rows = fetch_all_console_rows(slug)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, category, code, name FROM items WHERE tcg = %s AND set_code = %s",
                (tcg, set_code),
            )
            items = [
                {"id": r[0], "category": r[1], "code": r[2], "name": r[3]}
                for r in cur.fetchall()
            ]

        singles_by_number: dict[int, list[dict]] = {}
        for it in items:
            if it["category"] != "single":
                continue
            n = _code_numerator(it["code"])
            if n is not None:
                singles_by_number.setdefault(n, []).append(it)
        sealed_candidates = [it for it in items if it["category"] == "sealed"]

        matches = []
        unmatched = []
        for row in rows:
            if row["used_price"] is None:
                continue
            number = _extract_number(row["title"])
            item = None
            if number is not None:
                candidates = singles_by_number.get(number)
                if candidates:
                    item = _best_single_match(row["title"], candidates)
            else:
                item = _match_sealed_item(row["title"], sealed_candidates)

            if item is None:
                unmatched.append(row["title"])
                continue
            matches.append((row, item))

        today = date.today()
        canonical_rows = _select_canonical_rows(matches)
        matched_rows = [
            (item_id, today, row["used_price"], "USD", None, "pricecharting")
            for item_id, row in canonical_rows.items()
        ]

        if matched_rows:
            with conn.cursor() as cur:
                execute_values(cur, _UPSERT_PRICE_SNAPSHOTS_SQL, matched_rows)
                conn.commit()

        cards_graded = 0
        grade_rows_written = 0
        sale_rows_written = 0
        if fetch_grades:
            category_by_item_id = {it["id"]: it["category"] for it in items}
            # Scellé inclus depuis 2026-07-31 (cf. discussion ratio EV) : sert à
            # calculer un prix de box par médiane des dernières ventes plutôt que
            # de faire confiance à l'agrégat PriceCharting seul (cf. sealed_ev.py) --
            # un scellé n'a jamais de gradation PSA, donc seul le tab "used"
            # (grade='ungraded') a un sens pour lui, filtré plus bas.
            detail_rows = [
                (item_id, row) for item_id, row in canonical_rows.items()
                if category_by_item_id.get(item_id) in ("single", "sealed") and row.get("url")
            ]
            if max_cards is not None:
                detail_rows = detail_rows[:max_cards]
            with conn.cursor() as cur:
                for i, (item_id, row) in enumerate(detail_rows):
                    if i > 0:
                        time.sleep(MIN_SECONDS_BETWEEN_REQUESTS)
                    try:
                        details = fetch_card_details(row["url"])
                    except Exception as exc:
                        print(f"    ! erreur gradation/ventes {row['title']}: {exc}")
                        continue
                    cards_graded += 1
                    is_sealed = category_by_item_id.get(item_id) == "sealed"

                    # 'ungraded' déjà écrit ci-dessus depuis la page de set, pas la
                    # peine de le redemander ; pas de gradation pour le scellé.
                    if not is_sealed:
                        grade_price_rows = [
                            (item_id, today, price, "USD", None, "pricecharting", grade)
                            for grade, price in details["grades"].items() if grade != "ungraded"
                        ]
                        if grade_price_rows:
                            execute_values(cur, _UPSERT_PRICE_SNAPSHOTS_WITH_GRADE_SQL, grade_price_rows)
                            conn.commit()
                            grade_rows_written += len(grade_price_rows)

                    sale_rows = [
                        (item_id, s["sale_date"], s["price"], "USD", s["grade"],
                         s["marketplace"], s["external_sale_id"], s["title"], "pricecharting")
                        for s in details["sales"]
                        if not is_sealed or s["grade"] == "ungraded"
                    ]
                    if sale_rows:
                        execute_values(cur, _UPSERT_SALES_SQL, sale_rows)
                        conn.commit()
                        sale_rows_written += len(sale_rows)
    finally:
        conn.close()

    return {
        "set_code": set_code,
        "pricecharting_slug": slug,
        "rows_scraped": len(rows),
        "rows_matched": len(matched_rows),
        "rows_unmatched": len(unmatched),
        "unmatched_titles": unmatched,
        "cards_graded": cards_graded,
        "grade_rows_written": grade_rows_written,
        "sale_rows_written": sale_rows_written,
    }


# set_code est toujours préfixé "{tcg}-..." (cf. apitcg.py) ; PRICECHARTING_SET_SLUGS
# mélange plusieurs TCG dans un seul dict, donc on dérive le tcg du préfixe
# plutôt que d'exiger un tcg unique pour tout un run.
_KNOWN_TCG_PREFIXES = ["one-piece", "pokemon"]


def _tcg_from_set_code(set_code: str) -> str:
    for prefix in _KNOWN_TCG_PREFIXES:
        if set_code.startswith(prefix + "-"):
            return prefix
    raise ValueError(f"Impossible de déduire le tcg pour set_code={set_code!r}")


def _set_codes_by_age(tcg: str | None, min_age_months: int | None, max_age_months: int | None) -> set:
    """set_code dont au moins un item a une `release_date` dans la tranche d'âge
    [min_age_months, max_age_months] (bornes en mois, `None` = pas de limite de
    ce côté). Généralise l'ancien `_recent_set_codes` (qui ne posait qu'une
    borne haute) pour porter le système de paliers par âge de set (cf.
    orchestrator.py TIERS)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            where = []
            params = []
            if max_age_months is not None:
                where.append("release_date >= (CURRENT_DATE - %s * INTERVAL '1 month')")
                params.append(max_age_months)
            if min_age_months is not None:
                where.append("release_date < (CURRENT_DATE - %s * INTERVAL '1 month')")
                params.append(min_age_months)
            if tcg:
                where.append("tcg = %s")
                params.append(tcg)
            where_sql = " AND ".join(where) if where else "TRUE"
            cur.execute(f"SELECT DISTINCT set_code FROM items WHERE {where_sql}", params)
            return {r[0] for r in cur.fetchall()}
    finally:
        conn.close()


def _slice_set_codes(set_codes, slice_index: int, num_slices: int) -> set:
    """Découpe stable (pas aléatoire, pas dépendante de l'ordre) : un set_code
    tombe toujours dans la même tranche d'une semaine à l'autre, via un hash
    déterministe (`zlib.crc32`, contrairement au `hash()` builtin qui varie
    d'un run Python à l'autre). Sert à étaler le palier vintage sur plusieurs
    semaines plutôt que de le taper en un seul run impossible à faire tenir
    en 6h (cf. mémoire/handoff sur le système de paliers)."""
    return {sc for sc in set_codes if zlib.crc32(sc.encode()) % num_slices == slice_index}


def sync_all_mapped_sets(
    tcg: str | None = None,
    fetch_grades: bool = False,
    min_age_months: int | None = None,
    max_age_months: int | None = None,
    vintage_slice: int | None = None,
    vintage_slices: int | None = None,
) -> list[dict]:
    """Boucle sur les set_code de PRICECHARTING_SET_SLUGS, filtrés sur `tcg` et,
    si fournies, sur une tranche d'âge [min_age_months, max_age_months] (cf.
    `_set_codes_by_age`) puis sur une rotation `vintage_slice`/`vintage_slices`
    (cf. `_slice_set_codes`), avec pause polie entre deux pages. Une erreur sur
    un set (404, slug faux...) est capturée et reportée plutôt que d'interrompre
    le run."""
    set_codes = [
        sc for sc in PRICECHARTING_SET_SLUGS
        if tcg is None or _tcg_from_set_code(sc) == tcg
    ]
    if min_age_months is not None or max_age_months is not None:
        in_range = _set_codes_by_age(tcg, min_age_months, max_age_months)
        set_codes = [sc for sc in set_codes if sc in in_range]
    if vintage_slice is not None:
        set_codes = sorted(_slice_set_codes(set_codes, vintage_slice, vintage_slices))

    results = []
    for i, set_code in enumerate(set_codes):
        if i > 0:
            time.sleep(MIN_SECONDS_BETWEEN_REQUESTS)
        try:
            stats = sync_price_snapshots_for_set(
                set_code, _tcg_from_set_code(set_code), fetch_grades=fetch_grades,
            )
            ratio = stats["rows_matched"] / stats["rows_scraped"] if stats["rows_scraped"] else 0.0
            extra = (
                f", {stats['cards_graded']} cartes gradées ({stats['grade_rows_written']} lignes), "
                f"{stats['sale_rows_written']} ventes"
                if fetch_grades else ""
            )
            print(
                f"[{i+1}/{len(set_codes)}] {set_code} -> {stats['pricecharting_slug']}: "
                f"{stats['rows_matched']}/{stats['rows_scraped']} matchés ({ratio:.0%}){extra}"
            )
            results.append({**stats, "error": None})
        except Exception as exc:
            print(f"[{i+1}/{len(set_codes)}] {set_code}: ERREUR {exc}")
            results.append({"set_code": set_code, "error": str(exc)})
    return results


# Cartes spéciales sans numéro qui passeraient à tort le filtre "pas de numéro
# = scellé" ci-dessous (constaté en conditions réelles : "DON!! Card [Alternate
# Art]" sur Fist of Divine Speed/Romance Dawn, "DON Card [Personnage]" --sans
# les "!!" -- sur le set Premium Booster/Royal Blood) : le jeton DON!! est une
# carte de jeu spéciale, pas un produit scellé, avec un habillage de titre pas
# constant d'un set à l'autre. Pas un problème côté EN (le scellé y est
# recoupé contre les items apitcg existants, cf. `_match_sealed_item`, qui
# n'inclut jamais ce genre de token) -- mais ici on crée l'item directement
# depuis PriceCharting, donc rien ne filtre ce faux positif sans ce regex.
_JP_SEALED_TITLE_EXCLUDE_RE = re.compile(r"\bdon!{0,2}\s*card\b", re.IGNORECASE)

# `_extract_number` (patterns `#(\d+)$` / `-(\d+)$`) rate les singles japonais
# Pokémon dont le code n'est pas purement numérique -- constaté en conditions
# réelles sur des sets qui passent par ailleurs le filtre "a un Booster Box"
# (cf. PRICECHARTING_JP_SEALED_SLUGS) : cartes Energy ("Metal Energy #MET"),
# codes promo ("Pikachu #20/M-P"). Sans ce filtre supplémentaire, ces singles
# seraient créés à tort comme scellé (contrairement au flux EN où un raté de
# ce genre est juste ignoré, cf. `_match_sealed_item` -- ici l'item est créé
# directement, rien d'autre ne rattrape l'erreur). Volontairement plus large
# que `_extract_number` (n'importe quel `#<token>` final, pas seulement les
# chiffres) : aucun scellé observé sur PriceCharting (Pokémon comme One
# Piece) ne porte de code `#...` en fin de titre, donc pas de risque de
# faux négatif côté scellé.
_JP_SEALED_SINGLE_CARD_RE = re.compile(r"#\S+\s*$")

# Cartes Energy japonaises sans code du tout (ni chiffre, ni suffixe #...) --
# constaté en conditions réelles sur des sets d'ère vintage (ex. "Rocket
# Gang", "Premium Champion Pack") où les Energy de base ("Water Energy",
# "Metal Energy", parfois "[Holo]") ni les Energy spéciales ("Full Heal
# Energy", "Rainbow Energy") ne portent aucun identifiant sur PriceCharting --
# les deux filtres ci-dessus (numéro, `#...`) ne peuvent donc rien y détecter.
# Aucun produit scellé observé (Pokémon comme One Piece) n'a "Energy" dans
# son nom, filtre sans risque de faux négatif côté scellé.
_JP_SEALED_ENERGY_RE = re.compile(r"\benergy\b", re.IGNORECASE)


def _set_label_from_code(set_code: str, tcg: str) -> str:
    """Dérive un libellé humain du set_code (aucun nom de set lisible n'est
    stocké ailleurs pour ces items -- ils ne viennent pas d'API TCG) : ex.
    'one-piece-a-fist-of-divine-speed' -> 'A Fist Of Divine Speed'. Purement
    cosmétique/recherche (ILIKE est insensible à la casse) : sert à préfixer
    le titre brut PriceCharting ("Booster Box") pour que la recherche par nom
    ("Fist of Divine Speed") retrouve aussi l'item JP, pas seulement son
    homonyme EN nommé via API TCG -- constaté en conditions réelles (le
    combobox de recherche ne remontait que l'EN, cf. discussion 2026-08-01).

    Le préfixe "jp-" est retiré s'il est présent : convention du set_code
    JP-natif Pokémon (`pokemon-jp-<slug>`, cf. PRICECHARTING_JP_SEALED_SLUGS)
    -- sans ce retrait le nom serait "Jp Vmax Climax ... [JP]", redondant
    avec le suffixe "[JP]" déjà ajouté par `_map_jp_sealed_row_to_item`. One
    Piece n'a pas ce préfixe (son set_code JP est celui de l'EN, réutilisé
    tel quel), donc rien à retirer pour ce TCG."""
    prefix = tcg + "-"
    bare = set_code[len(prefix):] if set_code.startswith(prefix) else set_code
    if bare.startswith("jp-"):
        bare = bare[len("jp-"):]
    return bare.replace("-", " ").title()


def _map_jp_sealed_row_to_item(tcg: str, set_code: str, row: dict) -> tuple:
    name = f"{_set_label_from_code(set_code, tcg)} {row['title']} [JP]"
    return (
        row["pricecharting_id"],  # external_id
        "pricecharting",          # source
        tcg,
        "sealed",                 # category
        set_code,
        name,
        row["image_url"],
        "JP",                     # language
    )


_UPSERT_JP_SEALED_ITEMS_SQL = """
    INSERT INTO items (external_id, source, tcg, category, set_code, name, image_url, language)
    VALUES %s
    ON CONFLICT (source, external_id) DO UPDATE SET
        name      = EXCLUDED.name,
        image_url = EXCLUDED.image_url
"""


def sync_jp_sealed_items_for_set(set_code: str, tcg: str, fetch_sales: bool = False) -> dict:
    """Crée/maj les items scellés JP d'un set depuis PriceCharting, puis écrit
    leur prix du jour -- pendant unique référentiel + prix pour ce cas
    (contrairement au flux EN où le référentiel vient d'API TCG et
    PriceCharting ne fait que recouper des items déjà là, cf.
    `sync_price_snapshots_for_set`). Un scellé se repère par l'absence de
    numéro de carte dans le titre (`_extract_number` + `_JP_SEALED_SINGLE_CARD_RE`,
    ce dernier élargissant la détection aux codes non numériques -- cf. son
    commentaire), moins les faux positifs connus (cf. `_JP_SEALED_TITLE_EXCLUDE_RE`).

    `fetch_sales=True` : pour chaque item, va aussi chercher sur sa page
    produit individuelle (1 requête HTTP de plus par item) son historique de
    ventes eBay/TCGPlayer (-> `sales`, filtré à grade='ungraded' -- le scellé
    n'a pas de gradation). Sans ça, la page Transactions (qui liste `sales`,
    pas `price_snapshots`) ne montre jamais ces items en parcours normal --
    seule la recherche par nom (`/api/items/search`, lit `items` directement)
    les remonte. Contrairement au flux EN où ceci est réservé aux runs
    `--tier` (catalogue EN trop gros pour du quotidien, cf. orchestrator.py),
    le catalogue JP reste petit (quelques centaines d'items, croissance lente
    au rythme des sorties de sets) : pas besoin d'un système de paliers, une
    requête/item/jour reste largement soutenable."""
    slug = PRICECHARTING_JP_SEALED_SLUGS.get(set_code)
    if not slug:
        raise ValueError(
            f"Pas de mapping PriceCharting JP pour set_code={set_code!r}. "
            f"Ajoute-le dans PRICECHARTING_JP_SEALED_SLUGS."
        )

    rows = fetch_all_console_rows(slug)
    sealed_rows = [
        r for r in rows
        if r["used_price"] is not None
        and _extract_number(r["title"]) is None
        and not _JP_SEALED_SINGLE_CARD_RE.search(r["title"])
        and not _JP_SEALED_ENERGY_RE.search(r["title"])
        and not _JP_SEALED_TITLE_EXCLUDE_RE.search(r["title"])
    ]

    conn = get_connection()
    try:
        item_rows = [_map_jp_sealed_row_to_item(tcg, set_code, r) for r in sealed_rows]
        if item_rows:
            with conn.cursor() as cur:
                execute_values(cur, _UPSERT_JP_SEALED_ITEMS_SQL, item_rows)
                conn.commit()

        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, external_id FROM items "
                "WHERE source = 'pricecharting' AND tcg = %s AND set_code = %s AND language = 'JP'",
                (tcg, set_code),
            )
            id_by_external = {ext: item_id for item_id, ext in cur.fetchall()}

        today = date.today()
        price_rows = [
            (id_by_external[r["pricecharting_id"]], today, r["used_price"], "USD", None, "pricecharting")
            for r in sealed_rows if r["pricecharting_id"] in id_by_external
        ]
        if price_rows:
            with conn.cursor() as cur:
                execute_values(cur, _UPSERT_PRICE_SNAPSHOTS_SQL, price_rows)
                conn.commit()

        sale_rows_written = 0
        if fetch_sales:
            detail_rows = [
                (id_by_external[r["pricecharting_id"]], r)
                for r in sealed_rows
                if r["pricecharting_id"] in id_by_external and r.get("url")
            ]
            with conn.cursor() as cur:
                for i, (item_id, row) in enumerate(detail_rows):
                    if i > 0:
                        time.sleep(MIN_SECONDS_BETWEEN_REQUESTS)
                    try:
                        details = fetch_card_details(row["url"])
                    except Exception as exc:
                        print(f"    ! erreur ventes {row['title']}: {exc}")
                        continue
                    sale_rows = [
                        (item_id, s["sale_date"], s["price"], "USD", s["grade"],
                         s["marketplace"], s["external_sale_id"], s["title"], "pricecharting")
                        for s in details["sales"] if s["grade"] == "ungraded"
                    ]
                    if sale_rows:
                        execute_values(cur, _UPSERT_SALES_SQL, sale_rows)
                        conn.commit()
                        sale_rows_written += len(sale_rows)
    finally:
        conn.close()

    return {
        "set_code": set_code,
        "pricecharting_slug": slug,
        "items_seen": len(sealed_rows),
        "prices_written": len(price_rows),
        "sale_rows_written": sale_rows_written,
    }


def sync_all_jp_sealed_items(tcg: str | None = None, fetch_sales: bool = False) -> list[dict]:
    """Boucle sur PRICECHARTING_JP_SEALED_SLUGS (One Piece + Pokémon, cf.
    commentaire du dict), même structure que `sync_all_mapped_sets` : pause
    polie entre sets, erreur capturée par set plutôt que d'interrompre le run."""
    set_codes = [
        sc for sc in PRICECHARTING_JP_SEALED_SLUGS
        if tcg is None or _tcg_from_set_code(sc) == tcg
    ]
    results = []
    for i, set_code in enumerate(set_codes):
        if i > 0:
            time.sleep(MIN_SECONDS_BETWEEN_REQUESTS)
        try:
            stats = sync_jp_sealed_items_for_set(set_code, _tcg_from_set_code(set_code), fetch_sales=fetch_sales)
            extra = f", {stats['sale_rows_written']} ventes" if fetch_sales else ""
            print(
                f"[{i+1}/{len(set_codes)}] {set_code} -> {stats['pricecharting_slug']}: "
                f"{stats['items_seen']} item(s) JP, {stats['prices_written']} prix{extra}"
            )
            results.append({**stats, "error": None})
        except Exception as exc:
            print(f"[{i+1}/{len(set_codes)}] {set_code}: ERREUR {exc}")
            results.append({"set_code": set_code, "error": str(exc)})
    return results


def main():
    import argparse

    from dotenv import load_dotenv

    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("--set-code", help="set_code interne (items.set_code). Omis => tous les sets mappés.")
    parser.add_argument("--tcg", default=None, help="Filtre optionnel (pokemon/one-piece) pour le mode bulk.")
    parser.add_argument(
        "--fetch-grades", action="store_true",
        help=(
            "Récupère aussi, par carte individuelle (1 requête/carte en plus, coûteux) : "
            "les prix PSA7-10 et l'historique de ventes eBay/TCGPlayer. Combiné à "
            "--jp-sealed, ne récupère que l'historique de ventes (pas de gradation "
            "pour le scellé)."
        ),
    )
    parser.add_argument(
        "--max-age-months", type=int, default=None,
        help="Mode bulk uniquement : ne garder que les sets avec un item sorti il y a au plus N mois.",
    )
    parser.add_argument(
        "--min-age-months", type=int, default=None,
        help="Mode bulk uniquement : ne garder que les sets dont le dernier item est sorti il y a plus de N mois.",
    )
    parser.add_argument(
        "--jp-sealed", action="store_true",
        help=(
            "Scellé JAPONAIS (PRICECHARTING_JP_SEALED_SLUGS) au lieu du flux EN habituel : "
            "crée les items directement depuis PriceCharting (One Piece + Pokémon)."
        ),
    )
    args = parser.parse_args()

    if args.jp_sealed:
        if args.set_code:
            tcg = args.tcg or _tcg_from_set_code(args.set_code)
            print(f"== Sync PriceCharting JP scellé pour set_code={args.set_code} (fetch_sales={args.fetch_grades}) ==")
            stats = sync_jp_sealed_items_for_set(args.set_code, tcg, fetch_sales=args.fetch_grades)
            print(f"Items JP: {stats['items_seen']}, prix écrits: {stats['prices_written']}, ventes: {stats['sale_rows_written']}")
            return

        scope = args.tcg or "tous"
        print(f"== Sync PriceCharting JP scellé (tcg={scope}, fetch_sales={args.fetch_grades}) ==")
        results = sync_all_jp_sealed_items(args.tcg, fetch_sales=args.fetch_grades)
        errors = [r for r in results if r["error"]]
        ok = [r for r in results if not r["error"]]
        print(f"\n=== Bilan : {len(ok)} sets OK, {len(errors)} erreurs ===")
        print(
            f"Total : {sum(r['items_seen'] for r in ok)} item(s) JP, "
            f"{sum(r['prices_written'] for r in ok)} prix écrits, "
            f"{sum(r['sale_rows_written'] for r in ok)} ventes écrites"
        )
        if errors:
            print("\nErreurs :")
            for r in errors:
                print(f"  {r['set_code']}: {r['error']}")
        return

    if args.set_code:
        tcg = args.tcg or _tcg_from_set_code(args.set_code)
        print(f"== Sync PriceCharting pour set_code={args.set_code} (fetch_grades={args.fetch_grades}) ==")
        stats = sync_price_snapshots_for_set(args.set_code, tcg, fetch_grades=args.fetch_grades)
        print(f"Scrapé: {stats['rows_scraped']}, matché: {stats['rows_matched']}, non-matché: {stats['rows_unmatched']}")
        if args.fetch_grades:
            print(
                f"Cartes traitées: {stats['cards_graded']}, lignes de prix gradés: {stats['grade_rows_written']}, "
                f"ventes archivées: {stats['sale_rows_written']}"
            )
        if stats["unmatched_titles"]:
            print("Non matchés:", stats["unmatched_titles"])
        return

    scope = args.tcg or "tous"
    print(
        f"== Sync PriceCharting (tcg={scope}, fetch_grades={args.fetch_grades}, "
        f"min_age_months={args.min_age_months}, max_age_months={args.max_age_months}) =="
    )
    results = sync_all_mapped_sets(
        args.tcg, fetch_grades=args.fetch_grades,
        min_age_months=args.min_age_months, max_age_months=args.max_age_months,
    )
    errors = [r for r in results if r["error"]]
    ok = [r for r in results if not r["error"]]
    total_scraped = sum(r["rows_scraped"] for r in ok)
    total_matched = sum(r["rows_matched"] for r in ok)
    print(f"\n=== Bilan : {len(ok)} sets OK, {len(errors)} erreurs ===")
    print(f"Total: {total_matched}/{total_scraped} lignes matchées ({total_matched/total_scraped:.0%})" if total_scraped else "Aucune ligne scrapée.")
    low_ratio = [r for r in ok if r["rows_scraped"] and r["rows_matched"] / r["rows_scraped"] < 0.3]
    if low_ratio:
        print(f"\nSets avec taux de match < 30% (mapping potentiellement faux, à vérifier) :")
        for r in low_ratio:
            print(f"  {r['set_code']} -> {r['pricecharting_slug']}: {r['rows_matched']}/{r['rows_scraped']}")
    if errors:
        print("\nErreurs :")
        for r in errors:
            print(f"  {r['set_code']}: {r['error']}")


if __name__ == "__main__":
    main()
