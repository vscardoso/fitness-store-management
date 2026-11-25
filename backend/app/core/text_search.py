"""Busca que ignora acento e maiúscula ("Tenis" acha "Tênis", "acai" acha "Açaí").

No PostgreSQL a coluna passa por `translate(lower(coluna), ...)`; no SQLite (testes e dev) por uma função `fold` registrada em
toda conexão. O texto digitado passa pelo mesmo dobramento em Python, então os dois lados ficam iguais.
"""
import unicodedata

from sqlalchemy import event, func
from sqlalchemy.engine import Engine

_FROM = "áàâãäåéèêëíìîïóòôõöúùûüçñ"
_TO = "aaaaaaeeeeiiiiooooouuuucn"


def fold_text(value: str | None) -> str:
    """Minúsculo e sem acento (para o texto digitado e para a função do SQLite)."""
    if value is None:
        return ""
    decomposed = unicodedata.normalize("NFKD", str(value).lower())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


@event.listens_for(Engine, "connect")
def _register_fold(dbapi_connection, connection_record):  # noqa: ARG001
    create = getattr(dbapi_connection, "create_function", None)
    if create is not None:        # só o SQLite (inclusive o adaptador assíncrono) tem create_function
        create("fold", 1, fold_text, deterministic=True)


def folded(column, dialect_name: str):
    """Expressão da coluna já sem acento e minúscula, para comparar com `fold_text(texto digitado)`."""
    if dialect_name == "postgresql":
        return func.translate(func.lower(column), _FROM, _TO)
    return func.fold(column)
