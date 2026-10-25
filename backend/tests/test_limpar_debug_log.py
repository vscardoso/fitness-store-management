"""Rotina que limpa o DEBUG_LOG.txt quando os erros dele estão sanados (scripts/limpar_debug_log.py)."""
import importlib.util
import json
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "limpar_debug_log.py"

ERRO_401 = (' [10:00:00] [mobile] [API] GET /products/12 - 401\n'
            '   Data: {"status": 401, "detail": "Não foi possível validar as credenciais", "code": "ERR_BAD_REQUEST"}\n')
ERRO_ABERTO = (' [10:01:00] [mobile] [API] POST /pdv/pix/7 - 502\n'
               '   Data: {"status": 502, "detail": "Erro ao gerar PIX no Mercado Pago: credencial recusada"}\n')
ERRO_NOVO = (' [10:02:00] [mobile] [API] GET /alguma/rota-nova - 500\n'
             '   Data: {"status": 500, "detail": "algo que ninguem analisou ainda"}\n')
INFO = ' [10:03:00] [mobile] [AI Scan] Resultado da análise\n   Data: {"name": "Top"}\n'

REGISTRO = [
    {"assinatura": "Não foi possível validar as credenciais", "resolvido_manual": True, "nota": "sessão"},
    {"assinatura": "POST /pdv/pix/", "nota": "ABERTO: credenciais recusadas"},
]


@pytest.fixture
def rotina(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location("limpar_debug_log_teste", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    monkeypatch.setattr(mod, "ARQUIVO", tmp_path / "DEBUG_LOG.txt")
    monkeypatch.setattr(mod, "REGISTRO", tmp_path / "resolvidos.json")
    monkeypatch.setattr(mod, "ARQUIVADOS", tmp_path / "arquivado")
    monkeypatch.setattr(mod, "PROVAS_OK", tmp_path / "provas_ok.json")
    mod.REGISTRO.write_text(json.dumps(REGISTRO), encoding="utf-8")

    def rodar(*args):
        monkeypatch.setattr("sys.argv", ["limpar_debug_log.py", *args])
        return mod.main()

    return mod, rodar


def test_tudo_sanado_esvazia_o_arquivo_e_guarda_copia(rotina):
    mod, rodar = rotina
    mod.ARQUIVO.write_text(ERRO_401 + INFO, encoding="utf-8")
    assert rodar("limpar") == 0
    assert mod.ARQUIVO.read_text(encoding="utf-8") == ""
    copias = list(mod.ARQUIVADOS.glob("DEBUG_LOG-*.txt"))
    assert len(copias) == 1 and "validar as credenciais" in copias[0].read_text(encoding="utf-8")


def test_erro_aberto_continua_no_arquivo_e_o_sanado_sai(rotina):
    mod, rodar = rotina
    mod.ARQUIVO.write_text(ERRO_401 + ERRO_ABERTO + INFO, encoding="utf-8")
    assert rodar("limpar") == 1                      # ainda há erro em aberto
    restante = mod.ARQUIVO.read_text(encoding="utf-8")
    assert "pdv/pix/7" in restante                   # o aberto fica
    assert "validar as credenciais" not in restante and "AI Scan" not in restante
    assert len(list(mod.ARQUIVADOS.glob("*.txt"))) == 1


def test_erro_que_ninguem_analisou_nunca_e_apagado(rotina):
    mod, rodar = rotina
    mod.ARQUIVO.write_text(ERRO_NOVO, encoding="utf-8")
    assert rodar("limpar") == 1
    assert "rota-nova" in mod.ARQUIVO.read_text(encoding="utf-8")
    assert rodar("relatorio") == 1


def test_prova_que_falha_reabre_o_erro(rotina):
    mod, rodar = rotina
    mod.REGISTRO.write_text(json.dumps([
        {"assinatura": "GET /products/", "prova_teste": "tests/nao_existe.py::test_inexistente", "nota": "x"},
    ]), encoding="utf-8")
    mod.ARQUIVO.write_text(' [10:00:00] [mobile] [API] GET /products/5 - 500\n   Data: {"status": 500, "detail": "boom"}\n',
                           encoding="utf-8")
    assert rodar("limpar") == 1
    assert "products/5" in mod.ARQUIVO.read_text(encoding="utf-8")   # a prova não passa: erro continua


def test_modo_auto_nao_roda_testes_e_so_confia_em_prova_recente(rotina):
    mod, rodar = rotina
    prova = "tests/qualquer.py::test_x"
    mod.REGISTRO.write_text(json.dumps([{"assinatura": "GET /products/", "prova_teste": prova, "nota": "x"}]), encoding="utf-8")
    texto = ' [10:00:00] [mobile] [API] GET /products/5 - 500\n   Data: {"status": 500, "detail": "boom"}\n'
    mod.ARQUIVO.write_text(texto, encoding="utf-8")
    assert rodar("limpar", "--auto") == 1                     # sem prova recente: não limpa (e não executa teste algum)
    assert mod.ARQUIVO.read_text(encoding="utf-8") == texto.rstrip("\n") + "\n" or "products/5" in mod.ARQUIVO.read_text(encoding="utf-8")
    from datetime import datetime
    mod.PROVAS_OK.write_text(json.dumps({prova: datetime.now().isoformat(timespec="seconds")}), encoding="utf-8")
    assert rodar("limpar", "--auto") == 0                     # prova de hoje vale
    assert mod.ARQUIVO.read_text(encoding="utf-8") == ""


def test_resolver_grava_no_registro_e_o_erro_passa_a_sanado(rotina):
    mod, rodar = rotina
    mod.ARQUIVO.write_text(ERRO_NOVO, encoding="utf-8")
    assert rodar("resolver", "alguma/rota-nova", "--nota", "corrigido no commit abc123") == 0
    itens = json.loads(mod.REGISTRO.read_text(encoding="utf-8"))
    assert any(i["assinatura"] == "alguma/rota-nova" and i["resolvido_manual"] for i in itens)
    assert rodar("limpar") == 0 and mod.ARQUIVO.read_text(encoding="utf-8") == ""


def test_arquivo_vazio_ou_inexistente_nao_quebra(rotina):
    mod, rodar = rotina
    assert rodar("limpar") == 0                      # arquivo nem existe
    mod.ARQUIVO.write_text("", encoding="utf-8")
    assert rodar("limpar", "--auto") == 0
