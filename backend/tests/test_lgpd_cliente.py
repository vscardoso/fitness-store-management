"""LGPD (item 2.1): exportar os dados de um cliente, anonimizar e registro de quem acessou.

Cenário: a cliente pede à loja os dados dela (exportar) e depois pede para ser esquecida (anonimizar).
As vendas continuam no caixa e nos relatórios, mas sem identificar a pessoa.
"""
import itertools
import secrets

import pytest
from sqlalchemy import select

from tests.test_condicional import (  # noqa: F401  (fixtures autouse)
    _cenario, _criar, _devolver, _enviar, _item, _limpa_loja_1, _limpa_vendas_e_envios, _upd, URL,
)
from tests.test_short_codes import _user

pytestmark = pytest.mark.asyncio
_n = itertools.count(1)
C = "/api/v1/customers"


def _cpf() -> str:
    import random
    base = [random.randint(0, 9) for _ in range(9)]
    for _ in range(2):
        soma = sum(d * w for d, w in zip(base, range(len(base) + 1, 1, -1)))
        base.append((soma * 10 % 11) % 10)
    return "".join(map(str, base))


CPFS: dict = {}


async def _cliente_completo(client, h):
    n = next(_n)
    cpf = _cpf()
    r = await client.post(C + "/", headers=h, json={
        "full_name": f"Maria Titular {n}", "email": f"titular{n}.{secrets.token_hex(2)}@example.com",
        "phone": "34999990000", "document_number": cpf, "birth_date": "1990-05-15",
        "address": "Rua das Acácias", "address_number": "77", "neighborhood": "Centro",
        "city": "Uberlândia", "state": "MG", "zip_code": "38400000", "marketing_consent": True,
    })
    assert r.status_code in (200, 201), r.text
    CPFS[r.json()["id"]] = cpf
    return r.json()["id"]


async def _whatsapp(db, tenant_id, phone="5534999990000"):
    from app.models.whatsapp_cloud import WhatsAppCloudNumber, WhatsAppConversation, WhatsAppMessage
    num = WhatsAppCloudNumber(tenant_id=tenant_id, phone_number_id=f"pn-{secrets.token_hex(4)}")
    db.add(num)
    await db.flush()
    conv = WhatsAppConversation(tenant_id=tenant_id, number_id=num.id, contact_key=phone, phone=phone,
                                wa_id=phone, profile_name="Maria Zap")
    db.add(conv)
    await db.flush()
    db.add(WhatsAppMessage(tenant_id=tenant_id, conversation_id=conv.id, wamid=f"wamid.{secrets.token_hex(6)}",
                           direction="in", msg_type="text", text="Oi, tem a legging preta no M?", status="received"))
    await db.commit()
    return conv.id


async def test_exporta_tudo_da_titular_sem_dado_da_loja(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user, custo=40, preco="100.00")
    cid = await _cliente_completo(test_client, h)
    s = await _criar(test_client, h, cid, [_item(ids, 2)])
    await _enviar(test_client, h, s["id"])
    assert (await _devolver(test_client, h, s["id"], [_upd(s["items"][0], kept=1, ret=1)], payment_method="pix")).status_code == 200
    await _whatsapp(async_session, ids.t)

    r = await test_client.get(f"{C}/{cid}/export", headers=h)
    assert r.status_code == 200, r.text
    assert "attachment" in r.headers.get("content-disposition", "")
    d = r.json()
    cad = d["cadastro"]
    assert cad["cpf"] == CPFS[cid] and cad["endereco"] == "Rua das Acácias" and cad["nascimento"] == "1990-05-15"
    assert len(d["compras"]) == 1 and d["compras"][0]["total"] == 100.0
    assert d["compras"][0]["pecas"][0]["quantidade"] == 1
    assert d["envios_condicionais"][0]["endereco_de_entrega"].startswith("Rua das Flores")
    assert d["whatsapp"][0]["mensagens"][0]["texto"] == "Oi, tem a legging preta no M?"
    texto = r.text.lower()
    # custo e origem FIFO são da loja, não da titular
    assert "unit_cost" not in texto and "custo" not in texto and "sale_sources" not in texto


