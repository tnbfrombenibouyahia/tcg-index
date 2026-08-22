"""Ingrédients bruts du calculateur ROI de gradation (demande utilisateur,
extension) -- PAS le calcul (EV/coût/ROI), qui reste 100% côté client pour
rester recalculable en live quand l'utilisateur change ses hypothèses (même
philosophie que web/lib/gradingRoi.ts, cf. index/grading_roi_inputs.py :
"Ne calcule PAS le ROI... doit rester recalculable en live côté client").

Port direct de la table `grading_roi_inputs` (matérialisée une fois par run
--tier, cf. index/grading_roi_inputs.py -- jamais par le run quotidien,
donc peut être absente pour une carte pas encore repassée dans son palier).
Aucune fonction "compute" ici, contrairement à sales_stats.py/liquidity.py :
il n'y a rien à décider côté serveur, juste des données à faire suivre.
"""
from dataclasses import dataclass, field

GRADED_TIERS = ("psa7", "psa8", "psa9", "psa9.5", "psa10")


@dataclass
class GradingRoiInputs:
    ungraded_price: float
    # Seuls les grades avec un prix réellement connu sont présents (ex. pas
    # de psa9.5 si jamais scrapé pour cette carte) -- jamais un prix inventé.
    grade_prices: dict[str, float] = field(default_factory=dict)
    # 'card' | 'set_rarity' | 'set' | 'tcg' -> {grade: count}. Cascade de
    # repli identique à resolveGradeDistribution (web/lib/gradingRoi.ts),
    # appliquée côté client (extension ET site), jamais ici.
    grade_counts: dict[str, dict[str, int]] = field(default_factory=dict)
