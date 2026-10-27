"""SKU repetido não derruba mais a criação; registro de erros (error_logs) grava sem segredo e sem atrapalhar."""
import itertools
from datetime import date

import pytest
from sqlalchemy import select

from tests.test_lot_costs import _loja_api, _limpa_loja_1, D  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio
_n = itertools.count(1)


def test_proximo_sku_na_sequencia():
    from app.services.stock_entry_service import StockEntryService as S
    assert S._bump_sku("ALO-CONJUN-001") == "ALO-CONJUN-002"
    assert S._bump_sku("ALOCONJUN001-MAR-G-001") == "ALOCONJUN001-MAR-G-002"
    assert S._bump_sku("ABC-099") == "ABC-100"
    assert S._bump_sku("SEMNUMERO") == "SEMNUMERO-002"
    assert S._bump_sku("X9") == "X10"


def _variants(prefix, n):
    return [{"sku": f"{prefix}-{c}-001", "color": c, "size": "M", "price": 30, "cost_price": 10, "quantity": 2}
            for c in ("PRE", "AZU")][:n]


async def _criar(test_client, h, cat, nome, prefix, code):
    return await test_client.post("/api/v1/stock-entries/with-new-product-variants", headers=h, json={
        "entry_code": code, "entry_date": date.today().isoformat(), "entry_type": "local",
        "supplier_name": "Fornecedor Teste", "product_name": nome, "product_category_id": cat, "base_price": 30,
        "variants": _variants(prefix, 2)})


async def test_sku_repetido_recebe_o_proximo_numero_em_vez_de_dar_erro(test_client, async_session, test_user):
    from app.models.product_variant import ProductVariant
    from app.models.error_log import ErrorLog
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    n = next(_n)
    prefix = f"CONJ{n}"

    r1 = await _criar(test_client, h, cat, f"Conjunto com manga {n}", prefix, f"E1-{n:04d}")
    assert r1.status_code in (200, 201), r1.text
    # segundo cadastro com os MESMOS SKUs (o app dele ainda não conhecia os do primeiro)
    r2 = await _criar(test_client, h, cat, f"Conjunto sem manga {n}", prefix, f"E2-{n:04d}")
    assert r2.status_code in (200, 201), r2.text

    skus = [s for (s,) in (await async_session.execute(
        select(ProductVariant.sku).where(ProductVariant.sku.like(f"{prefix}-%")))).all()]
    assert sorted(skus) == sorted([f"{prefix}-PRE-001", f"{prefix}-AZU-001", f"{prefix}-PRE-002", f"{prefix}-AZU-002"])
    assert len(set(skus)) == 4                                   # nenhum SKU duplicado

    ajustes = (await async_session.execute(select(ErrorLog).where(ErrorLog.error_type == "sku_ajustado"))).scalars().all()
    assert ajustes and ajustes[-1].level == "info"               # o ajuste fica registrado para consulta
    await async_session.execute(ErrorLog.__table__.delete().where(ErrorLog.error_type == "sku_ajustado"))
    await async_session.commit()


async def test_sku_repetido_dentro_do_mesmo_envio_continua_recusado_pela_validacao(test_client, async_session, test_user):
    """Dentro do MESMO envio o SKU repetido é erro do formulário (validação), não corrida: continua 422 claro."""
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    n = next(_n)
    r = await test_client.post("/api/v1/stock-entries/with-new-product-variants", headers=h, json={
        "entry_code": f"DUP-{n:04d}", "entry_date": date.today().isoformat(), "entry_type": "local",
        "supplier_name": "Fornecedor Teste", "product_name": f"Duplicado {n}", "product_category_id": cat, "base_price": 30,
        "variants": [
            {"sku": f"DUP{n}-001", "color": "Preto", "size": "P", "price": 30, "cost_price": 10, "quantity": 1},
            {"sku": f"DUP{n}-001", "color": "Preto", "size": "M", "price": 30, "cost_price": 10, "quantity": 1},
        ]})
    assert r.status_code == 422 and "SKU repetido" in r.text


# ───────────────────────── registro de erros ─────────────────────────

