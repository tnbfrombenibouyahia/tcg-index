"""Taux de change vers USD, pour comparer un prix d'annonce en EUR/GBP/... aux
prix PSA de la base (USD, PriceCharting).

Frankfurter (taux BCE, gratuit, sans clé) -- même source que
extension/lib/fx.js. Aucune valeur de repli codée en dur : si le taux ne
peut pas être lu, on lève une exception plutôt que de comparer avec un taux
inventé (une alerte Discord fausse est pire qu'un run raté).
"""
import requests

FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest"

_cache: dict[str, float] = {}


def usd_per_unit(currency: str) -> float:
    """USD obtenus pour 1 unité de `currency` (1.0 pour USD). Mis en cache le
    temps du process : un run dure quelques minutes, le taux BCE ne bouge
    qu'une fois par jour."""
    code = (currency or "").upper()
    if code == "USD":
        return 1.0
    if code in _cache:
        return _cache[code]
    resp = requests.get(FRANKFURTER_URL, params={"from": code, "to": "USD"}, timeout=10)
    resp.raise_for_status()
    rate = float(resp.json()["rates"]["USD"])
    _cache[code] = rate
    return rate
