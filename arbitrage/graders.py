"""Détection du grader (BGS/CGC/PSA) et de la note dans un titre d'annonce.

Pure (pas de DB, pas de réseau). Conservateur par construction : au moindre
doute (deux graders dans le titre, deux notes différentes pour le même
grader, label premium) on renvoie None plutôt que de deviner -- une fausse
alerte Discord coûte plus cher qu'une opportunité ratée.

Limite connue : seule la forme "GRADER NOTE" est reconnue ("BGS 9.5",
"Beckett Gem Mint 9,5", "CGC Pristine 10"). "10 BGS" (note avant le grader)
n'est pas gérée, faute de motif fiable qui ne confonde pas avec un numéro de
carte.
"""
import re
from dataclasses import dataclass

_GRADER_NAMES = {
    "bgs": r"(?:bgs|beckett|bccg)",
    "cgc": r"cgc",
    "psa": r"psa",
}

# Mots facultatifs entre le nom du grader et la note ("cgc pristine 10",
# "beckett gem mint 9.5", "bgs grading 10") -- au plus 3 pour ne pas courir
# après une note perdue loin dans le titre.
_FILLER = (
    r"(?:\s*(?:grading|cards?|graded|pristine|gem\s*mint|gem|mint|"
    r"black\s*label|gold\s*label|silver\s*label|perfect|nm[-\s]?mt|near\s*mint)){0,3}\s*[-:#]?\s*"
)
_GRADE = r"(\d{1,2}(?:[.,]\d)?)"

# `(?![a-z])` plutôt que `\b` après le nom : les titres collent souvent la
# note ("BGS10", "CGC9.5") et il n'y a pas de frontière de mot lettre/chiffre.
_PATTERNS = {
    grader: re.compile(rf"\b{names}(?![a-z]){_FILLER}{_GRADE}\b", re.IGNORECASE)
    for grader, names in _GRADER_NAMES.items()
}

# Labels premium : le prix d'un BGS Black Label ou d'un CGC Perfect 10 n'a
# aucun rapport avec celui d'un 10 "normal" (bien au-dessus d'un PSA 10) --
# les comparer à PSA 10 produirait de fausses alertes dans l'autre sens.
_PREMIUM_LABEL = re.compile(r"black\s*label|perfect\s*10", re.IGNORECASE)


@dataclass(frozen=True)
class Slab:
    grader: str          # 'psa' | 'bgs' | 'cgc'
    grade: float
    premium_label: bool


def _parse_grade(raw: str) -> float | None:
    value = float(raw.replace(",", "."))
    if not 1 <= value <= 10:
        return None
    # Seules les notes entières et x.5 existent chez les 3 graders ici
    # (BGS a des demi-points, pas de .3/.7) -- un "9.7" est un autre motif
    # (sous-note, année...), pas une note.
    if value * 2 != int(value * 2):
        return None
    return value


def parse_slab(title: str | None) -> Slab | None:
    if not title:
        return None
    found: dict[str, set[float]] = {}
    for grader, pattern in _PATTERNS.items():
        for match in pattern.finditer(title):
            grade = _parse_grade(match.group(1))
            if grade is not None:
                found.setdefault(grader, set()).add(grade)
    if len(found) != 1:
        return None  # aucun grader lisible, ou plusieurs (ex. "CGC 9 ... PSA 10")
    grader, grades = next(iter(found.items()))
    if len(grades) != 1:
        return None
    return Slab(grader=grader, grade=next(iter(grades)), premium_label=bool(_PREMIUM_LABEL.search(title)))