async def test_erro_de_gravacao_vai_para_o_registro_sem_segredo(test_client, async_session, test_user):
    from app.models.error_log import ErrorLog
    t_id, token, cat = await _loja_api(async_session, test_user)
    uid, tid = test_user.id, test_user.tenant_id
    h = {"Authorization": f"Bearer {token}"}
    # 400/422 em rota de gravação: despesa com valor inválido
    r = await test_client.post("/api/v1/expenses", headers=h, json={
        "amount": "0", "description": "x", "expense_date": date.today().isoformat(), "password": "SENHA-SECRETA-123"})
    assert r.status_code == 422
    async_session.expire_all()
    row = (await async_session.execute(select(ErrorLog).where(ErrorLog.path == "/api/v1/expenses")
                                       .order_by(ErrorLog.id.desc()).limit(1))).scalar_one()
    assert row.status_code == 422 and row.method == "POST" and row.source == "api"
    assert row.user_id == uid and row.tenant_id == tid
    assert "SENHA-SECRETA-123" not in (row.detail or "") and "SENHA-SECRETA-123" not in row.message
    await async_session.execute(ErrorLog.__table__.delete().where(ErrorLog.id == row.id))
    await async_session.commit()


async def test_leitura_e_envio_de_erros_do_app(test_client, async_session, test_user):
    from app.models.error_log import ErrorLog
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    r = await test_client.post("/api/v1/client-logs", headers=h, json={
        "message": "Tela quebrou ao abrir a entrada", "route": "/entries/9",
        "context": {"token": "abc123", "passo": "abrir"}, "app_version": "1.0.9"})
    assert r.status_code == 202, r.text
    lista = (await test_client.get("/api/v1/error-logs?source=app&limit=5", headers=h)).json()
    achado = next(x for x in lista if x["mensagem"] == "Tela quebrou ao abrir a entrada")
    assert achado["origem"] == "app" and achado["rota"] == "/entries/9"
    assert "abc123" not in (achado["detalhe"] or "") and "abrir" in (achado["detalhe"] or "")
    await async_session.execute(ErrorLog.__table__.delete().where(ErrorLog.source == "app"))
    await async_session.commit()


async def test_erro_ao_gravar_o_registro_nunca_derruba_a_requisicao(test_client, async_session, test_user, monkeypatch):
    import app.core.database as db_module
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}

    def quebrado():
        raise RuntimeError("banco do log fora do ar")

    monkeypatch.setattr(db_module, "async_session_maker", quebrado)
    r = await test_client.post("/api/v1/expenses", headers=h, json={
        "amount": "0", "description": "x", "expense_date": date.today().isoformat()})
    assert r.status_code == 422                                   # a resposta normal continua saindo


async def test_ruido_nao_vai_para_o_registro():
    from app.services.error_log_service import should_log
    assert not should_log("GET", "/api/v1/products", 404)         # consulta que não achou
    assert not should_log("POST", "/api/v1/auth/login", 401)      # senha errada (já tem auditoria)
    assert not should_log("GET", "/health", 500)
    assert should_log("POST", "/api/v1/expenses", 400)
    assert should_log("GET", "/api/v1/products", 500)


# ───────────────────────── outra variação numa entrada existente ─────────────────────────

