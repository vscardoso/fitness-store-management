"""Baixa de estoque pela Conferência: desligada por padrão, só admin liga e usa, FIFO, tudo ou nada, movimento registrado."""
import pytest
from sqlalchemy import select

from app.core.security import create_access_token, get_password_hash
from tests.test_lot_costs import _limpa_loja_1, _loja_api  # noqa: F401  (_limpa_loja_1 é fixture autouse)
from tests.test_stock_check import _n, _produto_com_variacoes

pytestmark = pytest.mark.asyncio


async def _qtd(client, h, cat, nome):
    r = await client.get(f"/api/v1/reports/stock-check?category_id={cat}", headers=h)
    return {(x["color"], x["size"]): x["system_quantity"] for x in r.json()["rows"] if x["product_name"] == nome}


async def _variantes(db, nome):
    from app.models.product import Product
    from app.models.product_variant import ProductVariant
    p = (await db.execute(select(Product).where(Product.name == nome))).scalars().first()
    vs = (await db.execute(select(ProductVariant).where(ProductVariant.product_id == p.id))).scalars().all()
    return p, {(v.color, v.size): v.id for v in vs}


async def test_baixa_desligada_por_padrao_depois_ligada_pelo_admin(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    p = await _produto_com_variacoes(async_session, t_id, cat, "Baixa A", [("Preto", "M", 5)])
    nome = p.name
    await async_session.commit()
    h = {"Authorization": f"Bearer {token}"}
    _, vs = await _variantes(async_session, nome)
    vid = vs[("Preto", "M")]
    corpo = {"reason": "avaria", "note": "rasgou", "items": [{"variant_id": vid, "quantity": 2}]}

    assert (await test_client.get("/api/v1/store/stock-writeoff-settings", headers=h)).json() == {"enabled": False}
    r = await test_client.post("/api/v1/reports/stock-check/writeoff", json=corpo, headers=h)
    assert r.status_code == 403, r.text
    assert (await _qtd(test_client, h, cat, nome))[("Preto", "M")] == 5          # nada mudou

    assert (await test_client.put("/api/v1/store/stock-writeoff-settings", json={"enabled": True}, headers=h)).json() == {"enabled": True}
    r = await test_client.post("/api/v1/reports/stock-check/writeoff", json=corpo, headers=h)
    assert r.status_code == 200 and r.json()["total_pecas"] == 2, r.text
    assert (await _qtd(test_client, h, cat, nome))[("Preto", "M")] == 3


async def test_baixa_maior_que_o_estoque_e_lote_misto_nao_gravam_nada(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    p = await _produto_com_variacoes(async_session, t_id, cat, "Baixa B", [("Preto", "M", 4), ("Preto", "G", 1)])
    nome = p.name
    await async_session.commit()
    h = {"Authorization": f"Bearer {token}"}
    _, vs = await _variantes(async_session, nome)
    await test_client.put("/api/v1/store/stock-writeoff-settings", json={"enabled": True}, headers=h)

    r = await test_client.post("/api/v1/reports/stock-check/writeoff", headers=h, json={
        "reason": "perda", "items": [{"variant_id": vs[("Preto", "M")], "quantity": 2}, {"variant_id": vs[("Preto", "G")], "quantity": 5}]})
    assert r.status_code == 400, r.text                                              # G só tem 1
    assert await _qtd(test_client, h, cat, nome) == {("Preto", "M"): 4, ("Preto", "G"): 1}   # M também não mexeu

    r = await test_client.post("/api/v1/reports/stock-check/writeoff", headers=h, json={"reason": "outro", "items": [{"variant_id": vs[("Preto", "M")], "quantity": 1}]})
    assert r.status_code == 400
    r = await test_client.post("/api/v1/reports/stock-check/writeoff", headers=h, json={"reason": "perda", "items": [{"variant_id": vs[("Preto", "M")], "quantity": 0}]})
    assert r.status_code == 422


async def test_baixa_registra_movimento_e_desconta_do_saldo_do_produto(test_client, async_session, test_user):
    from app.models.inventory import Inventory, InventoryMovement
    t_id, token, cat = await _loja_api(async_session, test_user)
    p = await _produto_com_variacoes(async_session, t_id, cat, "Baixa C", [("Preto", "M", 6)])
    nome, pid = p.name, p.id
    async_session.add(Inventory(product_id=pid, quantity=6, min_stock=1, tenant_id=t_id))
    await async_session.commit()
    h = {"Authorization": f"Bearer {token}"}
    _, vs = await _variantes(async_session, nome)
    await test_client.put("/api/v1/store/stock-writeoff-settings", json={"enabled": True}, headers=h)
    r = await test_client.post("/api/v1/reports/stock-check/writeoff", headers=h, json={
        "reason": "furto", "note": "sumiu da arara", "items": [{"variant_id": vs[("Preto", "M")], "quantity": 2}]})
    assert r.status_code == 200, r.text
    async_session.expire_all()
    inv = (await async_session.execute(select(Inventory).where(Inventory.product_id == pid))).scalars().first()
    assert inv.quantity == 4
    mv = (await async_session.execute(select(InventoryMovement).where(InventoryMovement.inventory_id == inv.id))).scalars().all()
    assert len(mv) == 1 and mv[0].quantity_change == -2 and "furto" in mv[0].notes and "sumiu da arara" in mv[0].notes


async def test_caixa_nao_liga_nem_da_baixa(test_client, async_session, test_user):
    from app.models.user import User, UserRole
    t_id, token, cat = await _loja_api(async_session, test_user)
    u = User(email=f"caixa.baixa.{next(_n)}@example.com", full_name="Caixa Baixa", hashed_password=get_password_hash("Senha1234"),
             role=UserRole.CASHIER, is_active=True, tenant_id=t_id)
    async_session.add(u)
    await async_session.commit()
    await async_session.refresh(u)
    hc = {"Authorization": f"Bearer {create_access_token(data={'sub': str(u.id)})}"}
    assert (await test_client.put("/api/v1/store/stock-writeoff-settings", json={"enabled": True}, headers=hc)).status_code == 403
    r = await test_client.post("/api/v1/reports/stock-check/writeoff", headers=hc, json={"reason": "perda", "items": [{"variant_id": 1, "quantity": 1}]})
    assert r.status_code == 403


async def test_baixa_que_zera_pode_excluir_a_variacao_so_se_zerou_e_nunca_vendeu(test_client, async_session, test_user):
    """Cadastro errado: zerou e nunca vendeu = pode excluir junto; sobrou peça ou já vendeu = recusa e nada é gravado."""
    from app.models.product_variant import ProductVariant
    t_id, token, cat = await _loja_api(async_session, test_user)
    p = await _produto_com_variacoes(async_session, t_id, cat, "Baixa Exclui", [("Preto", "M", 1), ("Preto", "G", 2), ("Branco", "M", 1)])
    nome = p.name
    await async_session.commit()
    h = {"Authorization": f"Bearer {token}"}
    await test_client.put("/api/v1/store/stock-writeoff-settings", json={"enabled": True}, headers=h)
    _, vs = await _variantes(async_session, nome)
    v_um, v_dois, v_branco = vs[("Preto", "M")], vs[("Preto", "G")], vs[("Branco", "M")]

    linhas = (await test_client.get(f"/api/v1/reports/stock-check?category_id={cat}", headers=h)).json()["rows"]
    assert all(l["ever_sold"] is False for l in linhas if l["product_name"] == nome)                  # a tela decide pelo que o servidor diz

    # sobra peça (baixa 1 de 2): pedir para excluir é recusado e a baixa NÃO é gravada
    r = await test_client.post("/api/v1/reports/stock-check/writeoff", headers=h, json={
        "reason": "ajuste", "note": "erro", "items": [{"variant_id": v_dois, "quantity": 1, "delete_variation": True}]})
    assert r.status_code == 400 and "sobram" in r.json()["detail"], r.text
    assert (await _qtd(test_client, h, cat, nome))[("Preto", "G")] == 2                                # nada mudou

    # baixa parcial sem pedir exclusão: mantém a variação com 1 peça (o caso "diminuir 1 e ficar 2")
    ok = await test_client.post("/api/v1/reports/stock-check/writeoff", headers=h, json={
        "reason": "ajuste", "items": [{"variant_id": v_dois, "quantity": 1}]})
    assert ok.status_code == 200 and "variation_deleted" not in ok.json()["items"][0]
    assert (await _qtd(test_client, h, cat, nome))[("Preto", "G")] == 1

    # zerou e nunca vendeu: exclui junto
    r2 = await test_client.post("/api/v1/reports/stock-check/writeoff", headers=h, json={
        "reason": "ajuste", "note": "cadastro errado", "items": [{"variant_id": v_um, "quantity": 1, "delete_variation": True}]})
    assert r2.status_code == 200, r2.text
    assert r2.json()["items"][0]["variation_deleted"] is True
    async_session.expire_all()
    v = (await async_session.execute(select(ProductVariant).where(ProductVariant.id == v_um))).scalar_one()
    assert v.is_active is False
    outras = {k: x for k, x in (await _qtd(test_client, h, cat, nome)).items()}
    assert ("Preto", "M") not in outras and outras[("Preto", "G")] == 1 and outras[("Branco", "M")] == 1   # as outras ficaram

    # sem pedir exclusão, zerar mantém a variação (0 un): é a baixa comum
    r3 = await test_client.post("/api/v1/reports/stock-check/writeoff", headers=h, json={
        "reason": "perda", "items": [{"variant_id": v_branco, "quantity": 1}]})
    assert r3.status_code == 200
    async_session.expire_all()
    vb = (await async_session.execute(select(ProductVariant).where(ProductVariant.id == v_branco))).scalar_one()
    assert vb.is_active is True


async def test_variacao_que_ja_vendeu_nao_pode_ser_excluida_pela_baixa(test_client, async_session, test_user):
    from app.models.product import Product
    from app.models.product_variant import ProductVariant
    from tests.test_troca import _vender
    t_id, token, cat = await _loja_api(async_session, test_user)
    p = await _produto_com_variacoes(async_session, t_id, cat, "Baixa Vendida", [("Preto", "M", 2)])
    nome = p.name
    await async_session.commit()
    h = {"Authorization": f"Bearer {token}"}
    await test_client.put("/api/v1/store/stock-writeoff-settings", json={"enabled": True}, headers=h)
    prod, vs = await _variantes(async_session, nome)
    vid = vs[("Preto", "M")]
    variante = (await async_session.execute(select(ProductVariant).where(ProductVariant.id == vid))).scalar_one()
    await _vender(test_client, h, prod, variante, 1, 50)                                                   # 1 vendida, sobra 1

    linhas = (await test_client.get(f"/api/v1/reports/stock-check?category_id={cat}", headers=h)).json()["rows"]
    assert [l["ever_sold"] for l in linhas if l["product_name"] == nome] == [True]                        # a tela não oferece excluir
    r = await test_client.post("/api/v1/reports/stock-check/writeoff", headers=h, json={
        "reason": "ajuste", "items": [{"variant_id": vid, "quantity": 1, "delete_variation": True}]})
    assert r.status_code == 400 and "já foi vendida" in r.json()["detail"], r.text                         # o servidor também recusa
    assert (await _qtd(test_client, h, cat, nome))[("Preto", "M")] == 1                                    # a baixa não foi gravada
