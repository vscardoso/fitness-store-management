"""Guarda de publicação (deploy/guarda_publicacao.py): no modo estrito, gente USANDO o app conta como ocupado, não só gravação.

Caso real (10/11/2026): a guarda liberou porque a última gravação tinha passado de 120 s, mesmo com 1 pessoa conectada, e o app foi
atualizado na cara de quem estava usando.
"""
import importlib.util
import time
from pathlib import Path

import pytest

SPEC = importlib.util.spec_from_file_location("guarda", Path(__file__).resolve().parents[2] / "deploy" / "guarda_publicacao.py")
guarda = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(guarda)


def _linha(ip: str, metodo: str, caminho: str, segundos_atras: int, agente: str = "Mozilla/5.0 (iPhone)") -> str:
    quando = time.gmtime(time.time() - segundos_atras)
    stamp = time.strftime("%d/%b/%Y:%H:%M:%S +0000", quando)
    return f'{ip} - - [{stamp}] "{metodo} {caminho} HTTP/2.0" 200 123 "-" "{agente}"'


def _log(tmp_path, linhas):
    p = tmp_path / "access.log"
    p.write_text("\n".join(linhas) + "\n", encoding="utf-8")
    return str(p)


def test_sem_ninguem_esta_livre_nos_dois_modos(tmp_path):
    log = _log(tmp_path, [_linha("200.1.1.1", "GET", "/api/v1/products", 3600)])
    assert guarda.check(log, 120, False)[0] == guarda.FREE
    assert guarda.check(log, 120, True)[0] == guarda.FREE


def test_pessoa_usando_sem_gravar_so_bloqueia_no_modo_estrito(tmp_path):
    log = _log(tmp_path, [_linha("200.1.1.1", "GET", "/api/v1/products", 30), _linha("200.1.1.1", "POST", "/api/v1/sales/", 138)])
    # a última gravação foi há 138 s (fora da janela de 120): o modo antigo liberava com a pessoa lá usando
    assert guarda.check(log, 120, False)[0] == guarda.FREE
    codigo, msg = guarda.check(log, 120, True)
    assert codigo == guarda.BUSY and "usando o app" in msg and "1 pessoa" in msg


def test_gravando_bloqueia_nos_dois_modos(tmp_path):
    log = _log(tmp_path, [_linha("200.1.1.1", "PUT", "/api/v1/products/1", 20)])
    assert guarda.check(log, 120, False)[0] == guarda.BUSY
    assert guarda.check(log, 120, True)[0] == guarda.BUSY


def test_quem_parou_ha_mais_de_5_minutos_nao_conta_e_robos_nao_contam(tmp_path):
    log = _log(tmp_path, [
        _linha("200.1.1.1", "GET", "/api/v1/products", 400),                                   # parou há 6 min
        _linha("200.2.2.2", "GET", "/api/v1/products", 10, agente="curl/8.0"),                  # verificação
        _linha("200.3.3.3", "POST", "/api/v1/auth/refresh", 10),                                # renovação de sessão
        _linha("200.4.4.4", "POST", "/api/v1/client-logs", 10),                                 # registro de erro do app
    ])
    assert guarda.check(log, 120, True)[0] == guarda.FREE


@pytest.mark.parametrize("ips,esperado", [(1, 1), (3, 3)])
def test_conta_pessoas_por_ip(tmp_path, ips, esperado):
    log = _log(tmp_path, [_linha(f"200.0.0.{i}", "GET", "/api/v1/products", 20) for i in range(1, ips + 1)])
    codigo, msg = guarda.check(log, 120, True)
    assert codigo == guarda.BUSY and f"{esperado} pessoa" in msg
