"""
Pacote de providers de pagamento — abstração agnóstica de fornecedor.

Cada provider implementa BaseTerminalProvider ou BasePixProvider.
Use a factory para obter a instância correta baseado no campo `provider` do terminal.

Exemplos:
    from app.services.payment_providers.factory import get_terminal_provider, get_pix_provider

    provider = get_terminal_provider("mercadopago")
    result = await provider.create_payment(db, ...)

    pix = get_pix_provider("mercadopago")
    result = await pix.create_pix_payment(db, ...)
"""
from .base import BaseTerminalProvider, BasePixProvider
from .factory import get_terminal_provider, get_pix_provider, TERMINAL_PROVIDERS, PIX_PROVIDERS

__all__ = [
    "BaseTerminalProvider",
    "BasePixProvider",
    "get_terminal_provider",
    "get_pix_provider",
    "TERMINAL_PROVIDERS",
    "PIX_PROVIDERS",
]
