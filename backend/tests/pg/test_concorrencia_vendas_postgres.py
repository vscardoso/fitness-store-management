"""
Concorrência de vendas, devoluções, trocas e cancelamentos no Postgres de verdade (pedidos HTTP em paralelo, uma sessão por pedido,
como em produção com 2 workers). Não roda no SQLite.

Rodar:
  TEST_PG_URL=postgresql+asyncpg://postgres@127.0.0.1:55432/postgres pytest tests/pg/test_concorrencia_vendas_postgres.py -p no:cacheprovider --no-cov
Cria e apaga o banco `provador_conc_test` (use SÓ um Postgres local descartável).
Regras provadas: estoque nunca negativo, ninguém vende a mesma peça duas vezes, devolução nunca passa do vendido,
e o oráculo de conservação por camada FIFO fecha depois de tudo.
"""
import asyncio
import os
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from urllib.parse import urlparse

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

PG_URL = os.getenv("TEST_PG_URL")
pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(not PG_URL, reason="defina TEST_PG_URL para testar concorrência no Postgres"),
]
DB = "provador_conc_test"
D = Decimal


def _url(db: str) -> str:
    u = urlparse(PG_URL.replace("+asyncpg", ""))
    assert u.hostname in ("localhost", "127.0.0.1"), "teste só roda em Postgres local"
    auth = f"{u.username}@" if u.username else ""
    return f"postgresql+asyncpg://{auth}{u.hostname}:{u.port or 5432}/{db}"


