"""
Normalização e ordenação de tamanho/cor das variantes (grade de moda).

Evita duplicatas por caixa/espaço ("p", " P ", "Preto", "preto") e garante
a ordem natural dos tamanhos na grade (PP, P, M, G, GG, XG, 34, 36, 38...).
"""
import re
from typing import Iterable, List, Optional

_ALPHA_ORDER = [
    "UNICO", "XXS", "XS", "PP", "P", "M", "G", "GG", "XG", "XGG", "EXG",
    "XXG", "G1", "G2", "G3", "G4",
]
_ALPHA_RANK = {s: i for i, s in enumerate(_ALPHA_ORDER)}

_SIZE_ALIASES = {
    "U": "UNICO",
    "UN": "UNICO",
    "UNICO": "UNICO",
    "UNIC": "UNICO",
    "TAMANHO UNICO": "UNICO",
    "S": "P",
    "L": "G",
    "XL": "XG",
    "XXL": "XXG",
}

# Cores com preposição ficam minúsculas ("Azul de Prússia", "Verde e Preto")
_LOWER_WORDS = {"de", "da", "do", "e", "com"}


def _strip_accents_upper(text: str) -> str:
    table = str.maketrans("ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ", "AAAAAEEEEIIIIOOOOOUUUUC")
    return text.upper().translate(table)


def normalize_size(value: Optional[str]) -> Optional[str]:
    """'  p ' -> 'P'; 'único' -> 'ÚNICO'; '38' -> '38'; vazio -> None."""
    if value is None:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip()
    if not cleaned:
        return None
    key = _strip_accents_upper(cleaned)
    # Tamanho composto ("p / m", "m-g", "G\GG") vira "P/M", "M/G", "G/GG"; cada parte segue os apelidos (S/M -> P/M)
    parts = [p.strip() for p in re.split(r"\s*[/\\-]\s*", key) if p.strip()]
    if len(parts) > 1:
        return "/".join("ÚNICO" if _SIZE_ALIASES.get(p, p) == "UNICO" else _SIZE_ALIASES.get(p, p) for p in parts)
    key = _SIZE_ALIASES.get(key, key)
    if key == "UNICO":
        return "ÚNICO"
    return key


def normalize_color(value: Optional[str]) -> Optional[str]:
    """'  azul   marinho ' -> 'Azul Marinho'; vazio -> None."""
    if value is None:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip()
    if not cleaned:
        return None
    words = []
    for i, word in enumerate(cleaned.lower().split(" ")):
        words.append(word if (i > 0 and word in _LOWER_WORDS) else word[:1].upper() + word[1:])
    return " ".join(words)


def size_sort_key(size: Optional[str]):
    """Ordem natural: letras (PP..XGG), depois numéricos, depois o resto, sem tamanho por último."""
    if size is None:
        return (3, 0, "")
    key = _strip_accents_upper(size)
    key = _SIZE_ALIASES.get(key, key)
    if key in _ALPHA_RANK:
        return (0, _ALPHA_RANK[key], "")
    # P/M, M/G, G/GG ficam entre os dois tamanhos que juntam (P < P/M < M)
    parts = [_SIZE_ALIASES.get(p, p) for p in key.split("/")]
    if len(parts) > 1 and all(p in _ALPHA_RANK for p in parts):
        return (0, sum(_ALPHA_RANK[p] for p in parts) / len(parts), "")
    match = re.fullmatch(r"(\d+)(?:[/-](\d+))?", key)
    if match:
        return (1, int(match.group(1)), match.group(2) or "")
    return (2, 0, key)


def sort_sizes(sizes: Iterable[Optional[str]]) -> List[str]:
    """Tamanhos únicos, sem None, em ordem natural."""
    unique = {s for s in sizes if s}
    return sorted(unique, key=size_sort_key)


def sort_colors(colors: Iterable[Optional[str]]) -> List[str]:
    unique = {c for c in colors if c}
    return sorted(unique, key=lambda c: _strip_accents_upper(c))


def normalize_gender(value: Optional[str]) -> Optional[str]:
    """'feminina' -> 'Feminino'; 'MASCULINO' -> 'Masculino'. Outros valores (ex.: 'Unissex')
    são mantidos com a primeira letra maiúscula; vazio -> None."""
    if value is None:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip()
    if not cleaned:
        return None
    key = _strip_accents_upper(cleaned)
    if key.startswith("FEM"):
        return "Feminino"
    if key.startswith("MASC"):
        return "Masculino"
    return cleaned[:1].upper() + cleaned[1:]
