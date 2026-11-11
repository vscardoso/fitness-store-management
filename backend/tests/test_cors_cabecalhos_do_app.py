"""Todo cabeçalho que o app web manda tem que estar liberado no CORS do servidor.

O app (app.provadorfit.com.br) e a API (api.provadorfit.com.br) são origens diferentes: o navegador pergunta antes (OPTIONS) se
cada cabeçalho fora do básico é permitido e, se não for, NÃO envia o pedido de verdade ("Não consegui falar com o servidor").
Foi o que aconteceu com `Idempotency-Key` (chave contra venda duplicada, 08/11/2026): o app passou a mandar, o servidor não
liberou, e fechar venda no app novo falharia. Este teste lê o código do app e falha se aparecer cabeçalho novo sem liberar.
"""
import re
from pathlib import Path

import pytest

from app.core.config import settings

pytestmark = pytest.mark.asyncio

MOBILE = Path(__file__).resolve().parents[2] / "mobile"
# cabeçalhos que o app só LÊ da resposta (não precisam de liberação de envio)
SO_RESPOSTA = {"x-total-count", "x-page", "x-page-size"}
PADRAO = re.compile(r"""['"]((?:X-[A-Za-z0-9-]+)|Idempotency-Key)['"]""")


def _cabecalhos_do_app() -> dict:
    achados: dict = {}
    for pasta in ("services", "utils", "hooks", "store", "components", "app", "constants"):
        for arq in (MOBILE / pasta).rglob("*.ts*") if (MOBILE / pasta).exists() else []:
            if "node_modules" in arq.parts:
                continue
            for m in PADRAO.finditer(arq.read_text(encoding="utf-8", errors="ignore")):
                achados.setdefault(m.group(1).lower(), str(arq.relative_to(MOBILE)))
    return achados


def test_todo_cabecalho_customizado_do_app_esta_liberado_no_cors():
    liberados = {h.lower() for h in settings.cors_allow_headers}
    achados = _cabecalhos_do_app()
    assert achados, "não achei nenhum cabeçalho customizado no código do app (o teste perdeu o caminho do mobile/?)"
    faltando = {h: onde for h, onde in achados.items() if h not in liberados and h not in SO_RESPOSTA}
    assert not faltando, f"cabeçalhos que o app manda e o CORS não libera (o navegador bloqueia o pedido): {faltando}"


async def test_verificacao_do_navegador_para_criar_venda_passa_com_a_chave_de_idempotencia(test_client):
    """A mesma pergunta que o navegador faz antes do POST /sales/ do app (com Idempotency-Key)."""
    origem = settings.cors_origins[0]
    r = await test_client.options(
        "/api/v1/sales/",
        headers={
            "Origin": origem,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type,idempotency-key",
        },
    )
    assert r.status_code == 200, r.text
    assert "idempotency-key" in r.headers["access-control-allow-headers"].lower()