@pytest.fixture(scope="module")
async def pg():
    """Banco novo com o schema real, a API ligada nele (uma sessão por pedido). Devolve SimpleNamespace(mk, client, h, tenant, cat)."""
    from httpx import ASGITransport, AsyncClient

    import app.core.database as db_module
    import app.middleware.tenant as tenant_module
    import app.models  # noqa: F401
    from app.api.deps import get_current_tenant_id
    from app.core.database import get_db
    from app.core.security import create_access_token
    from app.main import app
    from app.models.base import BaseModel
    from app.models.category import Category
    from app.models.store import Store
    from app.models.subscription import Subscription
    from app.models.user import User
    from datetime import datetime, timezone

    root = create_async_engine(_url("postgres"), isolation_level="AUTOCOMMIT")
    async with root.connect() as c:
        await c.execute(text(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"))
        await c.execute(text(f"CREATE DATABASE {DB}"))
    engine = create_async_engine(_url(DB), pool_size=30, max_overflow=30)
    async with engine.begin() as conn:
        await conn.run_sync(BaseModel.metadata.create_all)
    mk = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with mk() as s:
        store = Store(name="Loja Teste", slug="test", domain="test", is_default=True, is_active=True)
        s.add(store)
        await s.flush()
        s.add(Subscription(tenant_id=store.id, plan="PRO", status="active", is_trial=False,
                           current_period_start=datetime.utcnow(),
                           current_period_end=datetime.utcnow() + timedelta(days=365),
                           max_products=999999, max_users=5, feature_advanced_reports=True, feature_api_access=True, is_active=True))
        user = User(email="admin@fitness.com", full_name="Admin", hashed_password="x", role="ADMIN", tenant_id=store.id, is_active=True)
        s.add(user)
        cat = Category(name="Cat", slug="cat", tenant_id=store.id)
        s.add(cat)
        await s.commit()
        tenant, uid, cat_id = store.id, user.id, cat.id

    old_db, old_tn = db_module.async_session_maker, tenant_module.async_session_maker
    db_module.async_session_maker = mk
    tenant_module.async_session_maker = mk

    async def override_get_db():
        async with mk() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_tenant_id] = lambda: tenant
    token = create_access_token(data={"sub": str(uid)})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", timeout=60) as client:
        yield SimpleNamespace(mk=mk, client=client, h={"Authorization": f"Bearer {token}"}, tenant=tenant, cat=cat_id)
    app.dependency_overrides.clear()
    db_module.async_session_maker, tenant_module.async_session_maker = old_db, old_tn
    await engine.dispose()
    async with root.connect() as c:
        await c.execute(text(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"))
    await root.dispose()


@pytest.fixture(autouse=True)
def _zera_limites():
    from app.core import rate_limit
    rate_limit.reset_all()
    yield


_n = iter(range(1, 10**6))


async def _prepara(pg, camadas, preco="100.00", variacoes=1):
    """Produto novo com `variacoes` variações; `camadas` = [(quantidade, custo)] por variação. Devolve (produto, [variações])."""
    from tests.test_lot_costs import _lote, _produto
    from tests.test_estresse_vendas_fifo import _variacao

    async with pg.mk() as s:
        p, v0 = await _produto(s, pg.tenant, pg.cat, "Conc", preco)
        vs = [v0] + [await _variacao(s, p, pg.tenant, preco, cor=f"Cor{k}", tam="M") for k in range(1, variacoes)]
        for k, (q, c) in enumerate(camadas):
            for v in vs:
                await _lote(s, pg.tenant, [(v, p, q, c)], entry_date=date.today() - timedelta(days=30 - k))
        await s.commit()
        return SimpleNamespace(id=p.id), [SimpleNamespace(id=v.id) for v in vs]


async def _estoque(pg, vid):
    from tests.test_estresse_vendas_fifo import _estoque
    async with pg.mk() as s:
        return await _estoque(s, vid)


async def _confere(pg, vids):
    from tests.test_estresse_cenarios import confere_conservacao
    async with pg.mk() as s:
        await confere_conservacao(s, vids)


async def _post_venda(pg, p, v, qtd, preco="100.00"):
    return await pg.client.post("/api/v1/sales/", headers=pg.h, json={
        "payment_method": "cash", "items": [{"product_id": p.id, "variant_id": v.id, "quantity": qtd, "unit_price": preco}],
        "payments": [{"amount": str(D(preco) * qtd), "payment_method": "cash"}]})


async def _venda_ok(pg, p, v, qtd, preco="100.00"):
    r = await _post_venda(pg, p, v, qtd, preco)
    assert r.status_code in (200, 201), r.text
    c = r.json()
    return c["id"], c["items"][0]["id"]


def _devolve(pg, sale_id, itens, **extra):
    return pg.client.post(f"/api/v1/returns/{sale_id}", headers=pg.h, json={"reason": "conc", "items": itens, **extra})


def _status(rs):
    return sorted(r.status_code for r in rs)


# ─────────────────────────────────────────────────────────────── 1. última peça
async def test_dois_pedidos_para_a_ultima_peca(pg):
    for rodada in range(8):
        p, (v,) = await _prepara(pg, [(1, 40)])
        rs = await asyncio.gather(*[_post_venda(pg, p, v, 1) for _ in range(2)])
        ok = [r for r in rs if r.status_code in (200, 201)]
        assert len(ok) == 1, f"rodada {rodada}: {_status(rs)} {[r.text[:120] for r in rs]}"
        assert all(r.status_code < 500 for r in rs), _status(rs)
        assert await _estoque(pg, v.id) == 0
        await _confere(pg, [v.id])


# ─────────────────────────────────────────────────────────────── 2. N vendas somando mais que o estoque
async def test_muitas_vendas_simultaneas_somando_mais_que_o_estoque(pg):
    p, (v,) = await _prepara(pg, [(4, 40), (6, 45)])            # 10 peças
    rs = await asyncio.gather(*[_post_venda(pg, p, v, 2) for _ in range(14)])   # 28 pedidas
    ok = [r for r in rs if r.status_code in (200, 201)]
    assert len(ok) == 5, _status(rs)
    assert all(r.status_code < 500 for r in rs), _status(rs)
    assert await _estoque(pg, v.id) == 0
    await _confere(pg, [v.id])


async def test_venda_simultanea_nao_deixa_estoque_negativo_com_pedidos_de_tamanhos_diferentes(pg):
    p, (v,) = await _prepara(pg, [(7, 40), (8, 50)])            # 15
    qtds = [1, 3, 2, 5, 4, 1, 2, 6, 3, 2, 1, 4]
    rs = await asyncio.gather(*[_post_venda(pg, p, v, q) for q in qtds])
    vendido = sum(q for q, r in zip(qtds, rs) if r.status_code in (200, 201))
    assert vendido <= 15 and all(r.status_code < 500 for r in rs), _status(rs)
    assert await _estoque(pg, v.id) == 15 - vendido
    await _confere(pg, [v.id])


# ─────────────────────────────────────────────────────────────── 3. devoluções simultâneas do mesmo item
async def test_duas_devolucoes_simultaneas_do_mesmo_item(pg):
    for rodada in range(6):
        p, (v,) = await _prepara(pg, [(10, 40)])
        sale, item = await _venda_ok(pg, p, v, 10)
        rs = await asyncio.gather(*[_devolve(pg, sale, [{"sale_item_id": item, "quantity": 8}]) for _ in range(2)])
        assert len([r for r in rs if r.status_code == 201]) == 1, f"rodada {rodada}: {_status(rs)} {[r.text[:120] for r in rs]}"
        assert all(r.status_code < 500 for r in rs), _status(rs)
        assert await _estoque(pg, v.id) == 8
        await _confere(pg, [v.id])


async def test_varias_devolucoes_simultaneas_somam_no_maximo_o_vendido(pg):
    p, (v,) = await _prepara(pg, [(10, 40)])
    sale, item = await _venda_ok(pg, p, v, 10)
    qtds = [3, 3, 3, 2, 2, 1, 4]
    rs = await asyncio.gather(*[_devolve(pg, sale, [{"sale_item_id": item, "quantity": q}]) for q in qtds])
    devolvido = sum(q for q, r in zip(qtds, rs) if r.status_code == 201)
    assert devolvido <= 10 and all(r.status_code < 500 for r in rs), _status(rs)
    assert await _estoque(pg, v.id) == devolvido
    await _confere(pg, [v.id])


# ─────────────────────────────────────────────────────────────── 4. cancelar enquanto devolve
async def test_cancelar_enquanto_devolve(pg):
    for rodada in range(6):
        p, (v,) = await _prepara(pg, [(10, 40)])
        sale, item = await _venda_ok(pg, p, v, 10)
        cancela = pg.client.post(f"/api/v1/sales/{sale}/cancel", headers=pg.h, json={"reason": "conc"})
        rs = await asyncio.gather(cancela, _devolve(pg, sale, [{"sale_item_id": item, "quantity": 6}]), _devolve(pg, sale, [{"sale_item_id": item, "quantity": 6}]))
        assert all(r.status_code < 500 for r in rs), f"rodada {rodada}: {_status(rs)} {[r.text[:150] for r in rs]}"
        est = await _estoque(pg, v.id)
        if rs[0].status_code in (200, 201):      # cancelou: a venda inteira volta, nenhuma peça fica fora
            esperado = 10
        else:                                    # recusou o cancelamento: só voltou o que as devoluções aceitas devolveram
            esperado = 6 * len([r for r in rs[1:] if r.status_code == 201])
        assert est == esperado, f"rodada {rodada}: peças sumiram ou apareceram, estoque {est}, esperado {esperado}, {_status(rs)}"
        await _confere(pg, [v.id])


# ─────────────────────────────────────────────────────────────── 5. reposição durante vendas
async def test_reposicao_durante_vendas(pg):
    from tests.test_lot_costs import _lote

    p, (v,) = await _prepara(pg, [(5, 40)])

    async def repor():
        async with pg.mk() as s:
            await _lote(s, pg.tenant, [(v, SimpleNamespace(id=p.id), 6, 50)], entry_date=date.today())
            await s.commit()

    rs = await asyncio.gather(*[_post_venda(pg, p, v, 2) for _ in range(8)], repor(), repor())
    vendas = rs[:8]
    ok = len([r for r in vendas if r.status_code in (200, 201)])
    assert all(r.status_code < 500 for r in vendas), _status(vendas)
    assert await _estoque(pg, v.id) == 5 + 12 - 2 * ok
    await _confere(pg, [v.id])


# ─────────────────────────────────────────────────────────────── 6. troca simultânea para a mesma peça nova
async def test_trocas_simultaneas_para_a_mesma_peca_nova_com_estoque_curto(pg):
    for rodada in range(4):
        p, (va, vb) = await _prepara(pg, [(10, 40)], variacoes=2)
        # vb só tem 3 peças
        async with pg.mk() as s:
            from app.models.entry_item import EntryItem
            itens = (await s.execute(select(EntryItem).where(EntryItem.variant_id == vb.id))).scalars().all()
            itens[0].quantity_remaining = 3
            itens[0].quantity_received = 3
            await s.commit()
        vendas = [await _venda_ok(pg, p, va, 2) for _ in range(3)]
        rs = await asyncio.gather(*[
            _devolve(pg, s_, [{"sale_item_id": i_, "quantity": 2, "replacement_variant_id": vb.id}]) for s_, i_ in vendas])
        assert all(r.status_code < 500 for r in rs), f"rodada {rodada}: {_status(rs)} {[r.text[:150] for r in rs]}"
        assert len([r for r in rs if r.status_code == 201]) == 1, f"rodada {rodada}: {_status(rs)} {[r.text[:120] for r in rs]}"
        assert await _estoque(pg, vb.id) == 1
        await _confere(pg, [va.id, vb.id])


# ─────────────────────────────────────────────────────────────── 7. misturado
async def test_mistura_pesada_vendas_devolucoes_e_cancelamentos(pg):
    p, (v,) = await _prepara(pg, [(20, 40), (20, 45)])
    vendas = [await _venda_ok(pg, p, v, 4) for _ in range(5)]           # 20 vendidas, 20 em estoque
    tarefas = [_post_venda(pg, p, v, 3) for _ in range(9)]               # 27 pedidas contra 20 em estoque (+ devoluções)
    tarefas += [_devolve(pg, s_, [{"sale_item_id": i_, "quantity": 2}]) for s_, i_ in vendas[:3]]
    tarefas += [pg.client.post(f"/api/v1/sales/{vendas[3][0]}/cancel", headers=pg.h, json={"reason": "conc"})]
    rs = await asyncio.gather(*tarefas)
    assert all(r.status_code < 500 for r in rs), _status(rs)
    assert await _estoque(pg, v.id) >= 0
    await _confere(pg, [v.id])


# ─────────────────────────────────────────────────────────────── 8. sem deadlock: itens em ordem oposta
async def test_vendas_de_dois_itens_em_ordem_oposta_nao_travam_uma_a_outra(pg):
    p, (va, vb) = await _prepara(pg, [(10, 40), (10, 45)], variacoes=2)

    def venda(ordem):
        itens = [{"product_id": p.id, "variant_id": v.id, "quantity": 1, "unit_price": "100.00"} for v in ordem]
        return pg.client.post("/api/v1/sales/", headers=pg.h, json={
            "payment_method": "cash", "items": itens, "payments": [{"amount": "200.00", "payment_method": "cash"}]})

    rs = await asyncio.wait_for(asyncio.gather(*[venda((va, vb) if k % 2 else (vb, va)) for k in range(16)]), timeout=60)
    assert all(r.status_code in (200, 201) for r in rs), (_status(rs), [r.text[:200] for r in rs if r.status_code >= 400][:2])
    assert await _estoque(pg, va.id) == 20 - 16 and await _estoque(pg, vb.id) == 20 - 16
    await _confere(pg, [va.id, vb.id])


async def test_carga_mista_longa_sem_5xx_e_com_oraculo_fechando(pg):
    import random
    rng = random.Random(5)
    p, vs = await _prepara(pg, [(15, 40), (15, 45)], variacoes=3)
    vendas = [(await _venda_ok(pg, p, rng.choice(vs), 3)) for _ in range(6)]
    for rodada in range(6):
        tarefas = [_post_venda(pg, p, rng.choice(vs), rng.randint(1, 4)) for _ in range(10)]
        tarefas += [_devolve(pg, s_, [{"sale_item_id": i_, "quantity": rng.randint(1, 3)}]) for s_, i_ in rng.sample(vendas, 3)]
        tarefas += [_devolve(pg, s_, [{"sale_item_id": i_, "quantity": 1, "replacement_variant_id": rng.choice(vs).id}]) for s_, i_ in rng.sample(vendas, 2)]
        rs = await asyncio.wait_for(asyncio.gather(*tarefas), timeout=90)
        assert all(r.status_code < 500 for r in rs), f"rodada {rodada}: {_status(rs)} {[r.text[:200] for r in rs if r.status_code >= 500]}"
        for v in vs:
            assert await _estoque(pg, v.id) >= 0
        await _confere(pg, [v.id for v in vs])


# ─────────────────────────────────────────────────────────────── 9. condicional
COND = "/api/v1/conditional-shipments"


async def _cliente_pg(pg):
    r = await pg.client.post("/api/v1/customers/", headers=pg.h, json={
        "full_name": f"Cliente {next(_n)}", "email": f"cli{next(_n)}@example.com", "phone": "34999990000"})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _novo_envio(pg, cid, p, v, qtd):
    return pg.client.post(COND + "/", headers=pg.h, json={
        "customer_id": cid, "shipping_address": "Rua das Flores, 100, Uberlandia",
        "items": [{"product_id": p.id, "variant_id": v.id, "quantity_sent": qtd, "unit_price": "100.00"}]})


async def _consumo_cond(pg, vids):
    from tests.test_estresse_condicional import consumo_condicional
    async with pg.mk() as s:
        return await consumo_condicional(s, vids)


async def _confere_cond(pg, vids):
    from tests.test_estresse_cenarios import confere_conservacao
    extra = await _consumo_cond(pg, vids)
    async with pg.mk() as s:
        await confere_conservacao(s, vids, extra_consumo=extra)


async def test_dois_envios_condicionais_para_a_ultima_peca(pg):
    cid = await _cliente_pg(pg)
    for rodada in range(6):
        p, (v,) = await _prepara(pg, [(1, 40)])
        rs = await asyncio.gather(*[_novo_envio(pg, cid, p, v, 1) for _ in range(2)])
        assert len([r for r in rs if r.status_code == 201]) == 1, f"rodada {rodada}: {_status(rs)} {[r.text[:120] for r in rs]}"
        assert all(r.status_code < 500 for r in rs), _status(rs)
        assert await _estoque(pg, v.id) == 0
        await _confere_cond(pg, [v.id])


async def test_envio_condicional_e_venda_de_balcao_disputam_a_ultima_peca(pg):
    cid = await _cliente_pg(pg)
    for rodada in range(6):
        p, (v,) = await _prepara(pg, [(1, 40)])
        rs = await asyncio.gather(_novo_envio(pg, cid, p, v, 1), _post_venda(pg, p, v, 1))
        assert len([r for r in rs if r.status_code in (200, 201)]) == 1, f"rodada {rodada}: {_status(rs)}"
        assert all(r.status_code < 500 for r in rs), _status(rs)
        assert await _estoque(pg, v.id) == 0
        await _confere_cond(pg, [v.id])


async def test_processar_o_mesmo_envio_duas_vezes_ao_mesmo_tempo_devolve_so_uma_vez(pg):
    cid = await _cliente_pg(pg)
    for rodada in range(6):
        p, (v,) = await _prepara(pg, [(10, 40)])
        env = (await _novo_envio(pg, cid, p, v, 6)).json()
        r = await pg.client.put(f"{COND}/{env['id']}/mark-as-sent", headers=pg.h, json={})
        assert r.status_code == 200, r.text
        corpo = {"items": [{"id": env["items"][0]["id"], "quantity_kept": 2, "quantity_returned": 4, "quantity_damaged": 0, "quantity_lost": 0, "status": "SENT"}],
                 "payment_method": "pix"}
        rs = await asyncio.gather(*[pg.client.put(f"{COND}/{env['id']}/process-return", headers=pg.h, json=corpo) for _ in range(3)])
        assert len([r for r in rs if r.status_code == 200]) == 1, f"rodada {rodada}: {_status(rs)} {[r.text[:120] for r in rs]}"
        assert all(r.status_code < 500 for r in rs), _status(rs)
        assert await _estoque(pg, v.id) == 10 - 2
        await _confere_cond(pg, [v.id])


async def test_cancelar_e_processar_o_mesmo_envio_ao_mesmo_tempo(pg):
    cid = await _cliente_pg(pg)
    for rodada in range(6):
        p, (v,) = await _prepara(pg, [(10, 40)])
        env = (await _novo_envio(pg, cid, p, v, 5)).json()
        assert (await pg.client.put(f"{COND}/{env['id']}/mark-as-sent", headers=pg.h, json={})).status_code == 200
        corpo = {"items": [{"id": env["items"][0]["id"], "quantity_kept": 0, "quantity_returned": 5, "quantity_damaged": 0, "quantity_lost": 0, "status": "SENT"}]}
        rs = await asyncio.gather(
            pg.client.delete(f"{COND}/{env['id']}", headers=pg.h, params={"reason": "Cliente desistiu"}),
            pg.client.put(f"{COND}/{env['id']}/process-return", headers=pg.h, json=corpo))
        assert all(r.status_code < 500 for r in rs), f"rodada {rodada}: {_status(rs)} {[r.text[:150] for r in rs]}"
        assert len([r for r in rs if r.status_code == 200]) == 1, f"rodada {rodada}: {_status(rs)}"
        assert await _estoque(pg, v.id) == 10          # voltou uma vez só, nunca duas
        await _confere_cond(pg, [v.id])