async def test_lancar_outra_variacao_de_produto_ja_cadastrado_numa_entrada(test_client, async_session, test_user):
    from app.models.entry_item import EntryItem
    from app.models.product_variant import ProductVariant
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    n = next(_n)
    r = await _criar(test_client, h, cat, f"Conjunto Pantalona {n}", f"CPA{n}", f"VAR-{n:04d}")
    assert r.status_code in (200, 201), r.text
    entry_id = r.json()["id"]
    pid = (await async_session.execute(select(ProductVariant.product_id).where(ProductVariant.sku == f"CPA{n}-PRE-001"))).scalar_one()

    # faltou 1 peça de uma variação que NÃO existe: Preto G
    r = await test_client.post(f"/api/v1/stock-entries/{entry_id}/variants", headers=h, json={
        "product_id": pid, "color": "Preto", "size": "G", "quantity": 1, "cost_price": 10})
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["variant_created"] is True and out["color"] == "Preto" and out["size"] == "G"
    assert out["sku"].startswith(f"CPA{n}-") and out["sku"].endswith("-001")     # SKU derivado das outras variações
    v = (await async_session.execute(select(ProductVariant).where(ProductVariant.id == out["variant_id"]))).scalar_one()
    assert float(v.price) == 30.0 and float(v.cost_price) == 10.0                 # preço herdado das irmãs
    it = (await async_session.execute(select(EntryItem).where(EntryItem.id == out["item_id"]))).scalar_one()
    assert it.entry_id == entry_id and it.quantity_received == 1 and it.quantity_remaining == 1

    # a mesma variação de novo: não cria outra, soma uma nova linha de entrada na variação existente
    r2 = await test_client.post(f"/api/v1/stock-entries/{entry_id}/variants", headers=h, json={
        "product_id": pid, "color": "Preto", "size": "G", "quantity": 2, "cost_price": 10})
    assert r2.status_code == 201 and r2.json()["variant_created"] is False
    assert r2.json()["variant_id"] == out["variant_id"]
    qtd = (await async_session.execute(select(ProductVariant).where(ProductVariant.product_id == pid))).scalars().all()
    assert len(qtd) == 3                                                        # P, M(preto/azul) existentes + Preto G


async def test_outra_variacao_com_dado_invalido_nao_grava_nada(test_client, async_session, test_user):
    from app.models.product_variant import ProductVariant
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    n = next(_n)
    r = await _criar(test_client, h, cat, f"Legging {n}", f"LEG{n}", f"VAR2-{n:04d}")
    assert r.status_code in (200, 201), r.text
    entry_id = r.json()["id"]
    pid = (await async_session.execute(select(ProductVariant.product_id).where(ProductVariant.sku == f"LEG{n}-PRE-001"))).scalar_one()
    antes = len((await async_session.execute(select(ProductVariant).where(ProductVariant.product_id == pid))).scalars().all())

    sem_custo = await test_client.post(f"/api/v1/stock-entries/{entry_id}/variants", headers=h, json={
        "product_id": pid, "color": "Rosa", "size": "GG", "quantity": 1, "cost_price": 0})
    assert sem_custo.status_code == 400                                          # custo é obrigatório
    sem_nada = await test_client.post(f"/api/v1/stock-entries/{entry_id}/variants", headers=h, json={
        "product_id": pid, "quantity": 1, "cost_price": 10})
    assert sem_nada.status_code == 400
    async_session.expire_all()
    depois = len((await async_session.execute(select(ProductVariant).where(ProductVariant.product_id == pid))).scalars().all())
    assert depois == antes                                                       # nada ficou criado pela metade


# ───────────────────────── nome da categoria ─────────────────────────

def test_nome_da_categoria_primeira_letra_de_cada_palavra_maiuscula():
    from app.schemas.category import title_case_words as t
    assert t("leggings e calças") == "Leggings E Calças"
    assert t("  CONJUNTO   pantalona ") == "Conjunto Pantalona"
    assert t("meia-calça fitness") == "Meia-Calça Fitness"
    assert t("água de coco") == "Água De Coco"
    assert t("short 2 em 1") == "Short 2 Em 1"


async def test_api_cria_e_edita_categoria_com_nome_padronizado(test_client, async_session, test_user):
    from app.models.category import Category
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    n = next(_n)
    r = await test_client.post("/api/v1/categories/", headers=h, json={"name": f"conjuntos de verão {n}"})
    assert r.status_code == 201, r.text
    assert r.json()["name"] == f"Conjuntos De Verão {n}"
    cid = r.json()["id"]
    r = await test_client.put(f"/api/v1/categories/{cid}", headers=h, json={"name": f"TOPS e regatas {n}"})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == f"Tops E Regatas {n}"
    await async_session.execute(Category.__table__.delete().where(Category.id == cid))
    await async_session.commit()


# ───────────────────────── produto simples e variação avulsa ─────────────────────────

