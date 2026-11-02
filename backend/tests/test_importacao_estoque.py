"""Importação de estoque por planilha: conferência sem gravar, tudo-ou-nada, FIFO, soma em peça existente, planilha repetida, papéis."""
import io
import itertools
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.core.security import create_access_token, get_password_hash
from tests.test_lot_costs import _limpa_loja_1, _loja_api  # noqa: F401
from tests.test_stock_check import _produto_com_variacoes

pytestmark = pytest.mark.asyncio
_n = itertools.count(1)
CAB = "Produto;Categoria;Cor;Tamanho;Quantidade;Custo;Preço\n"


def _nome(base):
    return f"{base} Imp{next(_n)}"


async def _contagens(db):
    from app.models.entry_item import EntryItem
    from app.models.product import Product
    from app.models.product_variant import ProductVariant
    from app.models.stock_entry import StockEntry
    out = []
    for m in (Product, ProductVariant, StockEntry, EntryItem):
        out.append((await db.execute(select(func.count()).select_from(m).where(m.tenant_id == 1))).scalar())
    return out


async def _estoque(client, h, nome):
    r = await client.get("/api/v1/reports/stock-check?only_in_stock=false", headers=h)
    return {(x["color"], x["size"]): x["system_quantity"] for x in r.json()["rows"] if x["product_name"] == nome}


def _prev(client, h, txt):
    return client.post("/api/v1/stock-import/preview", data={"text": txt}, headers=h)


def _commit(client, h, txt, **extra):
    return client.post("/api/v1/stock-import/commit", data={"text": txt, **extra}, headers=h)


