"""
Matriz de permissões por papel (fonte única).

Papéis, do menor para o maior: caixa < vendedor < gerente < admin. Cada regra diz o MENOR papel
que pode chamar a rota; quem tem papel maior também pode. A primeira regra que casar vence.
Rota autenticada que não casa com nenhuma regra exige GERENTE (falha fechada).

O que cada papel faz (o mesmo texto da tela "Adicionar membro" do app):
- caixa: só o PDV (vender, cobrar, cadastrar cliente, consultar produto).
- vendedor: vende e consulta; edita cliente, faz devolução e envio condicional, consulta estoque, imprime etiqueta.
- gerente: produtos, variações, entradas, viagens, fornecedores, despesas, relatórios e painel.
- admin: tudo, mais equipe, dados da loja, PIX, descontos, maquininhas, estornos e apagar registros.

As regras valem em ADDIÇÃO aos guards já escritos nas rotas (require_role): vale o mais restritivo.
Para mudar uma permissão, edite a lista RULES e rode tests/test_permissions.py.
"""
import re
from typing import Iterable, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.dependencies.utils import get_parameterless_sub_dependant
from fastapi.routing import APIRoute

from app.models.user import User, UserRole

RANK = {UserRole.CASHIER: 1, UserRole.SELLER: 2, UserRole.MANAGER: 3, UserRole.ADMIN: 4}
CASHIER, SELLER, MANAGER, ADMIN = UserRole.CASHIER, UserRole.SELLER, UserRole.MANAGER, UserRole.ADMIN

READ = {"GET"}
WRITE = {"POST", "PUT", "PATCH", "DELETE"}
ANY = None  # qualquer método

# (métodos, regex do caminho SEM o prefixo /api/v1, papel mínimo)
RULES: list[tuple[Optional[set], str, UserRole]] = [
    # ── admin ────────────────────────────────────────────────────────────────
    ({"GET"}, r"^/team(/\{user_id\})?$", MANAGER),  # gerente consulta a equipe; só admin altera
    (ANY, r"^/(audit|team|store|mp-connect|error-logs|perf)(/|$)", ADMIN),
    ({"POST"}, r"^/client-logs$", CASHIER),
    ({"GET", "POST"}, r"^/legal/(status|accept)$", CASHIER),  # todo usuário aceita os próprios termos
    # LGPD: anonimizar e ver quem acessou é do admin; exportar a pedido do titular, gerente ou admin
    ({"POST"}, r"^/customers/\{customer_id\}/anonymize$", ADMIN),
    ({"GET"}, r"^/customers/\{customer_id\}/access-log$", ADMIN),
    ({"GET"}, r"^/customers/\{customer_id\}/export$", MANAGER),
    (ANY, r"^/auth/register$", ADMIN),
    (ANY, r"^/notifications/(send|test)(/|$)|^/notifications/inbox/push-now$", ADMIN),
    (ANY, r"^/pdv/(store/setup|cielo-pix/register-webhook)$", ADMIN),
    (WRITE, r"^/pdv/terminals(/|$)", ADMIN),
    ({"POST"}, r"^/pdv/(orders/\{sale_id\}|pix/\{payment_id\})/refund$", ADMIN),
    ({"POST"}, r"^/sales/\{sale_id\}/cancel$", ADMIN),
    ({"POST"}, r"^/returns/reconcile-status$", ADMIN),
    ({"POST"}, r"^/conditional-shipments/(notifications|sla)/", ADMIN),
    ({"POST", "PUT", "DELETE"}, r"^/payment-discounts/(\{discount_id\})?$", ADMIN),
    ({"DELETE"}, r"^/(products|categories|suppliers|stock-entries|trips)/\{[a-z_]+\}$", ADMIN),
    ({"DELETE"}, r"^/expenses(/categories)?/\{[a-z_]+\}$", ADMIN),

    # ── caixa (PDV) ──────────────────────────────────────────────────────────
    ({"GET", "POST"}, r"^/sales/?$", CASHIER),
    ({"GET"}, r"^/sales/(daily-total|number/\{sale_number\}|\{sale_id\})$", CASHIER),
    ({"POST"}, r"^/pdv/(orders|payment|pix/start|pix/generate-qr|pix/\{sale_id\}|terminal/start)$", CASHIER),
    ({"POST"}, r"^/pdv/orders/\{sale_id\}/confirm$", CASHIER),
    ({"POST"}, r"^/pdv/orders/\{sale_id\}/cancel$", MANAGER),
    ({"GET"}, r"^/pdv/(devices|mp-terminals|terminals|pending-sales|orders/.+|payment/.+|pix/.+)$", CASHIER),
    ({"GET", "POST"}, r"^/customers/?$", CASHIER),
    ({"GET"}, r"^/customers/\{customer_id\}(/purchases)?$", CASHIER),
    ({"POST"}, r"^/payment-discounts/calculate$", CASHIER),
    ({"GET"}, r"^/payment-discounts/", CASHIER),
    ({"GET"}, r"^/(products|product-variants|categories|looks)(/|$)", CASHIER),
    (ANY, r"^/whatsapp/greeting$", ADMIN),  # saudação automática: configuração da loja
    ({"GET"}, r"^/whatsapp/costs$", MANAGER),  # quanto o WhatsApp cobrou: dinheiro, só gerente
    (ANY, r"^/whatsapp(/|$)", SELLER),  # caixa de conversas do WhatsApp da loja
    ({"GET"}, r"^/auth/(me)$", CASHIER),
    ({"POST"}, r"^/auth/logout$", CASHIER),
    (ANY, r"^/notifications/(inbox|token)(/|$)", CASHIER),

    # ── vendedor ─────────────────────────────────────────────────────────────
    ({"PUT"}, r"^/customers/\{customer_id\}$", SELLER),
    ({"GET", "POST"}, r"^/returns/", SELLER),
    (ANY, r"^/supplier-returns(/|$)", MANAGER),
    ({"POST"}, r"^/conditional-shipments/\{shipment_id\}/", SELLER),
    ({"DELETE"}, r"^/conditional-shipments/\{shipment_id\}$", MANAGER),
    (ANY, r"^/conditional-shipments(/|$)", SELLER),
    ({"GET"}, r"^/inventory/(alerts|movements|product)(/|$)", SELLER),
    ({"GET"}, r"^/label-printers/(default|print/jobs|print/preview)$|^/label-printers/?$", SELLER),
    ({"POST"}, r"^/label-printers/print(/batch)?$", SELLER),
    ({"POST"}, r"^/labels/pdf(/entry/\{entry_id\})?$", SELLER),  # vendedor imprime etiqueta
    ({"GET"}, r"^/labels/sizes$", SELLER),  # tamanhos de adesivo e quantas cabem por folha
    ({"GET"}, r"^/ai/status$", SELLER),
    ({"GET"}, r"^/suggestions/", SELLER),
    ({"POST", "GET", "DELETE"}, r"^/wishlist/(\{wishlist_id\}|customer/\{customer_id\})?$", SELLER),

    # ── gerente ──────────────────────────────────────────────────────────────
    (ANY, r"^/(reports|dashboard|expenses|suppliers|stock-entries|trips)(/|$)", MANAGER),
    (ANY, r"^/sales/reports/", MANAGER),
    (ANY, r"^/wishlist/demand$", MANAGER),
    (WRITE, r"^/(products|product-variants|categories|looks|inventory|label-printers|suggestions)(/|$)", MANAGER),
    (ANY, r"^/products/(\{product_id\}/suppliers|fifo-costs|grouped-debug)$", MANAGER),
    ({"POST"}, r"^/ai/scan-product$", MANAGER),
    (WRITE, r"^/customers/", MANAGER),
    ({"GET"}, r"^/inventory/", MANAGER),
]
_COMPILED = [(m, re.compile(rx), role) for m, rx, role in RULES]
DEFAULT_ROLE = MANAGER
API_PREFIX = "/api/v1"


