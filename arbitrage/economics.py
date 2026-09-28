"""Le signal d'arbitrage : un slab BGS/CGC vendu X, regradé chez PSA, vaut-il
le coup ?

Pure (pas de DB, pas de réseau). Volontairement SANS taux de réussite
supposé : aucune donnée du repo ne mesure P(PSA 10 | BGS/CGC 10), l'inventer
donnerait un faux air de précision. À la place on calcule la probabilité de
PSA 10 dont on aurait BESOIN pour être à l'équilibre -- au lecteur de juger
si elle est réaliste pour cette carte :

    coût_total    = prix_annonce + livraison + frais_PSA + frais_divers
    équilibre_p10 = (coût_total - PSA9) / (PSA10 - PSA9)      borné à [0, 1]

Hypothèse assumée et affichée dans l'alerte : le regrade donne PSA 10 ou
PSA 9. Un PSA 8 ou moins, ou une carte abîmée à l'ouverture de la coque, est
une perte que ce calcul ne modélise pas. `équilibre_p10 = 0` signifie que
même un PSA 9 rembourse l'achat ("plancher couvert").

Tous les montants sont en USD (devise de price_snapshots) : la conversion des
prix d'annonce en EUR/GBP/... est faite en amont (cf. arbitrage/fx.py).

(Nommé economics et non signal : un `arbitrage/signal.py` masquerait le
module standard `signal` dès que le dossier arbitrage/ passe en tête de
sys.path, ex. `python arbitrage/job.py`.)
"""
import os
from dataclasses import dataclass

# Miroir de PSA_SERVICE_TIERS (extension/lib/gradingRoi.js, web/lib/constants.ts)
# -- dupliqué faute de module de constantes partagé Python/JS, même situation
# que pricing/models.py::KNOWN_GRADES. (nom, frais USD, valeur déclarée max USD)
PSA_SERVICE_TIERS = (
    ("Value", 30.0, 499.0),
    ("Value Plus", 50.0, 999.0),
    ("Regular", 80.0, 1500.0),
    ("Express", 150.0, 2499.0),
    ("Super Express", 349.0, 9999.0),
    ("Walk-Through", 599.0, 24999.0),
)


def psa_service_tier(declared_value_usd: float) -> tuple[str, float]:
    """Premier palier PSA dont le plafond de valeur déclarée couvre la carte.
    Au-delà du dernier plafond on garde le dernier palier (cas hors barème,
    à traiter à la main de toute façon)."""
    for name, fee, max_value in PSA_SERVICE_TIERS:
        if declared_value_usd <= max_value:
            return name, fee
    name, fee, _ = PSA_SERVICE_TIERS[-1]
    return name, fee


@dataclass(frozen=True)
class Opportunity:
    buy_total_usd: float     # prix d'annonce + livraison annonce
    fee_tier: str
    fee_usd: float
    extra_costs_usd: float
    total_cost_usd: float
    psa9_usd: float
    psa10_usd: float
    multiple: float          # PSA 10 / buy_total : le "×N" affiché
    breakeven_p10: float     # 0..1 (peut être 1.0 = pas rentable même à coup sûr)
    floor_covered: bool      # coût_total <= PSA 9


def evaluate(*, buy_total_usd: float, psa9_usd: float, psa10_usd: float,
             extra_costs_usd: float = 20.0) -> Opportunity | None:
    """None si les entrées n'ont pas de sens (prix nuls, PSA 10 <= PSA 9 --
    pas d'upside à chasser)."""
    if buy_total_usd <= 0 or psa9_usd <= 0 or psa10_usd <= psa9_usd:
        return None
    # Valeur déclarée = celle du meilleur résultat espéré (PSA 10) : déclarer
    # moins pour tomber dans un palier moins cher fausserait le calcul.
    tier, fee = psa_service_tier(psa10_usd)
    total_cost = buy_total_usd + fee + extra_costs_usd
    breakeven = (total_cost - psa9_usd) / (psa10_usd - psa9_usd)
    return Opportunity(
        buy_total_usd=buy_total_usd,
        fee_tier=tier,
        fee_usd=fee,
        extra_costs_usd=extra_costs_usd,
        total_cost_usd=total_cost,
        psa9_usd=psa9_usd,
        psa10_usd=psa10_usd,
        multiple=psa10_usd / buy_total_usd,
        breakeven_p10=min(1.0, max(0.0, breakeven)),
        floor_covered=total_cost <= psa9_usd,
    )


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    return float(raw) if raw not in (None, "") else default


