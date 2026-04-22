"""
Registry de asyncio.Event para notificação SSE de pagamentos PIX.
Mantém um Event por payment_id, sinalizado quando o status muda.
Funciona em processo único (uvicorn single-worker).
"""
import asyncio
from typing import Optional

# {payment_id: asyncio.Event}
_events: dict[str, asyncio.Event] = {}
# {payment_id: dict}  — resultado final a enviar ao cliente SSE
_results: dict[str, dict] = {}


def get_or_create_event(payment_id: str) -> asyncio.Event:
    """Retorna (ou cria) o asyncio.Event para este payment_id."""
    if payment_id not in _events:
        _events[payment_id] = asyncio.Event()
    return _events[payment_id]


def signal_payment(payment_id: str, result: dict) -> None:
    """
    Sinaliza mudança de status para um pagamento.
    Chamado por: _confirm_sale, _cancel_sale, expire_pending_pix.
    """
    _results[payment_id] = result
    event = _events.get(payment_id)
    if event:
        event.set()


def get_result(payment_id: str) -> Optional[dict]:
    """Retorna o resultado associado ao payment_id (None se ainda não sinalizado)."""
    return _results.get(payment_id)


def cleanup(payment_id: str) -> None:
    """Remove da memória após o cliente SSE fechar a conexão."""
    _events.pop(payment_id, None)
    _results.pop(payment_id, None)