def required_role(method: str, path_template: str) -> UserRole:
    """Papel mínimo para (método, caminho do roteador, ex.: /products/{product_id}/price)."""
    path = path_template[len(API_PREFIX):] if path_template.startswith(API_PREFIX) else path_template
    for methods, rx, role in _COMPILED:
        if (methods is None or method in methods) and rx.search(path):
            return role
    return DEFAULT_ROLE


def allowed_roles(method: str, path_template: str) -> set[UserRole]:
    need = RANK[required_role(method, path_template)]
    return {r for r, k in RANK.items() if k >= need}


def apply_permission_matrix(app) -> int:
    """Insere a checagem de papel em toda rota que exige login. Devolve quantas rotas receberam."""
    from app.api import deps

    def has_auth(route: APIRoute) -> bool:
        stack = [route.dependant]
        while stack:
            d = stack.pop()
            if d.call in (deps.get_current_user, deps.get_current_active_user, deps.get_current_tenant_id):
                return True
            stack.extend(d.dependencies)
        return False

    n = 0
    for route in app.routes:
        if not isinstance(route, APIRoute) or not has_auth(route):
            continue
        by_method = {m: required_role(m, route.path_format) for m in route.methods if m not in ("HEAD", "OPTIONS")}
        if not by_method:
            continue

        route.dependant.dependencies.insert(
            0,
            get_parameterless_sub_dependant(depends=Depends(_make_dependency(by_method)), path=route.path_format),
        )
        n += 1
    return n


def _make_dependency(by_method: dict[str, UserRole]):
    from app.api import deps

    async def permission_matrix(
        request: Request,
        current_user: User = Depends(deps.get_current_active_user),
    ) -> None:
        role = current_user.role if isinstance(current_user.role, UserRole) else UserRole(str(current_user.role).lower())
        # cost_mask.CostMaskMiddleware esconde custo/lucro/margem da resposta para caixa e vendedor
        request.state.user_role = role.value
        need = by_method.get(request.method)
        if need is None:
            return
        if RANK[role] < RANK[need]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permissão negada. Esta ação exige o papel {need.value} ou superior.",
            )

    return permission_matrix
