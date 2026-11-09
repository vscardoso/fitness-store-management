"""
Registro automático das ações que mexem em valores (histórico de alterações).

A matriz de permissões (`core/permissions.py`) é uma dependência que roda em TODA rota autenticada. Ela
chama `begin_trail` antes da rota (guarda o "antes" da linha mexida) e `finish_trail` depois que a rota
terminou COM SUCESSO (grava o "antes/depois" no `audit_logs`). Falha ao registrar nunca derruba a operação.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import select

logger = logging.getLogger(__name__)

# (método, final do caminho da rota, ação, entidade, tabela do "antes/depois", parâmetro do id)
_R = [
    ("POST", "/expenses", "EXPENSE_CREATED", "expense", None, None),
    ("PUT", "/expenses/{expense_id}", "EXPENSE_UPDATED", "expense", "expenses", "expense_id"),
    ("DELETE", "/expenses/{expense_id}", "EXPENSE_DELETED", "expense", "expenses", "expense_id"),
    ("POST", "/finance/transfers", "TRANSFER_CREATED", "account_transfer", None, None),
    ("DELETE", "/finance/transfers/{transfer_id}", "TRANSFER_DELETED", "account_transfer", None, "transfer_id"),
    ("POST", "/finance/payables", "PAYABLE_CREATED", "payable", None, None),
    ("POST", "/finance/payables/{payable_id}/pay", "PAYABLE_PAID", "payable", "payables", "payable_id"),
    ("POST", "/finance/payables/{payable_id}/unpay", "PAYABLE_UNPAID", "payable", "payables", "payable_id"),
    ("POST", "/finance/payables/{payable_id}/cancel", "PAYABLE_CANCELLED", "payable", "payables", "payable_id"),
    ("POST", "/finance/card-settlement", "CARD_SETTLED", "account_transfer", None, None),
    ("POST", "/finance/closings/{year}/{month}", "MONTH_CLOSED", "month_closing", None, None),
    ("POST", "/finance/closings/{year}/{month}/reopen", "MONTH_REOPENED", "month_closing", None, None),
    ("POST", "/receivables/receive", "RECEIVABLE_RECEIVED", "receivable", None, None),
    ("POST", "/receivables/opening", "RECEIVABLE_OPENING_CREATED", "receivable", None, None),
    ("POST", "/receivables/{receivable_id}/cancel", "RECEIVABLE_CANCELLED", "receivable", None, "receivable_id"),
    ("DELETE", "/receivables/payments/{payment_id}", "RECEIVABLE_PAYMENT_UNDONE", "receivable_payment", None, "payment_id"),
    ("POST", "/cash/open", "CASH_SESSION_OPENED", "cash_session", None, None),
    ("POST", "/cash/close", "CASH_SESSION_CLOSED", "cash_session", None, None),
    ("POST", "/cash/movements", "CASH_MOVEMENT_CREATED", "cash_movement", None, None),
    ("PUT", "/products/{product_id}", "PRODUCT_UPDATED", "product", "products", "product_id"),
    ("PATCH", "/products/{product_id}/price", "PRODUCT_UPDATED", "product", "products", "product_id"),
    ("PUT", "/product-variants/{variant_id}", "VARIANT_UPDATED", "product_variant", "product_variants", "variant_id"),
    ("PATCH", "/product-variants/{variant_id}", "VARIANT_UPDATED", "product_variant", "product_variants", "variant_id"),
    ("PUT", "/stock-entries/{entry_id}", "ENTRY_UPDATED", "stock_entry", "stock_entries", "entry_id"),
    ("PUT", "/stock-entries/entry-items/{item_id}", "ENTRY_ITEM_UPDATED", "entry_item", "entry_items", "item_id"),
    ("PUT", "/stock-entries/entry-items/{item_id}/correct", "ENTRY_ITEM_CORRECTED", "entry_item", "entry_items", "item_id"),
    ("POST", "/stock-entries/entry-items/{item_id}/correct", "ENTRY_ITEM_CORRECTED", "entry_item", "entry_items", "item_id"),
    ("PUT", "/store/return-settings", "SETTINGS_UPDATED", "store", "stores", None),
    ("PUT", "/store/loyalty-settings", "SETTINGS_UPDATED", "store", "stores", None),
    ("PUT", "/store/stock-writeoff-settings", "SETTINGS_UPDATED", "store", "stores", None),
    ("POST", "/team", "USER_CREATED", "user", None, None),
    ("PATCH", "/team/{user_id}/activate", "USER_ACTIVATED", "user", "users", "user_id"),
    ("DELETE", "/team/{user_id}", "USER_DEACTIVATED", "user", "users", "user_id"),
]
_TABLE = {(m, p): (a, e, t, k) for m, p, a, e, t, k in _R}
_SECRET = re.compile(r"pass|senha|token|secret|cpf|cnpj|document|hash|key", re.I)
_SKIP_COLS = {"updated_at", "created_at"}


_WRITE = {"POST", "PUT", "PATCH", "DELETE"}

# Gravações que NÃO entram no histórico geral, cada uma com o motivo. Tudo o mais que grava dados é registrado.
# (prefixo do caminho, motivo). Casam por "começa com" depois de /api/v1.
_NOT_AUDITED_PREFIX: tuple[tuple[str, str], ...] = (
    ("/auth/login", "tem registro próprio (LOGIN_*)"),
    ("/auth/logout", "sair do sistema não altera valores"),
    ("/auth/refresh", "renovação automática da sessão"),
    ("/auth/signup", "cadastro de loja nova (ainda não há loja para registrar)"),
    ("/auth/check-", "consulta se e-mail ou endereço estão livres"),
    ("/auth/forgot-password", "pedido de nova senha: tem limite e registro próprios (PASSWORD_RESET)"),
    ("/client-logs", "diagnóstico do app"),
    ("/debug", "ferramenta de desenvolvimento"),
    ("/legal/accept", "aceite dos termos tem tabela própria"),
    ("/ai/", "só lê uma foto e sugere dados"),
    ("/labels/pdf", "gera PDF"),
    ("/label-printers/print", "impressão"),
    ("/products/fifo-costs", "consulta (usa POST por causa da lista de ids)"),
    ("/payment-discounts/calculate", "simulação"),
    ("/stock-import/preview", "simulação, não grava"),
    ("/notifications", "avisos e leitura de avisos"),
    ("/pdv/webhooks", "chamada automática do banco ou da maquininha"),
    ("/pdv/cielo-pix/register-webhook", "configuração técnica de integração desligada"),
    ("/conditional-shipments/notifications", "rotina de avisos"),
    ("/conditional-shipments/sla", "rotina de avisos"),
    ("/reports/stock-counts/{count_id}/apply", "uma bipada da Conferência (a conferência inteira é registrada)"),
    ("/whatsapp/conversations", "mensagens e leitura de conversa"),
    ("/sales/{sale_id}/receipt/send-whatsapp", "envio de comprovante"),
)
# Já registradas com mais detalhe dentro do próprio serviço (evita duas linhas para a mesma ação).
_LOGGED_ELSEWHERE = {
    ("POST", "/sales"), ("POST", "/sales/{sale_id}/cancel"),
    ("PUT", "/customers/{customer_id}"), ("DELETE", "/customers/{customer_id}"),
    ("POST", "/customers/{customer_id}/anonymize"), ("POST", "/customers/{customer_id}/loyalty/adjust"),
    ("DELETE", "/stock-entries/{entry_id}"), ("DELETE", "/stock-entries/entry-items/{item_id}"),
    ("POST", "/finance/accounts/{account_id}/adjust"), ("PATCH", "/finance/accounts/{account_id}"),
}


def _tail(path_format: str) -> str:
    return path_format.split("/api/v1", 1)[-1].rstrip("/") or "/"


def is_excluded(method: str, path_format: str) -> bool:
    tail = _tail(path_format)
    if (method.upper(), tail) in _LOGGED_ELSEWHERE:
        return True
    return any(tail.startswith(pref) for pref, _ in _NOT_AUDITED_PREFIX)


def _generic(method: str, tail: str):
    """Registro geral: ação ROTA_<MÉTODO>_<partes fixas do caminho>, entidade = 1ª parte (tabela com esse nome, se existir)."""
    static = [x for x in tail.strip("/").split("/") if x and not x.startswith("{")]
    nome = "_".join(re.sub(r"[^A-Za-z0-9]+", "_", x).strip("_").upper() for x in static)[:60] or "RAIZ"
    params = re.findall(r"\{([^}]+)\}", tail)
    return (f"ROTA_{method.upper()}_{nome}", static[0] if static else "rota", static[0] if static else None,
            params[0] if params else None)


def match_route(method: str, path_format: str):
    """Acha a ação registrada para a rota (ou None se não registra). `path_format` inclui o prefixo /api/v1.

    Rota mapeada à mão (tabela acima) leva o nome de ação específico. Qualquer OUTRA rota que grava dados (POST, PUT, PATCH,
    DELETE) é registrada pela regra geral, salvo as exceções documentadas. Assim nada que altera valor fica sem rastro."""
    tail = _tail(path_format)
    hit = _TABLE.get((method.upper(), tail))
    if hit:
        return hit
    if method.upper() not in _WRITE or is_excluded(method, path_format):
        return None
    return _generic(method, tail)


def _plain(v: Any) -> Any:
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, str):
        return v[:200]
    if isinstance(v, (int, float, bool)) or v is None:
        return v
    return str(v)[:200]


def _clean(obj: Any, depth: int = 0) -> Any:
    if isinstance(obj, dict):
        if depth >= 4:
            return {}
        return {k: _clean(v, depth + 1) for k, v in obj.items() if not _SECRET.search(str(k))}
    if isinstance(obj, list):
        return [_clean(v, depth + 1) for v in obj[:30]]
    return _plain(obj)


async def _snapshot(db, table: Optional[str], row_id: Optional[int], tenant_id: int) -> Optional[dict]:
    if not table:
        return None
    from app.models.base import Base
    t = Base.metadata.tables.get(table)
    if t is None:
        return None
    if table == "stores":
        cond = [t.c.id == tenant_id]
    else:
        if row_id is None:
            return None
        cond = [t.c.id == row_id]
        if "tenant_id" in t.c:
            cond.append(t.c.tenant_id == tenant_id)
    row = (await db.execute(select(t).where(*cond))).mappings().first()
    if row is None:
        return None
    return {k: _plain(v) for k, v in row.items() if k not in _SKIP_COLS and not _SECRET.search(k)}


async def begin_trail(request, db, user) -> Optional[dict]:
    """Chamada antes da rota. Devolve o contexto para `finish_trail` (ou None se a rota não é registrada)."""
    try:
        route = request.scope.get("route")
        found = match_route(request.method, getattr(route, "path_format", "") or "")
        if not found:
            return None
        action, entity, table, key = found
        row_id = request.path_params.get(key) if key else None
        try:
            row_id = int(row_id) if row_id is not None else None
        except (TypeError, ValueError):
            row_id = None
        antes = await _snapshot(db, table, row_id, user.tenant_id)
        return {"action": action, "entity": entity, "table": table, "row_id": row_id, "antes": antes,
                "rota": getattr(route, "path_format", "") or "", "metodo": request.method.upper()}
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Histórico: não leu o 'antes' (não crítico): {e}")
        return None


async def finish_trail(request, db, user, ctx: Optional[dict]) -> None:
    """Chamada depois que a rota terminou com sucesso: grava o registro. Nunca levanta erro."""
    if not ctx:
        return
    try:
        from app.services.audit_service import notify_other_admins
        body: Any = None
        if not (request.headers.get("content-type") or "").lower().startswith("multipart"):
            try:
                raw = await request.body()
                body = json.loads(raw) if raw else None
            except Exception:  # noqa: BLE001
                body = None
        depois = await _snapshot(db, ctx["table"], ctx["row_id"], user.tenant_id)
        antes = ctx["antes"]
        detail: dict[str, Any] = {}
        if antes is not None and depois is not None:
            ch = [k for k in depois if antes.get(k) != depois.get(k)]
            detail["antes"] = {k: antes.get(k) for k in ch}
            detail["depois"] = {k: depois[k] for k in ch}
        ref = depois or antes or {}
        nome = ref.get("name") or ref.get("description") or ref.get("title") or ref.get("full_name")
        if nome:
            detail["nome"] = nome
        if isinstance(body, dict):
            detail["corpo"] = _clean(body)
            motivo = body.get("reason") or body.get("motivo") or body.get("notes")
            if motivo:
                detail["motivo"] = str(motivo)[:300]
        if request.path_params:
            detail["ids"] = {k: _plain(v) for k, v in request.path_params.items()}
        if str(ctx["action"]).startswith("ROTA_"):
            detail["rota"] = _tail(ctx.get("rota") or "")
            detail["metodo"] = ctx.get("metodo")
        from app.models.audit_log import AuditLog
        async with db.begin_nested():       # savepoint: se gravar falhar, a operação da rota não é afetada
            db.add(AuditLog(tenant_id=user.tenant_id, user_id=user.id, user_email=user.email, action=ctx["action"],
                            entity=ctx["entity"], entity_id=ctx["row_id"],
                            detail=json.dumps(detail, default=str, ensure_ascii=False)))
            await db.flush()
        if ctx["action"] == "MONTH_REOPENED":
            p = request.path_params
            await notify_other_admins(
                user.tenant_id, user, "Mês reaberto",
                f"{user.full_name or user.email} reabriu o fechamento de {int(p.get('month', 0)):02d}/{p.get('year')}")
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Histórico: falha ao registrar {ctx.get('action')} (não crítico): {e}")
