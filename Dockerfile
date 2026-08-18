# Image d'ingestion -- Cloud Run Jobs (cf. cardquant-handoff-adapte.md §04,
# remplace les 6 workflows .github/workflows/*.yml). Un seul point d'entrée
# (ingestion.orchestrator) : le choix entre daily/tier/ebay-listings/items/
# population/rarity-backfill se fait via les arguments passés à `docker run`
# (ou l'override --args d'un Cloud Run Job), pas via 6 images séparées.
#
# `pricing_api/` et `web/` ne sont pas embarqués ici -- image dédiée à
# l'ingestion (Cloud Run Job), séparée du service pricing_api (Cloud Run
# service, cf. §05 de la feuille de route).
FROM python:3.12-slim

# Sans TTY (cas de Cloud Run Jobs), Python bufferise stdout par bloc au lieu
# de ligne par ligne -- les print() de l'orchestrateur restent coincés en
# mémoire et n'atteignent jamais Cloud Logging tant que le buffer ne se vide
# pas. Constaté 2026-08-16 : job eBay tué au timeout (60 min) sans une seule
# ligne de log, impossible de savoir où il en était. PYTHONUNBUFFERED=1 force
# un flush immédiat, comme en local (terminal = déjà non-bufferisé par défaut).
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Couche dépendances séparée de la couche code : rebuild rapide quand seul le
# code change (cache Docker), requirements.txt bouge rarement.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared/ shared/
COPY ingestion/ ingestion/
COPY index/ index/

# Pas de CMD par défaut : Cloud Run Jobs fournit les arguments (--skip-items,
# --tier hot, --ebay-listings, --items-only, --population, --rarity-backfill)
# via l'override de conteneur à chaque exécution planifiée, cf. commande
# `gcloud run jobs create --args=...` / Cloud Scheduler.
ENTRYPOINT ["python", "-m", "ingestion.orchestrator"]
