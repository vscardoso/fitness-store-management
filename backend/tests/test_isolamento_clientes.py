"""Cliente de uma loja nunca aparece, nem pode ser lido, editado ou apagado por outra loja (LGPD).

Antes: GET /customers/{id} e DELETE /customers/{id} buscavam o cliente sem filtrar a loja; um usuário de
qualquer loja lia nome, telefone, CPF e endereço de cliente de outra loja só trocando o número."""
import pytest

from tests.test_isolamento_fornecedores import _h, _sem_override, _tenant_de_verdade  # noqa: F401  (fixture)
from tests.test_team_limit import _nova_loja

pytestmark = pytest.mark.asyncio


def _cpf() -> str:
    import random
    base = [random.randint(0, 9) for _ in range(9)]
    for _ in range(2):
        soma = sum(d * w for d, w in zip(base, range(len(base) + 1, 1, -1)))
        base.append((soma * 10 % 11) % 10)
    return "".join(map(str, base))


async def _cliente(client, token, nome):
    r = await client.post("/api/v1/customers/", headers=_h(token), json={
        "full_name": nome, "phone": "34999990001", "document_number": _cpf(), "address": "Rua Secreta, 1"})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def test_cliente_de_outra_loja_nao_vaza(test_client, async_session):
    _sem_override()
    _, _, token_a = await _nova_loja(async_session, "pro")
    _, _, token_b = await _nova_loja(async_session, "pro")
    cid = await _cliente(test_client, token_a, "Cliente Exclusiva da Loja A")

    r = await test_client.get(f"/api/v1/customers/{cid}", headers=_h(token_b))
    assert r.status_code == 404, f"loja B leu cliente da loja A: {r.text[:200]}"
    assert "Rua Secreta" not in r.text
    assert (await test_client.put(f"/api/v1/customers/{cid}", headers=_h(token_b), json={"full_name": "Invadida"})).status_code == 404
    assert (await test_client.get(f"/api/v1/customers/{cid}/purchases", headers=_h(token_b))).status_code == 404
    r = await test_client.delete(f"/api/v1/customers/{cid}", headers=_h(token_b))
    assert r.status_code in (403, 404), f"loja B apagou cliente da loja A ({r.status_code})"

    # continua inteira na loja A
    r = await test_client.get(f"/api/v1/customers/{cid}", headers=_h(token_a))
    assert r.status_code == 200 and r.json()["full_name"] == "Cliente Exclusiva da Loja A"
    lista_b = (await test_client.get("/api/v1/customers/", headers=_h(token_b))).json()
    assert cid not in [c["id"] for c in lista_b]
    busca_b = (await test_client.get("/api/v1/customers/", headers=_h(token_b), params={"search": "Exclusiva"})).json()
    assert busca_b == []