async def test_produto_simples_com_sku_repetido_recebe_o_proximo_numero(test_client, async_session, test_user):
    from app.models.product_variant import ProductVariant
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    n = next(_n)
    corpo = lambda nome: {"name": nome, "sku": f"SIMP{n}-PRE-G-001", "price": 99.9, "cost_price": 40,
                          "category_id": cat, "color": "Preto", "size": "G"}
    r1 = await test_client.post("/api/v1/products/", headers=h, json=corpo(f"Macacão A {n}"))
    assert r1.status_code in (200, 201), r1.text
    r2 = await test_client.post("/api/v1/products/", headers=h, json=corpo(f"Macacão B {n}"))   # antes: 400 "SKU já existe"
    assert r2.status_code in (200, 201), r2.text
    skus = sorted(s for (s,) in (await async_session.execute(
        select(ProductVariant.sku).where(ProductVariant.sku.like(f"SIMP{n}-%")))).all())
    assert skus == [f"SIMP{n}-PRE-G-001", f"SIMP{n}-PRE-G-002"]


# ───────────────────── nova entrada de produto existente com variação nova ─────────────────────

async def test_nova_entrada_de_produto_existente_cria_a_variacao_que_faltava(test_client, async_session, test_user):
    from app.models.entry_item import EntryItem
    from app.models.product_variant import ProductVariant
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    n = next(_n)
    r = await _criar(test_client, h, cat, f"Top Alo {n}", f"TOP{n}", f"T1-{n:04d}")
    assert r.status_code in (200, 201), r.text
    pid = (await async_session.execute(select(ProductVariant.product_id).where(ProductVariant.sku == f"TOP{n}-PRE-001"))).scalar_one()
    var_preto = (await async_session.execute(select(ProductVariant.id).where(ProductVariant.sku == f"TOP{n}-PRE-001"))).scalar_one()

    # compra NOVA do mesmo produto: 2 peças da variação existente + 1 de uma cor que ainda não existe
    r2 = await test_client.post("/api/v1/stock-entries/", headers=h, json={
        "entry_code": f"T2-{n:04d}", "entry_date": date.today().isoformat(), "entry_type": "local",
        "supplier_name": "Fornecedor Teste",
        "items": [
            {"product_id": pid, "variant_id": var_preto, "quantity_received": 2, "unit_cost": "10.00"},
            {"product_id": pid, "quantity_received": 1, "unit_cost": "12.00",
             "new_variant": {"color": "Rosa", "size": "M"}},
        ]})
    assert r2.status_code == 201, r2.text
    entry2 = r2.json()["id"]
    async_session.expire_all()
    rosa = (await async_session.execute(select(ProductVariant).where(
        ProductVariant.product_id == pid, ProductVariant.color == "Rosa"))).scalar_one()
    assert rosa.sku.startswith(f"TOP{n}-") and float(rosa.price) == 30.0 and float(rosa.cost_price) == 12.0
    itens = (await async_session.execute(select(EntryItem).where(EntryItem.entry_id == entry2))).scalars().all()
    assert sorted((i.variant_id, i.quantity_received) for i in itens) == sorted([(var_preto, 2), (rosa.id, 1)])

    # repetir a mesma variação nova numa terceira compra reaproveita a que já foi criada (não duplica)
    r3 = await test_client.post("/api/v1/stock-entries/", headers=h, json={
        "entry_code": f"T3-{n:04d}", "entry_date": date.today().isoformat(), "entry_type": "local",
        "supplier_name": "Fornecedor Teste",
        "items": [{"product_id": pid, "quantity_received": 3, "unit_cost": "12.00",
                   "new_variant": {"color": "Rosa", "size": "M"}}]})
    assert r3.status_code == 201, r3.text
    async_session.expire_all()
    rosas = (await async_session.execute(select(ProductVariant).where(
        ProductVariant.product_id == pid, ProductVariant.color == "Rosa"))).scalars().all()
    assert len(rosas) == 1


