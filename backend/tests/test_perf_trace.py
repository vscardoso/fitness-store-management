"""Medição de tempo da API: resumo por rota, limite de memória, cabeçalho Server-Timing e leitura só por admin."""
import pytest

from app.core import perf_trace as pt
from tests.test_lot_costs import _loja_api, _limpa_loja_1  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _zera_medicao():
    pt._stats.clear()
    pt._slow.clear()
    yield
    pt._stats.clear()
    pt._slow.clear()


async def test_resumo_por_rota_com_media_maximo_e_p95():
    for ms in (30, 40, 60, 80, 3000):
        pt.record("GET /x", ms, 200, 2, 10)
    linha = pt.snapshot()["mais_pesadas"][0]
    assert linha["rota"] == "GET /x" and linha["chamadas"] == 5
    assert linha["media_ms"] == round((30 + 40 + 60 + 80 + 3000) / 5) and linha["max_ms"] == 3000
    assert linha["p95_ms_ate"] == 5000 and linha["consultas_media"] == 2 and linha["banco_media_ms"] == 10


async def test_so_as_lentas_vao_para_a_lista_e_ela_tem_tamanho_fixo():
    pt.record("GET /rapida", 100, 200, 1, 5)
    assert pt.snapshot()["lentas_recentes"] == []
    for i in range(250):
        pt.record("GET /lenta", pt.SLOW_MS + i, 200, 1, 5)
    assert len(pt._slow) == 100 and len(pt.snapshot()["lentas_recentes"]) == 30


async def test_numero_de_rotas_medidas_tem_teto():
    for i in range(pt._MAX_ROUTES + 50):
        pt.record(f"GET /r{i}", 10, 200, 0, 0)
    assert len(pt._stats) == pt._MAX_ROUTES


async def test_resposta_traz_server_timing_e_a_rota_aparece_no_resumo(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    r = await test_client.get("/api/v1/products?limit=5", headers=h)
    assert r.status_code == 200 and r.headers["server-timing"].startswith("app;dur=")
    perf = (await test_client.get("/api/v1/perf", headers=h)).json()
    rotas = [x["rota"] for x in perf["mais_pesadas"]]
    assert any(x.startswith("GET /api/v1/products") for x in rotas), rotas
    linha = next(x for x in perf["mais_pesadas"] if x["rota"].startswith("GET /api/v1/products"))
    assert linha["consultas_media"] >= 1, linha  # a contagem de consultas ao banco funciona


async def test_perf_nao_abre_sem_login(test_client):
    r = await test_client.get("/api/v1/perf")
    assert r.status_code in (401, 403)


async def test_vigia_acusa_rota_lenta_e_rota_com_muita_consulta_e_ignora_amostra_pequena(monkeypatch):
    for _ in range(25):
        pt.record("GET /lenta", 900, 200, 3, 100)
        pt.record("GET /muitas", 50, 200, 120, 40)
        pt.record("GET /boa", 40, 200, 4, 10)
    for _ in range(3):
        pt.record("GET /poucas", 5000, 200, 3, 100)  # amostra pequena demais para acusar
    achadas = {r["rota"] for r in pt.slow_routes()}
    assert achadas == {"GET /lenta", "GET /muitas"}
    avisos = []

    async def _grava(**kw):
        avisos.append(kw)
    monkeypatch.setattr("app.services.error_log_service.record_error", _grava)
    await pt.check_perf_alerts()
    assert len(avisos) == 2 and all(a["error_type"] == "rota_lenta" for a in avisos)