@dataclass(frozen=True)
class Thresholds:
    """Seuils d'alerte -- tous surchargeables par variable d'environnement
    (cf. .env.example), pour recalibrer sans redéployer le code."""
    max_breakeven_p10: float = 0.25   # au-delà, il faudrait trop de chance pour rentrer dans ses frais
    # PSA 10 / prix d'achat minimum. 3.0 au départ, ramené à 2.0 après un
    # échantillon réel (eBay.fr, 120 cartes One Piece, 2026-09-28) où un CGC 10 à
    # 144 EUR (équilibre 13 %, multiple x2,97) était écarté pour 0,03 : le vrai
    # critère économique est `max_breakeven_p10`, le multiple n'est qu'un
    # plancher d'upside.
    min_multiple: float = 2.0
    min_price_ratio: float = 0.20     # prix d'achat / PSA 9 : en dessous, presque sûrement une autre carte/une contrefaçon
    min_psa9_usd: float = 25.0
    min_psa10_usd: float = 100.0
    min_psa_spread: float = 2.0       # PSA 10 / PSA 9 minimum pour être candidate (pré-filtre SQL)
    max_psa_age_days: int = 90        # prix PSA plus vieux = probablement périmé (rotation par palier d'âge)
    extra_costs_usd: float = 20.0     # envoi vers PSA + retour + emballage (même défaut que l'extension)
    allowed_grades: tuple[float, ...] = (9.5, 10.0)

    @classmethod
    def from_env(cls) -> "Thresholds":
        d = cls()
        grades_raw = os.environ.get("ARBITRAGE_ALLOWED_GRADES")
        # Liste séparée par des virgules, décimale au point ("9.5,10") : la
        # virgule ne peut pas servir aux deux ("9,5" serait lu 9 et 5).
        grades = (
            tuple(float(g) for g in grades_raw.split(",") if g.strip())
            if grades_raw else d.allowed_grades
        )
        return cls(
            max_breakeven_p10=_env_float("ARBITRAGE_MAX_BREAKEVEN_P10", d.max_breakeven_p10),
            min_multiple=_env_float("ARBITRAGE_MIN_MULTIPLE", d.min_multiple),
            min_price_ratio=_env_float("ARBITRAGE_MIN_PRICE_RATIO", d.min_price_ratio),
            min_psa9_usd=_env_float("ARBITRAGE_MIN_PSA9_USD", d.min_psa9_usd),
            min_psa10_usd=_env_float("ARBITRAGE_MIN_PSA10_USD", d.min_psa10_usd),
            min_psa_spread=_env_float("ARBITRAGE_MIN_PSA_SPREAD", d.min_psa_spread),
            max_psa_age_days=int(_env_float("ARBITRAGE_MAX_PSA_AGE_DAYS", d.max_psa_age_days)),
            extra_costs_usd=_env_float("ARBITRAGE_EXTRA_COSTS_USD", d.extra_costs_usd),
            allowed_grades=grades,
        )


def is_alert_worthy(opp: Opportunity, t: Thresholds) -> bool:
    return (
        opp.breakeven_p10 <= t.max_breakeven_p10
        and opp.multiple >= t.min_multiple
        and opp.buy_total_usd >= t.min_price_ratio * opp.psa9_usd
    )


# ---------------------------------------------------------------------------
# Rotation par tranche (cf. handoff §02, "Rotation par item")
# ---------------------------------------------------------------------------

def select_slice(items: list, max_items: int | None, now_epoch: float, slice_seconds: int = 3600) -> list:
    """Si le pool tient dans le budget, tout est traité. Sinon on découpe en
    tranches consécutives et on en choisit une par fonction STABLE du temps
    (pas d'état stocké) : une exécution horaire avance d'une tranche à
    chaque heure, tout le pool est couvert en `n_slices` heures. `items` doit
    arriver dans un ordre stable (ORDER BY id) pour que les tranches ne
    bougent pas d'un run à l'autre."""
    if not max_items or max_items <= 0 or len(items) <= max_items:
        return items
    n_slices = -(-len(items) // max_items)  # division plafond
    idx = int(now_epoch // slice_seconds) % n_slices
    return items[idx * max_items:(idx + 1) * max_items]
