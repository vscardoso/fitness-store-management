"""
Factory de providers de pagamento.

Uso:
    from app.services.payment_providers.factory import get_terminal_provider, get_pix_provider

    provider = get_terminal_provider("mercadopago")
    await provider.create_payment(db, ...)
"""
from typing import Dict, List, Type
from .base import BaseTerminalProvider, BasePixProvider

# Lazy imports para evitar circular
_terminal_cache: Dict[str, BaseTerminalProvider] = {}
_pix_cache: Dict[str, BasePixProvider] = {}


def _get_terminal_class(provider: str) -> Type[BaseTerminalProvider]:
    if provider == "mercadopago":
        from .mercadopago import MercadoPagoTerminalProvider
        return MercadoPagoTerminalProvider
    else:
        from .manual import ManualTerminalProvider
        return ManualTerminalProvider


def _get_pix_class(provider: str) -> Type[BasePixProvider]:
    if provider == "mock":
        from .mock_pix import MockPixProvider
        return MockPixProvider
    if provider == "mercadopago":
        from .mercadopago import MercadoPagoPixProvider
        return MercadoPagoPixProvider
    raise ValueError(
        f"Provider PIX '{provider}' não suportado. "
        f"Disponíveis: mock, mercadopago"
    )


def get_terminal_provider(provider: str) -> BaseTerminalProvider:
    """Retorna instância singleton do provider de terminal."""
    if provider not in _terminal_cache:
        cls = _get_terminal_class(provider)
        _terminal_cache[provider] = cls()
    return _terminal_cache[provider]


def get_pix_provider(provider: str) -> BasePixProvider:
    """Retorna instância singleton do provider PIX."""
    if provider not in _pix_cache:
        cls = _get_pix_class(provider)
        _pix_cache[provider] = cls()
    return _pix_cache[provider]


# Providers com suporte a terminal (maquininha)
TERMINAL_PROVIDERS: List[str] = [
    "mercadopago",
    "cielo",
    "stone",
    "rede",
    "getnet",
    "pagseguro",
    "sumup",
    "manual",
]

# Providers com suporte a PIX via API
PIX_PROVIDERS: List[str] = [
    "mock",
    "mercadopago",
]


def list_providers() -> dict:
    """Lista providers disponíveis para terminal e PIX."""
    return {
        "terminal_providers": TERMINAL_PROVIDERS,
        "pix_providers": PIX_PROVIDERS,
    }