async def test_variacao_nova_sem_cor_e_sem_tamanho_e_recusada(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    r = await test_client.post("/api/v1/stock-entries/", headers=h, json={
        "entry_code": f"VV-{next(_n):04d}", "entry_date": date.today().isoformat(), "entry_type": "local",
        "supplier_name": "Fornecedor Teste",
        "items": [{"product_id": 1, "quantity_received": 1, "unit_cost": "10.00", "new_variant": {}}]})
    assert r.status_code == 422


async def test_trilha_de_navegacao_do_app_fica_gravada_em_nivel_info(test_client, async_session, test_user):
    """O app manda a trilha das últimas telas/gestos quando uma trava de navegação age (depuração do voltar do iPhone)."""
    from app.models.error_log import ErrorLog
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    trilha = [{"t": 10, "e": "rota", "d": {"p": "/products/wizard"}}, {"t": 900, "e": "popstate"},
              {"t": 905, "e": "trava: entrada (passo 3) reaberta depois do cadastro concluído; indo para o início"}]
    r = await test_client.post("/api/v1/client-logs", headers=h, json={
        "message": "Navegação: trava de teste", "level": "info", "route": "/entries/add",
        "context": {"trilha": trilha, "plataforma": "web"}})
    assert r.status_code == 202, r.text
    lista = (await test_client.get("/api/v1/error-logs?source=app&limit=5", headers=h)).json()
    achado = next(x for x in lista if x["mensagem"] == "Navegação: trava de teste")
    assert achado["nivel"] == "info" and achado["rota"] == "/entries/add"
    assert "popstate" in (achado["detalhe"] or "") and "trava: entrada" in (achado["detalhe"] or "")
    await async_session.execute(ErrorLog.__table__.delete().where(ErrorLog.source == "app"))
    await async_session.commit()


async def test_produto_sem_sku_recebe_um_e_a_lista_de_produtos_continua_abrindo(test_client, async_session, test_user):
    """Cliente da API que não manda SKU: a variação ganha um e a lista de produtos da loja não dá erro 500."""
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    corpo = {"product_name": "Legging Sem Sku", "product_category_id": cat, "base_price": 99.9,
             "variants": [{"size": "M", "color": "Preto", "price": 99.9, "cost_price": 40, "quantity": 2},
                          {"size": "G", "color": "Preto", "price": 99.9, "cost_price": 40, "quantity": 1}],
             "supplier_name": "Forn Sem Sku", "entry_code": "SEMSKU-001", "entry_type": "local"}
    r = await test_client.post("/api/v1/stock-entries/with-new-product-variants", headers=h, json=corpo)
    assert r.status_code == 201, r.text
    entry_id = r.json()["id"]
    outro = {"product_name": "Top Sem Sku", "product_category_id": cat, "base_price": 59.9,
             "variants": [{"price": 59.9, "cost_price": 20, "quantity": 3}]}
    r = await test_client.post(f"/api/v1/stock-entries/{entry_id}/with-new-product", headers=h, json=outro)
    assert r.status_code == 201, r.text
    lista = await test_client.get("/api/v1/products?limit=1000", headers=h)
    assert lista.status_code == 200, lista.text
    meus = [p for p in lista.json() if p["name"] in ("Legging Sem Sku", "Top Sem Sku")]
    assert len(meus) == 2 and all(p["sku"] for p in meus), [(p["name"], p["sku"], len(p.get("variants") or [])) for p in meus]


async def test_um_produto_com_defeito_nao_derruba_a_lista_de_produtos(test_client, async_session, test_user, monkeypatch):
    """Fallback: se um produto não monta a resposta, a lista segue com os outros e o defeito vai para o registro."""
    from app.api.v1.endpoints import products as ep
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    for nome in ("Defeituoso Alfa", "Saudavel Beta"):
        r = await test_client.post("/api/v1/stock-entries/with-new-product-variants", headers=h, json={
            "product_name": nome, "product_category_id": cat, "base_price": 50, "supplier_name": "Forn X",
            "variants": [{"sku": f"FB-{nome[:3].upper()}", "price": 50, "cost_price": 20, "quantity": 1}],
            "entry_code": f"FALLB-{nome[:3].upper()}", "entry_type": "local", "entry_date": "2026-10-01"})
        assert r.status_code == 201, r.text
    original = ep.build_product_responses

    async def quebra_um(products, *a, **kw):
        resps = await original(products, *a, **kw)
        for r in resps:
            if r["name"] == "Defeituoso Alfa":
                r["created_at"] = "isto nao e uma data"
        return resps

    monkeypatch.setattr(ep, "build_product_responses", quebra_um)
    lista = await test_client.get("/api/v1/products?limit=1000", headers=h)
    assert lista.status_code == 200, lista.text
    nomes = [p["name"] for p in lista.json()]
    assert "Saudavel Beta" in nomes and "Defeituoso Alfa" not in nomes


async def test_categoria_repetida_da_409_e_valor_enorme_da_422_com_frase_clara(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    nome = {"name": "Categoria Dupla Fallback"}
    assert (await test_client.post("/api/v1/categories/", headers=h, json=nome)).status_code == 201
    r = await test_client.post("/api/v1/categories/", headers=h, json=nome)
    assert r.status_code in (400, 409), r.text
    assert "cadastro igual" in r.text or "já existe" in r.text.lower()


async def test_valor_enorme_no_banco_vira_422_com_frase_clara(monkeypatch):
    import app.main as m
    from sqlalchemy.exc import DataError

    async def _nada(*a, **k):
        return None
    monkeypatch.setattr(m, "log_request_error", _nada)
    r = await m.sqlalchemy_exception_handler(None, DataError("INSERT", {}, Exception("numeric field overflow")))
    assert r.status_code == 422 and b"grande demais" in r.body
    r = await m.sqlalchemy_exception_handler(None, DataError("INSERT", {}, Exception("outro problema qualquer")))
    assert r.status_code == 500


async def test_busca_de_produtos_respeita_limite_e_pagina(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    for i in range(5):
        r = await test_client.post("/api/v1/stock-entries/with-new-product-variants", headers=h, json={
            "product_name": f"Pagina Teste {i}", "product_category_id": cat, "base_price": 30, "supplier_name": "F",
            "variants": [{"sku": f"PGT-{i}", "price": 30, "cost_price": 10, "quantity": 1}],
            "entry_code": f"PGT-ENT-{i}", "entry_type": "local", "entry_date": "2026-10-01"})
        assert r.status_code == 201, r.text
    a = (await test_client.get("/api/v1/products?search=Pagina Teste&limit=2&skip=0", headers=h)).json()
    b = (await test_client.get("/api/v1/products?search=Pagina Teste&limit=2&skip=2", headers=h)).json()
    c = (await test_client.get("/api/v1/products?search=Pagina Teste&limit=2&skip=4", headers=h)).json()
    assert len(a) == 2 and len(b) == 2 and len(c) == 1
    assert len({p["id"] for p in a + b + c}) == 5


async def test_historico_de_preco_pago_de_um_produto_bate_com_o_da_loja_inteira(test_client, async_session, test_user):
    """A rota de fornecedores do produto só calcula o produto; o resultado tem de ser igual ao do cálculo da loja toda."""
    from app.services.supplier_insights_service import SupplierInsightsService
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    ids = []
    for i, desc in enumerate((0, 30)):
        r = await test_client.post("/api/v1/stock-entries/with-new-product-variants", headers=h, json={
            "product_name": f"Hist Preco {i}", "product_category_id": cat, "base_price": 80, "supplier_name": "Forn Hist",
            "variants": [{"sku": f"HP-{i}", "price": 80, "cost_price": 40, "quantity": 5}],
            "entry_code": f"HIST-PRECO-{i}", "entry_type": "local", "entry_date": "2026-10-01", "discount_amount": desc})
        assert r.status_code == 201, r.text

    ids = [p["id"] for p in (await test_client.get("/api/v1/products?search=Hist Preco&limit=10", headers=h)).json()]
    assert len(ids) == 2, ids
    svc = SupplierInsightsService(async_session)
    toda = await svc.paid_cost_history(t_id)
    for pid in [x for x in ids if x]:
        so_um = await svc.paid_cost_history(t_id, pid)
        esperado = {k: v for k, v in toda.items() if k[1] == pid}
        assert so_um == esperado and so_um, (pid, so_um, esperado)
    assert list(await svc.paid_cost_history(t_id, ids[1]))
