"""Corridas que só o Postgres decide (pedidos HTTP em paralelo, uma sessão por pedido, como em produção com 2 workers):
1) a mesma Idempotency-Key em vários pedidos simultâneos cria UMA venda e baixa o estoque UMA vez;
2) a mesma chave com conteúdo diferente nunca devolve a venda de outro conteúdo (409);
3) várias criações de usuário ao mesmo tempo na última vaga do plano criam só o que cabe.

Rodar:  TEST_PG_URL=postgresql+asyncpg://postgres@127.0.0.1:55432/postgres pytest tests/pg/test_corrida_idempotencia_postgres.py -p no:cacheprovider --no-cov
Cria e apaga o banco `provador_conc_test` (use SÓ um Postgres local descartável).
"""
import asyncio
from decimal import Decimal

import pytest
from sqlalchemy import func, select, text

from tests.pg.test_concorrencia_vendas_postgres import (  # noqa: F401  (pg e _zera_limites são fixtures)
    D, PG_URL, _estoque, _prepara, _zera_limites, pg,
)

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(not PG_URL, reason="defina TEST_PG_URL para testar concorrência no Postgres"),
]


def _corpo(p, v, qtd, preco="100.00"):
    return {"payment_method": "cash", "items": [{"product_id": p.id, "variant_id": v.id, "quantity": qtd, "unit_price": preco}],
            "payments": [{"amount": str(D(preco) * qtd), "payment_method": "cash"}]}


async def test_mesma_chave_em_pedidos_simultaneos_cria_uma_venda(pg):
    for rodada in range(5):
        p, (v,) = await _prepara(pg, [(5, 40)])
        chave = f"corrida-{rodada}-{id(p)}"
        h = {**pg.h, "Idempotency-Key": chave}
        rs = await asyncio.gather(*[pg.client.post("/api/v1/sales/", headers=h, json=_corpo(p, v, 1)) for _ in range(8)])
        codigos = sorted(r.status_code for r in rs)
        assert all(c in (200, 201) for c in codigos), [r.text[:150] for r in rs if r.status_code >= 400]
        ids = {r.json()["id"] for r in rs}
        assert len(ids) == 1, f"mesma chave gerou {len(ids)} vendas: {ids}"
        async with pg.mk() as s:
            n = (await s.execute(text("select count(*) from sales where tenant_id=:t and idempotency_key=:k"), {"t": pg.tenant, "k": chave})).scalar()
        assert n == 1
        assert await _estoque(pg, v.id) == 4, "o estoque foi baixado mais de uma vez"


async def test_mesma_chave_com_conteudo_diferente_da_409(pg):
    p, (v,) = await _prepara(pg, [(10, 40)])
    h = {**pg.h, "Idempotency-Key": "conteudo-diferente-1"}
    r1 = await pg.client.post("/api/v1/sales/", headers=h, json=_corpo(p, v, 1))
    assert r1.status_code in (200, 201), r1.text
    # em paralelo: um com o mesmo conteúdo (volta a mesma venda) e dois com conteúdo diferente (409)
    rs = await asyncio.gather(
        pg.client.post("/api/v1/sales/", headers=h, json=_corpo(p, v, 1)),
        pg.client.post("/api/v1/sales/", headers=h, json=_corpo(p, v, 2)),
        pg.client.post("/api/v1/sales/", headers=h, json=_corpo(p, v, 3)),
    )
    assert rs[0].status_code in (200, 201) and rs[0].json()["id"] == r1.json()["id"]
    assert rs[1].status_code == 409 and rs[2].status_code == 409, [r.text[:150] for r in rs]
    assert await _estoque(pg, v.id) == 9


async def test_criacao_simultanea_de_usuarios_na_ultima_vaga(pg):
    from app.models.subscription import Subscription
    async with pg.mk() as s:
        sub = (await s.execute(select(Subscription).where(Subscription.tenant_id == pg.tenant))).scalars().first()
        sub.plan = "pro"
        await s.commit()
        existentes = (await s.execute(text("select count(*) from users where tenant_id=:t and is_active"), {"t": pg.tenant})).scalar()
    vagas = 5 - existentes            # plano pro = 5 usuários ativos
    assert vagas >= 1
    corpos = [{"email": f"corrida{i}.{existentes}@example.com", "full_name": f"Membro Corrida {i}", "password": "Senha1234", "role": "seller"}
              for i in range(vagas + 4)]
    rs = await asyncio.gather(*[pg.client.post("/api/v1/team", headers=pg.h, json=c) for c in corpos])
    criados = [r for r in rs if r.status_code == 201]
    assert len(criados) == vagas, f"vagas={vagas}, criados={len(criados)}: {sorted(r.status_code for r in rs)}"
    assert all(r.status_code in (201, 403) for r in rs), [r.text[:150] for r in rs if r.status_code not in (201, 403)]
    async with pg.mk() as s:
        ativos = (await s.execute(text("select count(*) from users where tenant_id=:t and is_active"), {"t": pg.tenant})).scalar()
    assert ativos == 5
