"""Envoi des alertes dans un salon Discord via webhook (pas de bot, pas de
process permanent : un simple POST depuis le Cloud Run Job).

Limites Discord respectées : 10 embeds et ~6000 caractères par message
(on envoie par lots de 5), titre <= 256, valeur de champ <= 1024.
"""
import time
from datetime import datetime, timezone
from typing import Callable

import requests

from arbitrage.models import Alert

_CHUNK = 5
_MAX_RETRIES = 3
_GRADER_LABEL = {"bgs": "BGS", "cgc": "CGC"}
_SYMBOLS = {"EUR": "€", "USD": "$", "GBP": "£"}
# Pays de l'UE (codes ISO) : au-delà, un achat eBay peut supporter TVA/droits
# d'import que le coût total n'inclut pas. Le salon vise des acheteurs
# français (ARBITRAGE_BUYER_COUNTRY=FR par défaut) -- pour un acheteur hors UE
# cet avertissement serait à revoir.
EU_COUNTRIES = frozenset({
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
    "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
})
_COLOR_FLOOR_COVERED = 0x2ECC71   # vert : même un PSA 9 rembourse l'achat
_COLOR_SPECULATIVE = 0xF1C40F     # jaune : il faut un PSA 10 pour gagner

_FOOTER = (
    "CardQuant · Hypothèse : le regrade donne PSA 10 ou PSA 9. Un PSA 8 ou moins, "
    "ou une carte abîmée à l'ouverture de la coque, est une perte. Pas un conseil financier."
)


def fmt_money(amount: float, currency: str) -> str:
    """Format français : "1 850,00 €"."""
    text = f"{amount:,.2f}".replace(",", " ").replace(".", ",")
    return f"{text} {_SYMBOLS.get(currency, currency)}"


def fmt_grade(grade: float) -> str:
    return str(int(grade)) if grade == int(grade) else f"{grade:g}"


def _clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1] + "…"


def build_embed(alert: Alert) -> dict:
    opp, card = alert.opportunity, alert.candidate
    cur, rate = alert.currency, alert.usd_per_unit
    to_local = lambda usd: usd / rate  # noqa: E731 -- USD -> devise de l'annonce

    price_line = fmt_money(alert.price, cur)
    if alert.shipping is None:
        price_line += " · livraison non précisée"
    elif alert.shipping == 0:
        price_line += " · livraison gratuite"
    else:
        price_line += f" + {fmt_money(alert.shipping, cur)} de livraison"

    if opp.floor_covered:
        breakeven = "Plancher couvert : même un PSA 9 rembourse l'achat et les frais."
    else:
        breakeven = f"Il suffit de **{opp.breakeven_p10 * 100:.0f} %** de chances d'obtenir un PSA 10 pour rentrer dans ses frais."
    breakeven += (
        f"\nCoût total estimé : {fmt_money(to_local(opp.total_cost_usd), cur)} "
        f"(achat + PSA {opp.fee_tier} {fmt_money(to_local(opp.fee_usd), cur)} "
        f"+ divers {fmt_money(to_local(opp.extra_costs_usd), cur)})"
    )

    seller = alert.seller or "vendeur inconnu"
    if alert.seller_feedback_pct is not None:
        seller += f" ({alert.seller_feedback_pct:g}".replace(".", ",") + " % positifs)"
    if alert.item_country:
        seller += f" · expédié depuis {alert.item_country}"
        if alert.item_country not in EU_COUNTRIES:
            seller += "\n⚠️ Hors UE : TVA et droits d'import possibles, non inclus dans le coût total."

    set_label = (card.set_code or "").replace("-", " ").title()
    description = " · ".join(p for p in (card.code, set_label, card.language) if p)

    embed = {
        "title": _clip(f"{card.name} — {_GRADER_LABEL[alert.grader]} {fmt_grade(alert.grade)}", 256),
        "url": alert.url,
        "description": _clip(description, 4096),
        "color": _COLOR_FLOOR_COVERED if opp.floor_covered else _COLOR_SPECULATIVE,
        "fields": [
            {"name": "🛒 Prix", "value": _clip(price_line, 1024), "inline": True},
            {
                "name": "🎯 PSA 9 / PSA 10",
                "value": f"{fmt_money(to_local(opp.psa9_usd), cur)} / {fmt_money(to_local(opp.psa10_usd), cur)}",
                "inline": True,
            },
            {"name": "📈 Multiple", "value": f"×{opp.multiple:.1f} (PSA 10 / prix)", "inline": True},
            {"name": "⚖️ Seuil de rentabilité", "value": _clip(breakeven, 1024), "inline": False},
            {"name": "🏪 Vendeur", "value": _clip(seller, 1024), "inline": True},
            {
                "name": "🕒 Prix PSA",
                "value": f"PriceCharting, relevé du {card.psa10_date:%d/%m/%Y}",
                "inline": True,
            },
        ],
        "footer": {"text": _clip(_FOOTER, 2048)},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if alert.image_url:
        embed["image"] = {"url": alert.image_url}
    if card.image_url:
        embed["thumbnail"] = {"url": card.image_url}
    return embed


def _post(webhook_url: str, payload: dict) -> None:
    for attempt in range(1, _MAX_RETRIES + 1):
        resp = requests.post(webhook_url, json=payload, timeout=15)
        if resp.status_code == 429 and attempt < _MAX_RETRIES:
            try:
                wait = float(resp.json().get("retry_after", 1.0))
            except ValueError:
                wait = 1.0
            time.sleep(min(wait, 30.0))
            continue
        resp.raise_for_status()
        return


def post_alerts(
    webhook_url: str,
    alerts: list[Alert],
    *,
    on_posted: Callable[[list[Alert]], None] | None = None,
) -> int:
    """Poste les alertes par lots. `on_posted` est appelé après CHAQUE lot
    réussi (pas à la fin) : si un lot ultérieur échoue, les alertes déjà
    parties sont déjà enregistrées et ne seront pas reposées au run suivant.
    Retourne le nombre d'alertes postées."""
    posted = 0
    for i in range(0, len(alerts), _CHUNK):
        chunk = alerts[i:i + _CHUNK]
        _post(webhook_url, {
            "username": "CardQuant Arbitrage",
            "embeds": [build_embed(a) for a in chunk],
            "allowed_mentions": {"parse": []},  # jamais de @everyone/@role par accident via un titre d'annonce
        })
        posted += len(chunk)
        if on_posted is not None:
            on_posted(chunk)
        time.sleep(1.0)  # politesse envers le rate-limit du webhook (5 requêtes / 2 s)
    return posted
