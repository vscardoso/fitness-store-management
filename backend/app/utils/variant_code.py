"""Código da peça na etiqueta: produto + variação ("#101-1"). Funções puras, sem banco."""
import re
from typing import Optional, Tuple

_PAIR_RE = re.compile(r"^\s*(?:PV)?#?\s*0*(\d{1,9})\s*-\s*0*(\d{1,6})\s*$", re.IGNORECASE)


def format_variant_code(product_code: Optional[int], variant_number: Optional[int]) -> Optional[str]:
    """(101, 1) -> '#101-1'; produto com menos de 3 dígitos ganha zeros: (7, 2) -> '#007-2'."""
    if not product_code or not variant_number:
        return None
    return f"#{product_code:03d}-{variant_number}"


def variant_qr_payload(product_code: int, variant_number: int) -> str:
    """O que vai no QR: 'PV#101-1'."""
    return f"PV#{product_code:03d}-{variant_number}"


def parse_variant_code(text: Optional[str]) -> Optional[Tuple[int, int]]:
    """'PV#101-1', '#101-1', '101-1', '7-2' -> (produto, variação); qualquer outra coisa -> None."""
    if not text:
        return None
    m = _PAIR_RE.match(str(text))
    if not m:
        return None
    p, v = int(m.group(1)), int(m.group(2))
    return (p, v) if p > 0 and v > 0 else None