async def test_anonimiza_apaga_dados_e_mantem_vendas(test_client, async_session, test_user):
    from app.models.conditional_shipment import ConditionalShipment
    from app.models.customer import Customer
    from app.models.sale import Sale
    from app.models.whatsapp_cloud import WhatsAppConversation, WhatsAppMessage

    ids, h = await _cenario(async_session, test_user, custo=40, preco="100.00")
    cid = await _cliente_completo(test_client, h)
    s = await _criar(test_client, h, cid, [_item(ids, 1)])
    await _enviar(test_client, h, s["id"])

    # envio em aberto: peça está com a cliente, não pode anonimizar ainda
    r = await test_client.post(f"{C}/{cid}/anonymize", headers=h, json={"confirmacao": "ANONIMIZAR"})
    assert r.status_code == 400 and f"#{s['id']}" in r.json()["detail"], r.text

    assert (await _devolver(test_client, h, s["id"], [_upd(s["items"][0], kept=1)], payment_method="pix")).status_code == 200
    conv_id = await _whatsapp(async_session, ids.t)

    r = await test_client.post(f"{C}/{cid}/anonymize", headers=h, json={"confirmacao": "anonimizar"})
    assert r.status_code == 200, r.text

    async_session.expire_all()
    c = (await async_session.execute(select(Customer).where(Customer.id == cid))).scalar_one()
    assert c.full_name == f"Cliente anonimizado #{cid}"
    assert (c.email, c.phone, c.document_number, c.birth_date, c.address, c.zip_code, c.city) == (None,) * 7
    assert c.is_active is False and c.anonymized_at is not None and c.marketing_consent is False
    envio = (await async_session.execute(select(ConditionalShipment).where(ConditionalShipment.id == s["id"]))).scalar_one()
    assert envio.shipping_address == "Endereço removido (LGPD)"
    venda = (await async_session.execute(select(Sale).where(Sale.customer_id == cid))).scalar_one()
    assert float(venda.total_amount) == 100.0, "a venda tem que continuar no caixa"
    conv = (await async_session.execute(select(WhatsAppConversation).where(WhatsAppConversation.id == conv_id))).scalar_one()
    assert conv.phone is None and conv.profile_name is None and conv.contact_key == f"anonimizado-{conv_id}"
    msg = (await async_session.execute(select(WhatsAppMessage).where(WhatsAppMessage.conversation_id == conv_id))).scalar_one()
    assert msg.text is None and msg.payload is None

    # some da tela e não dá para repetir
    assert (await test_client.get(f"{C}/{cid}", headers=h)).status_code == 404
    lista = (await test_client.get(C + "/", headers=h, params={"search": "Maria Titular"})).json()
    assert cid not in [x["id"] for x in lista]
    r = await test_client.post(f"{C}/{cid}/anonymize", headers=h, json={"confirmacao": "ANONIMIZAR"})
    assert r.status_code == 400 and "já foi anonimizado" in r.json()["detail"]
    # a exportação depois mostra que não sobrou dado pessoal
    d = (await test_client.get(f"{C}/{cid}/export", headers=h)).json()
    assert d["cadastro"]["cpf"] is None and d["cadastro"]["anonimizado_em"]
    assert "Rua das Acácias" not in str(d) and "Maria Titular" not in str(d)


async def test_confirmacao_errada_nao_apaga_nada(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user)
    cid = await _cliente_completo(test_client, h)
    r = await test_client.post(f"{C}/{cid}/anonymize", headers=h, json={"confirmacao": "sim"})
    assert r.status_code == 400
    assert (await test_client.get(f"{C}/{cid}", headers=h)).json()["document_number"] == CPFS[cid]


async def test_registro_de_quem_acessou(test_client, async_session, test_user):
    ids, h = await _cenario(async_session, test_user)
    cid = await _cliente_completo(test_client, h)
    await test_client.get(f"{C}/{cid}", headers=h)
    await test_client.put(f"{C}/{cid}", headers=h, json={"city": "Araguari"})
    await test_client.get(f"{C}/{cid}/export", headers=h)
    r = await test_client.get(f"{C}/{cid}/access-log", headers=h)
    assert r.status_code == 200, r.text
    codigos = [x["codigo"] for x in r.json()]
    assert codigos[:3] == ["CUSTOMER_EXPORTED", "CUSTOMER_UPDATED", "CUSTOMER_VIEWED"], codigos
    assert all(x["usuario"] for x in r.json())
    assert "Araguari" not in r.text, "o registro guarda quais campos mudaram, não os valores"


async def test_papeis(test_client, async_session, test_user):
    from app.models.user import UserRole
    ids, h = await _cenario(async_session, test_user)
    cid = await _cliente_completo(test_client, h)
    vendedor = await _user(async_session, ids.t, UserRole.SELLER)
    gerente = await _user(async_session, ids.t, UserRole.MANAGER)
    assert (await test_client.get(f"{C}/{cid}/export", headers=vendedor)).status_code == 403
    assert (await test_client.get(f"{C}/{cid}/export", headers=gerente)).status_code == 200
    assert (await test_client.get(f"{C}/{cid}/access-log", headers=gerente)).status_code == 403
    r = await test_client.post(f"{C}/{cid}/anonymize", headers=gerente, json={"confirmacao": "ANONIMIZAR"})
    assert r.status_code == 403
    assert (await test_client.get(f"{C}/{cid}", headers=h)).json()["document_number"] == CPFS[cid]
