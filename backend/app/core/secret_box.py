"""Cifra simétrica (Fernet) para segredos guardados no banco, como o token de negócio do WhatsApp de cada loja.

A chave vem de `WHATSAPP_TOKEN_ENCRYPTION_KEY` (chave Fernet) ou, se vazia, é derivada do `SECRET_KEY`.
Texto cifrado nunca deve ir para resposta de API nem para log; quem precisa do segredo chama `decrypt` na hora do uso.
"""
import base64
import hashlib
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def _fernet() -> Fernet:
    key = (settings.WHATSAPP_TOKEN_ENCRYPTION_KEY or "").strip()
    if key:
        return Fernet(key.encode())
    derived = hashlib.sha256(("provador-secret-box:" + settings.SECRET_KEY).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(derived))


def encrypt(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt(token: Optional[str]) -> Optional[str]:
    """Devolve o texto ou None (vazio, chave trocada, conteúdo adulterado). Nunca levanta erro."""
    if not token:
        return None
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, ValueError):
        return None
