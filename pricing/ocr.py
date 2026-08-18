"""OCR -- premier passage de la cascade d'identification par image (cf.
tcg-index-handoff.md §01). Google Cloud Vision TEXT_DETECTION, palier
gratuit réel (1000 unités/mois) -- appelé uniquement en repli, quand
`text` est absent (cf. pricing/matching.py::identify_card), jamais en
proactif sur un catalogue entier.

Authentification par clé API (cf. .env.example, GOOGLE_CLOUD_VISION_API_KEY),
même convention que les autres sources du repo (ingestion/sources/apitcg.py,
ebay.py) -- pas le SDK google-cloud-vision (grpc/protobuf, lourd pour un
seul endpoint REST appelé à la demande).

Pas de 3ᵉ passage vision multimodal ici (cf. handoff §01) : si TEXT_DETECTION
ne trouve rien, identify_card retombe sur `not_found` plutôt que d'escalader
vers un modèle payant.
"""
import os

import requests

VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate"
_REQUEST_TIMEOUT_SECONDS = 10


def extract_text_from_image(image_url: str) -> str | None:
    """Texte détecté sur l'image (annonce eBay/Vinted/Cardmarket, URL
    publique -- Cloud Vision va la chercher lui-même via `imageUri`, pas de
    téléchargement/encodage base64 côté client).

    None si : clé API absente, aucun texte détecté, ou l'appel échoue
    (réseau, quota, image invalide, URL inaccessible) -- jamais d'exception :
    identify_card retombe sur `not_found` plutôt que de casser le verdict
    pour un OCR raté, même philosophie que le reste du module matching."""
    api_key = os.environ.get("GOOGLE_CLOUD_VISION_API_KEY")
    if not api_key:
        return None

    payload = {
        "requests": [{
            "image": {"source": {"imageUri": image_url}},
            "features": [{"type": "TEXT_DETECTION"}],
        }]
    }
    try:
        resp = requests.post(VISION_API_URL, params={"key": api_key}, json=payload,
                              timeout=_REQUEST_TIMEOUT_SECONDS)
        resp.raise_for_status()
    except requests.RequestException:
        return None

    responses = resp.json().get("responses") or [{}]
    result = responses[0]
    if "error" in result:
        return None

    annotations = result.get("textAnnotations")
    if not annotations:
        return None
    # Premier élément = texte complet détecté sur l'image (les suivants sont
    # les mots individuels avec leurs coordonnées, non utiles ici).
    return annotations[0].get("description") or None
