"""Vérification des jetons d'identité Firebase envoyés par l'extension
navigateur (cf. extension/lib/auth.js) -- "compte requis avant toute
utilisation" (tcg-index-handoff.md §01/§09), appliqué ici côté serveur,
pas seulement comme un mur d'UX côté extension.

Vérification via l'API REST Identity Toolkit (accounts:lookup) plutôt
qu'une vérification JWT locale (récupération des clés publiques Google,
contrôle de signature/expiration/audience à la main) : un appel réseau de
plus par requête `/verdict`, mais Google fait exactement la même
validation cryptographique en interne, sans dépendance supplémentaire
(firebase-admin, PyJWT) -- cohérent avec le reste de ce repo, qui n'utilise
que `requests` face aux API GCP (cf. pricing/ocr.py, ingestion/sources/*).
"""
import os

import requests

_LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup"
_REQUEST_TIMEOUT_SECONDS = 5


def verify_id_token(id_token: str) -> dict | None:
    """{'uid': ..., 'email': ...} si le jeton est valide (signature,
    expiration et projet cible tous vérifiés par Google), sinon None.

    Ne lève jamais : un jeton invalide/expiré est un cas attendu (session
    expirée côté extension, refresh pas encore tenté), pas une erreur
    serveur -- à l'appelant (pricing_api) de traduire None en 401."""
    api_key = os.environ.get("FIREBASE_WEB_API_KEY")
    if not api_key or not id_token:
        return None
    try:
        resp = requests.post(_LOOKUP_URL, params={"key": api_key},
                              json={"idToken": id_token}, timeout=_REQUEST_TIMEOUT_SECONDS)
    except requests.RequestException:
        return None
    if resp.status_code != 200:
        return None

    users = resp.json().get("users") or []
    if not users:
        return None
    user = users[0]
    return {"uid": user["localId"], "email": user.get("email")}
