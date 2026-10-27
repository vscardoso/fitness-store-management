"""
Esconde custo, lucro e margem das respostas da API para caixa e vendedor (item 2.2).

O menu do app já escondia as telas, mas as respostas (produtos, variações, vendas, condicionais...)
traziam cost_price, unit_cost, lucro e margem para qualquer papel. Aqui, num ponto só:
- a matriz de permissões (`permissions.permission_matrix`) anota o papel em `request.state.user_role`;
- este middleware, para caixa e vendedor, troca por null o valor de toda chave de custo/lucro/margem
  em respostas JSON, em qualquer profundidade (inclui `sale_sources` e `fifo_sources`).
Null (e não remover a chave) para o app continuar recebendo o mesmo formato.
"""
import json
import re
from typing import Any

MASKED_ROLES = {"cashier", "seller"}

# Palavra inteira entre "_" (ou começo/fim): cost_price, unit_cost, total_cost, profit, margin_percent,
# gross_margin_pct, roi, cmv, markup_percentage, total_investment, landed_unit_cost...
_KEY = re.compile(r"(^|_)(cost|costs|profit|profits|margin|margins|cmv|roi|markup|investment|lucro|custo)(_|$)")
# Chaves com a palavra que NÃO são custo da loja (o caixa precisa delas)
_ALLOW = {"installments_cost"}


def is_cost_key(key: str) -> bool:
    k = key.lower()
    return k not in _ALLOW and bool(_KEY.search(k))


def mask(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: (None if is_cost_key(str(k)) else mask(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [mask(v) for v in value]
    return value


class CostMaskMiddleware:
    """Middleware ASGI puro: só bufferiza a resposta quando é JSON e o papel é caixa/vendedor."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        start: dict = {}
        chunks: list[bytes] = []
        state = {"masking": False}

        async def wrapped_send(message):
            if message["type"] == "http.response.start":
                role = (scope.get("state") or {}).get("user_role")
                headers = dict((k.lower(), v) for k, v in message.get("headers", []))
                is_json = headers.get(b"content-type", b"").startswith(b"application/json")
                if role in MASKED_ROLES and is_json:
                    state["masking"] = True
                    start.update(message)
                    return
                return await send(message)

            if message["type"] == "http.response.body" and state["masking"]:
                chunks.append(message.get("body", b""))
                if message.get("more_body"):
                    return
                body = b"".join(chunks)
                try:
                    body = json.dumps(mask(json.loads(body)), ensure_ascii=False, separators=(",", ":")).encode()
                except ValueError:
                    pass  # não era JSON válido: devolve como veio
                headers = [(k, v) for k, v in start.get("headers", []) if k.lower() != b"content-length"]
                headers.append((b"content-length", str(len(body)).encode()))
                await send({**start, "headers": headers})
                return await send({"type": "http.response.body", "body": body, "more_body": False})

            return await send(message)

        return await self.app(scope, receive, wrapped_send)