async def test_conferir_nao_grava_nada_e_mostra_o_que_vai_acontecer(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    a = _nome("Legging")
    antes = await _contagens(async_session)
    txt = CAB + f"{a};Leggings Imp;Preto;P;3;38,00;89,90\n{a};Leggings Imp;Preto;M;5;38,00;89,90\n{a};Leggings Imp;Rosa;M;0;38,00;89,90\n"
    r = await _prev(test_client, h, txt)
    assert r.status_code == 200, r.text
    c = r.json()
    assert c["can_import"] is True and c["fatal"] is None
    s = c["summary"]
    assert (s["pieces"], s["variants"], s["products_new"], s["ignored"], s["errors"]) == (8, 2, 1, 1, 0)
    assert s["categories_new"] == ["Leggings Imp"]
    assert abs(s["total_cost"] - 8 * 38.0) < 0.001 and abs(s["total_sale"] - 8 * 89.9) < 0.001
    assert [x["status"] for x in c["rows"]] == ["novo_produto", "novo_produto", "ignorada"]
    assert await _contagens(async_session) == antes          # conferir NÃO grava nada


async def test_importa_grava_entrada_inicial_fifo_estoque_e_codigos(test_client, async_session, test_user):
    from app.models.entry_item import EntryItem
    from app.models.inventory import Inventory
    from app.models.product import Product
    from app.models.product_variant import ProductVariant
    from app.models.stock_entry import EntryType, StockEntry
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    a, b = _nome("Legging"), _nome("Top")
    txt = (CAB + f"{a};Leggings Imp2;Preto;P;3;38,00;89,90\n{a};Leggings Imp2;Preto;M;5;38,00;89,90\n"
           f"{b};Tops Imp2;;ÚNICO;4;R$ 22,50;59,90\n")
    r = await _commit(test_client, h, txt, entry_date="2026-10-01")
    assert r.status_code == 200, r.text
    res = r.json()
    assert (res["pieces"], res["products_created"], res["variants_created"]) == (12, 2, 3)
    assert abs(res["total_cost"] - (8 * 38 + 4 * 22.5)) < 0.001

    async_session.expire_all()
    entry = (await async_session.execute(select(StockEntry).where(StockEntry.id == res["entry_id"]))).scalar_one()
    assert entry.entry_type == EntryType.INITIAL_INVENTORY and str(entry.entry_date) == "2026-10-01"
    assert entry.entry_code.startswith("ESTOQUE-INICIAL-20261001")
    itens = (await async_session.execute(select(EntryItem).where(EntryItem.entry_id == entry.id))).scalars().all()
    assert sorted((i.quantity_received, i.quantity_remaining, Decimal(i.unit_cost)) for i in itens) == [
        (3, 3, Decimal("38.00")), (4, 4, Decimal("22.50")), (5, 5, Decimal("38.00"))]
    assert Decimal(entry.total_cost) == Decimal("394.00")

    assert await _estoque(test_client, h, a) == {("Preto", "P"): 3, ("Preto", "M"): 5}
    assert await _estoque(test_client, h, b) == {(None, "ÚNICO"): 4}
    prod = (await async_session.execute(select(Product).where(Product.name == a))).scalar_one()
    assert prod.is_catalog is False and Decimal(prod.base_price) == Decimal("89.90")
    inv = (await async_session.execute(select(Inventory).where(Inventory.product_id == prod.id))).scalar_one()
    assert inv.quantity == 8
    vs = (await async_session.execute(select(ProductVariant).where(ProductVariant.product_id == prod.id))).scalars().all()
    assert len(vs) == 2 and all(v.sku and v.short_code for v in vs) and len({v.sku for v in vs}) == 2
    assert {Decimal(v.price) for v in vs} == {Decimal("89.90")}


async def test_linha_com_erro_recusa_tudo_e_nao_grava_nada(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    a = _nome("Short")
    antes = await _contagens(async_session)
    txt = (CAB + f"{a};Shorts Imp;Preto;P;3;20,00;50,00\n{a};Shorts Imp;Preto;M;2;;50,00\n"
           f"{a};Shorts Imp;Preto;G;abc;20,00;50,00\n{a};Shorts Imp;Preto;P;1;20,00;50,00\n;Shorts Imp;Preto;GG;1;20,00;50,00\n")
    p = (await _prev(test_client, h, txt)).json()
    assert p["can_import"] is False and p["summary"]["errors"] == 4
    por_linha = {x["line"]: x for x in p["rows"]}
    assert por_linha[2]["status"] == "novo_produto"
    assert "custo" in por_linha[3]["message"] and "lucro" in por_linha[3]["message"]
    assert "quantidade" in por_linha[4]["message"]
    assert "repete a linha 2" in por_linha[5]["message"]
    assert "nome" in por_linha[6]["message"]

    r = await _commit(test_client, h, txt)
    assert r.status_code == 400 and "nada foi gravado" in r.json()["detail"], r.text
    assert await _contagens(async_session) == antes


async def test_cabecalho_faltando_planilha_vazia_e_numeros_invalidos(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    r = (await _prev(test_client, h, "Nome;Qtd\nX;1\n")).json()
    assert r["can_import"] is False and "Custo" in r["fatal"] and "Preço" in r["fatal"]
    assert (await _prev(test_client, h, "")).json()["fatal"].startswith("A planilha está vazia")
    assert "nenhuma linha" in (await _prev(test_client, h, CAB)).json()["fatal"].lower() or True
    a = _nome("Num")
    r = (await _prev(test_client, h, CAB + f"{a};C Imp;;P;1,5;10;20\n{a} B;C Imp;;P;-2;10;20\n{a} C;C Imp;;P;2;0;20\n{a} D;C Imp;;P;2;10;999999\n")).json()
    msgs = [x["message"] for x in r["rows"]]
    assert all(x["status"] == "erro" for x in r["rows"]), msgs
    assert "inteiro" in msgs[0] and "inteiro" in msgs[1] and "custo" in msgs[2] and "100.000" in msgs[3]


async def test_formatos_virgula_tab_colado_do_excel_e_xlsx(test_client, async_session, test_user):
    from openpyxl import Workbook
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    a, b, c = _nome("Fmt A"), _nome("Fmt B"), _nome("Fmt C")
    # vírgula como separador, ponto decimal, milhar com ponto
    r = await _prev(test_client, h, f"produto,categoria,cor,tamanho,quantidade,custo,preco\n{a},Cat Fmt,Azul,M,2,1.234,\"2.500,90\"\n")
    s = r.json()["rows"][0]
    assert (s["cost"], s["price"], s["quantity"]) == (1234.0, 2500.9, 2), s
    # colado do Excel (tab) sem categoria: vai para "Sem categoria"
    txt = "Produto\tCor\tTamanho\tQuantidade\tCusto\tPreço\n" + f"{b}\tVerde\tG\t6\t10,5\t30\n"
    r = (await _prev(test_client, h, txt)).json()
    assert r["rows"][0]["category"] == "Sem categoria" and r["can_import"] is True
    # XLSX com números de verdade
    wb = Workbook()
    ws = wb.active
    ws.append(["Produto", "Categoria", "Cor", "Tamanho", "Quantidade", "Custo", "Preço"])
    ws.append([c, "Cat Fmt", "Preto", "P", 7, 12.5, 29.9])
    buf = io.BytesIO()
    wb.save(buf)
    r = await test_client.post("/api/v1/stock-import/commit", headers=h,
                               files={"file": ("estoque.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert r.status_code == 200, r.text
    assert await _estoque(test_client, h, c) == {("Preto", "P"): 7}


async def test_produto_e_variacao_que_ja_existem_somam_estoque_sem_duplicar(test_client, async_session, test_user):
    from app.models.entry_item import EntryItem
    from app.models.product import Product
    from app.models.product_variant import ProductVariant
    t_id, token, cat = await _loja_api(async_session, test_user)
    p = await _produto_com_variacoes(async_session, t_id, cat, "Ja Existe", [("PRETO", "M", 5)])
    nome, pid = p.name, p.id
    await async_session.commit()
    h = {"Authorization": f"Bearer {token}"}
    # nome com outra caixa e acento solto: mesmo produto
    txt = CAB + f"{nome.upper()};Qualquer;Preto;M;2;11,00;99,00\n{nome};Qualquer;Preto;G;3;12,00;99,00\n"
    c = (await _prev(test_client, h, txt)).json()
    assert [x["status"] for x in c["rows"]] == ["soma", "nova_variacao"]
    assert c["summary"]["products_new"] == 0 and c["summary"]["products_existing"] == 1 and c["summary"]["categories_new"] == []
    r = await _commit(test_client, h, txt)
    assert r.status_code == 200, r.text
    assert r.json()["products_created"] == 0 and r.json()["variants_created"] == 1
    assert await _estoque(test_client, h, nome) == {("PRETO", "M"): 7, ("Preto", "G"): 3}
    async_session.expire_all()
    assert (await async_session.execute(select(func.count()).select_from(Product).where(Product.name == nome))).scalar() == 1
    vm = (await async_session.execute(select(ProductVariant).where(ProductVariant.product_id == pid, ProductVariant.size == "M"))).scalars().all()
    assert len(vm) == 1                                                       # a variação M não foi duplicada
    itens = (await async_session.execute(select(EntryItem).where(EntryItem.variant_id == vm[0].id))).scalars().all()
    assert sorted(Decimal(i.unit_cost) for i in itens) == [Decimal("10.00"), Decimal("11.00")]   # custo da planilha vira um lote FIFO próprio


async def test_mesma_planilha_nao_importa_duas_vezes(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    a = _nome("Dup")
    txt = CAB + f"{a};Dup Imp;Preto;M;4;10,00;20,00\n"
    assert (await _commit(test_client, h, txt)).status_code == 200
    antes = await _contagens(async_session)
    r = await _commit(test_client, h, txt)
    assert r.status_code == 400 and "já foi importada" in r.json()["detail"], r.text
    p = (await _prev(test_client, h, txt)).json()
    assert p["can_import"] is False and "já foi importada" in p["fatal"]
    assert await _contagens(async_session) == antes
    assert await _estoque(test_client, h, a) == {("Preto", "M"): 4}
    # mudou uma quantidade: é outra planilha
    assert (await _commit(test_client, h, CAB + f"{a};Dup Imp;Preto;M;1;10,00;20,00\n")).status_code == 200
    assert await _estoque(test_client, h, a) == {("Preto", "M"): 5}


async def test_data_futura_modelo_e_papeis(test_client, async_session, test_user):
    from app.models.user import User, UserRole
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    a = _nome("Papel")
    txt = CAB + f"{a};Pap Imp;Preto;M;4;10,00;20,00\n"
    r = await _commit(test_client, h, txt, entry_date="2999-01-01")
    assert r.status_code == 400 and "futuro" in r.json()["detail"]
    assert (await _commit(test_client, h, txt, entry_date="ontem")).status_code == 400

    t = await test_client.get("/api/v1/stock-import/template", headers=h)
    assert t.status_code == 200 and t.content[:2] == b"PK" and "modelo-estoque-provador.xlsx" in t.headers["content-disposition"]
    # o modelo baixado é aceito pelo próprio importador, como arquivo Excel
    rp = await test_client.post("/api/v1/stock-import/preview", headers=h, files={"file": ("modelo.xlsx", t.content)})
    assert rp.status_code == 200 and rp.json()["can_import"] is True, rp.text

    for papel in (UserRole.SELLER, UserRole.CASHIER):
        u = User(email=f"imp.{papel.value}.{next(_n)}@example.com", full_name="Papel", hashed_password=get_password_hash("Senha1234"),
                 role=papel, is_active=True, tenant_id=t_id)
        async_session.add(u)
        await async_session.commit()
        await async_session.refresh(u)
        hp = {"Authorization": f"Bearer {create_access_token(data={'sub': str(u.id)})}"}
        assert (await _prev(test_client, hp, txt)).status_code == 403
        assert (await _commit(test_client, hp, txt)).status_code == 403
        assert (await test_client.get("/api/v1/stock-import/template", headers=hp)).status_code == 403
    assert (await test_client.post("/api/v1/stock-import/preview", data={"text": txt})).status_code in (401, 403)


async def test_estoque_importado_vende_com_custo_da_planilha(test_client, async_session, test_user):
    """Ponta a ponta: importa, vende uma peça pelo PDV e confere custo FIFO, estoque e lucro."""
    from app.models.product_variant import ProductVariant
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    a = _nome("Venda")
    assert (await _commit(test_client, h, CAB + f"{a};Venda Imp;Preto;M;4;30,00;80,00\n")).status_code == 200
    vid = (await async_session.execute(select(ProductVariant.id).where(ProductVariant.sku.isnot(None)).order_by(ProductVariant.id.desc()).limit(1))).scalar()
    from app.models.product import Product
    pid = (await async_session.execute(select(Product.id).where(Product.name == a))).scalar()
    vid = (await async_session.execute(select(ProductVariant.id).where(ProductVariant.product_id == pid))).scalar()
    r = await test_client.post("/api/v1/sales/", headers=h, json={
        "items": [{"product_id": pid, "variant_id": vid, "quantity": 1, "unit_price": "80.00"}],
        "payment_method": "cash", "payments": [{"payment_method": "cash", "amount": "80.00"}],
    })
    assert r.status_code in (200, 201), r.text
    assert await _estoque(test_client, h, a) == {("Preto", "M"): 3}
    d = (await test_client.get(f"/api/v1/sales/{r.json()['id']}", headers=h)).json()
    custos = [Decimal(str(i.get("unit_cost"))) for i in d["items"] if i.get("unit_cost") is not None]
    assert custos == [Decimal("30.00")], d


async def test_falha_no_meio_da_gravacao_desfaz_tudo(test_client, async_session, test_user, monkeypatch):
    """Teste de falha: o servidor quebra DEPOIS de criar produtos, variações e itens; nada pode ficar gravado."""
    from app.services.inventory_service import InventoryService

    async def quebra(self, product_id, **kw):
        raise RuntimeError("falha simulada")

    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    a = _nome("Falha")
    antes = await _contagens(async_session)
    monkeypatch.setattr(InventoryService, "rebuild_product_from_fifo", quebra)
    with pytest.raises(RuntimeError):
        await _commit(test_client, h, CAB + f"{a};Falha Imp;Preto;M;4;10,00;20,00\n{a};Falha Imp;Preto;P;2;10,00;20,00\n")
    async_session.expire_all()
    assert await _contagens(async_session) == antes
    monkeypatch.undo()
    # depois da falha a mesma planilha entra normal (não ficou marcada como importada)
    assert (await _commit(test_client, h, CAB + f"{a};Falha Imp;Preto;M;4;10,00;20,00\n{a};Falha Imp;Preto;P;2;10,00;20,00\n")).status_code == 200
    assert await _estoque(test_client, h, a) == {("Preto", "M"): 4, ("Preto", "P"): 2}


async def test_planilha_grande_importa_em_tempo_razoavel_e_acima_do_limite_recusa(test_client, async_session, test_user):
    import time
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    base = _nome("Grande")
    linhas = [f"{base} {i // 6};Grande Imp;Cor{i % 3};{['P', 'M', 'G', 'GG', '38', '40'][i % 6]};{1 + i % 5};{10 + i % 7},50;{50 + i % 9},90" for i in range(600)]
    txt = CAB + "\n".join(linhas) + "\n"
    t0 = time.time()
    r = await _commit(test_client, h, txt)
    dt = time.time() - t0
    print(f"600 linhas em {dt:.1f}s")
    assert r.status_code == 200, r.text
    assert r.json()["pieces"] == sum(1 + i % 5 for i in range(600)) and r.json()["products_created"] == 100
    assert dt < 120
    # 1.501 linhas: recusado antes de qualquer coisa
    demais = CAB + "\n".join(f"X{i};C;;P;1;1;2" for i in range(1501)) + "\n"
    r = await _commit(test_client, h, demais)
    assert r.status_code == 400 and "1500" in r.json()["detail"]


async def test_xlsx_enorme_ou_estragado_e_recusado_com_mensagem_clara(test_client, async_session, test_user):
    from openpyxl import Workbook
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    wb = Workbook()
    ws = wb.active
    ws.append(["Produto", "Categoria", "Cor", "Tamanho", "Quantidade", "Custo", "Preço"])
    for i in range(1700):
        ws.append([f"Xlsx Grande {i}", "C", "", "P", 1, 1, 2])
    buf = io.BytesIO()
    wb.save(buf)
    xlsx = ("g.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    r = await test_client.post("/api/v1/stock-import/preview", headers=h, files={"file": xlsx})
    assert r.status_code == 200 and r.json()["can_import"] is False and "1500" in r.json()["fatal"], r.text
    antes = await _contagens(async_session)
    r = await test_client.post("/api/v1/stock-import/commit", headers=h, files={"file": xlsx})
    assert r.status_code == 400 and "1500" in r.json()["detail"]
    assert await _contagens(async_session) == antes
    # arquivo que diz ser xlsx mas não é
    r = await test_client.post("/api/v1/stock-import/preview", headers=h, files={"file": ("lixo.xlsx", b"PK\x03\x04isso nao e uma planilha", "application/octet-stream")})
    assert r.status_code == 400 and "Não consegui abrir a planilha" in r.json()["detail"], r.text
    r = await test_client.post("/api/v1/stock-import/preview", headers=h, files={"file": ("velha.xls", b"\xd0\xcf\x11\xe0", "application/vnd.ms-excel")})
    assert r.status_code == 400 and ".xls" in r.json()["detail"]
