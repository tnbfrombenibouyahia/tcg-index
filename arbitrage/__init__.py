"""Alertes d'arbitrage inter-graders : repère les slabs BGS (Beckett) / CGC
dont le prix d'annonce est sous ce que vaudrait la même carte chez PSA, et
les poste dans un salon Discord (webhook). Formule : arbitrage/economics.py ;
orchestration : arbitrage/job.py (Cloud Run Job, même image que l'ingestion --
flag `--arbitrage-alerts` de ingestion.orchestrator).
"""
