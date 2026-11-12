"""Link https dos PDFs (comprovante, brinde, relatórios, estoque): um jeito só de entregar PDF.

Abrir/compartilhar um endereço blob: do navegador mandava para o WhatsApp e a impressora o TEXTO "blob:https://app..."; o link https
assinado entrega o arquivo de verdade. Sem `link` a rota devolve o PDF direto, como sempre."""
import time
from datetime import date

import jwt
import pytest

from app.core.config import settings
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario, _vender

pytestmark = pytest.mark.asyncio
API = "/api/v1"


@pytest.fixture(autouse=True)
async def _limpa_vendas(async_session):
    from sqlalchemy import delete, func, select
    from app.models.sale import Payment, Sale, SaleItem
    modelos = [Payment, SaleItem, Sale]
    antes = {m: (await async_session.execute(select(func.coalesce(func.max(m.id), 0)))).scalar() for m in modelos}
    yield
    await async_session.rollback()
    for m in modelos:
        await async_session.execute(delete(m).where(m.id > antes[m]))
    await async_session.commit()


def _caminho(url: str) -> str:
    """Só a parte depois de /api/v1 (o cliente de teste não tem o endereço público)."""
    return url.split("/api/v1", 1)[1]


async def test_link_do_comprovante_abre_sem_login_e_o_pdf_direto_continua_igual(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sale_id, _ = await _vender(test_client, h, p, va, 1, "100.00")

    direto = await test_client.get(f"{API}/sales/{sale_id}/receipt/pdf?size=a6", headers=h)     # como sempre foi
    assert direto.status_code == 200 and direto.headers["content-type"] == "application/pdf" and direto.content.startswith(b"%PDF")

    r = await test_client.get(f"{API}/sales/{sale_id}/receipt/pdf?size=a6&link=true", headers=h)
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/json"), r.text
    j = r.json()
    assert j["filename"].startswith("comprovante-VENDA-") and j["filename"].endswith(".pdf")
    assert "/api/v1/public/pdf/" in j["url"] and "blob:" not in j["url"]

    # o link abre SEM login (é o que o WhatsApp e a impressora fazem) e traz o PDF
    sem_login = await test_client.get(f"{API}{_caminho(j['url'])}", headers={"Authorization": ""})
    assert sem_login.status_code == 200 and sem_login.content.startswith(b"%PDF")
    assert sem_login.headers["content-type"] == "application/pdf"
    assert j["filename"] in sem_login.headers["content-disposition"]
    assert sem_login.headers["content-disposition"].startswith("inline")             # abrir: mostra no visualizador
    # ?download=1: o MESMO PDF como arquivo para baixar (o iPhone salva em Arquivos, de onde o app da impressora abre)
    baixar = await test_client.get(f"{API}{_caminho(j['url'])}?download=1", headers={"Authorization": ""})
    assert baixar.status_code == 200 and baixar.content == sem_login.content
    assert baixar.headers["content-disposition"].startswith("attachment") and j["filename"] in baixar.headers["content-disposition"]


async def test_link_adulterado_vencido_ou_de_arquivo_apagado_e_recusado(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sale_id, _ = await _vender(test_client, h, p, va, 1, "100.00")
    j = (await test_client.get(f"{API}/sales/{sale_id}/receipt/pdf?link=true", headers=h)).json()
    caminho = _caminho(j["url"])
    token = caminho.split("/public/pdf/")[1].split("/")[0]

    ruim = caminho.replace(token, token[:-3] + ("aaa" if not token.endswith("aaa") else "bbb"))        # assinatura trocada
    assert (await test_client.get(f"{API}{ruim}")).status_code == 404
    assert (await test_client.get(f"{API}/public/pdf/nao-e-um-token/x.pdf")).status_code == 404

    vencido = jwt.encode({"typ": "pdf-file", "f": "0" * 32, "tid": t_id, "exp": int(time.time()) - 10}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    assert (await test_client.get(f"{API}/public/pdf/{vencido}/x.pdf")).status_code == 404
    outro_tipo = jwt.encode({"typ": "label-pdf", "f": "0" * 32, "tid": t_id, "exp": int(time.time()) + 600}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    assert (await test_client.get(f"{API}/public/pdf/{outro_tipo}/x.pdf")).status_code == 404       # token de etiqueta não abre este
    caminho_fora = jwt.encode({"typ": "pdf-file", "f": "../../x", "tid": t_id, "exp": int(time.time()) + 600}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    assert (await test_client.get(f"{API}/public/pdf/{caminho_fora}/x.pdf")).status_code == 404      # nome de arquivo fora do formato
    sem_arquivo = jwt.encode({"typ": "pdf-file", "f": "a" * 32, "tid": t_id, "exp": int(time.time()) + 600}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    assert (await test_client.get(f"{API}/public/pdf/{sem_arquivo}/x.pdf")).status_code == 404       # arquivo já apagado


async def test_todas_as_rotas_de_pdf_aceitam_link_e_continuam_com_a_mesma_permissao(test_client, async_session, test_user):
    from app.models.user import UserRole
    from tests.test_short_codes import _user
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    hoje = date.today()
    rotas = [
        "/reports/sales/pdf?period=this_month",
        f"/reports/monthly/pdf?year={hoje.year}&month={hoje.month}",
        "/reports/stock-chain/pdf",
    ]
    for rota in rotas:
        sep = "&" if "?" in rota else "?"
        direto = await test_client.get(f"{API}{rota}", headers=h)
        assert direto.status_code == 200 and direto.content.startswith(b"%PDF"), rota
        com_link = await test_client.get(f"{API}{rota}{sep}link=true", headers=h)
        assert com_link.status_code == 200, (rota, com_link.text)
        abre = await test_client.get(f"{API}{_caminho(com_link.json()['url'])}")
        assert abre.status_code == 200 and abre.content.startswith(b"%PDF"), rota
    # brinde (admin): link do comprovante do brinde
    g = await test_client.post(f"{API}/gifts/", headers=h, json={
        "items": [{"variant_id": va.id, "quantity": 1}], "reason_type": "courtesy", "recipient_name": "Maria Teste"})
    assert g.status_code == 201, g.text
    lk = await test_client.get(f"{API}/gifts/{g.json()['id']}/receipt/pdf?link=true", headers=h)
    assert lk.status_code == 200 and lk.json()["filename"].startswith("brinde-BRINDE-")
    # a permissão não mudou: vendedor continua sem os relatórios e o link não é atalho
    vend = await _user(async_session, t_id, UserRole.SELLER)
    assert (await test_client.get(f"{API}/reports/stock-chain/pdf?link=true", headers=vend)).status_code in (401, 403)
    assert (await test_client.get(f"{API}/reports/monthly/pdf?link=true", headers=vend)).status_code in (401, 403)
