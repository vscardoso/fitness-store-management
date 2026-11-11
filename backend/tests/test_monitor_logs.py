"""Monitor de logs (deploy/monitor_logs.py): avisa quando os erros começam a estourar, uma vez, sem repetir a cada minuto."""
import importlib.util
import os
import time
from datetime import datetime, timezone
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("monitor", Path(__file__).resolve().parents[2] / "deploy" / "monitor_logs.py")
mon = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mon)

NOW = 1_800_000_000.0   # um instante fixo


def stamp(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%d/%b/%Y:%H:%M:%S +0000")


def line(ts, status, path="/api/v1/products", method="GET", ip="1.2.3.4"):
    return f'{ip} - - [{stamp(ts)}] "{method} {path} HTTP/1.1" {status} 120 "-" "Mozilla/5.0"'


def cfg(**over):
    c = dict(mon.DEFAULTS)
    c.update(over)
    return c


def deps(**over):
    d = dict(health=lambda: "", disk=lambda: 40, started_at=lambda: None, tracebacks=lambda w: 0, sent=[])
    d.update(over)
    d["send"] = lambda title, body: (d["sent"].append((title, body)) or ["fake: ok"])
    return d


def rodada(state, lines, now, c=None, **over):
    d = deps(**over)
    msgs = mon.run_once(c or cfg(), state, lines, now, health=d["health"], disk=d["disk"], started_at=d["started_at"],
                        tracebacks=d["tracebacks"], send=d["send"])
    return msgs, d["sent"]


def test_le_a_linha_do_nginx():
    ev = mon.parse_line('179.221.151.183 - - [11/Nov/2026:01:27:11 +0000] "POST /api/v1/auth/login?x=1 HTTP/1.1" 401 38 "https://app.provadorfit.com.br/" "Mozilla/5.0 (X11)"')
    assert ev[1:] == [401, "POST", "/api/v1/auth/login", "179.221.151.183"]
    assert abs(ev[0] - datetime(2026, 11, 11, 1, 27, 11, tzinfo=timezone.utc).timestamp()) < 1
    assert mon.parse_line("lixo que não é linha do nginx") is None


def test_erro_5xx_dispara_so_acima_do_limite_e_diz_a_rota_mais_afetada():
    state = {}
    poucos = [line(NOW - 30, 500, "/api/v1/stock-entries/receive", "POST") for _ in range(4)]
    msgs, _ = rodada(state, poucos, NOW)
    assert msgs == []                                   # 4 < 5: ainda não é estouro
    mais = [line(NOW - 10, 502, "/api/v1/stock-entries/receive", "POST")]
    msgs, sent = rodada(state, mais, NOW)
    assert [m["rule"] for m in msgs] == ["erros_servidor"]
    assert "5 respostas de erro do servidor" in msgs[0]["body"] and "POST /api/v1/stock-entries/receive" in msgs[0]["body"]
    assert len(sent) == 1


def test_401_de_login_errado_nao_conta_mas_401_de_rota_com_login_sim():
    state = {}
    login = [line(NOW - 5, 401, "/api/v1/auth/login", "POST") for _ in range(60)]
    assert rodada(state, login, NOW)[0] == []           # senha errada é normal
    sessao = [line(NOW - 5, 401, f"/api/v1/stock-entries/{i}", ip="104.28.63.92") for i in range(25)]
    msgs, _ = rodada({}, sessao, NOW)
    assert [m["rule"] for m in msgs] == ["sessoes"]
    assert "25 pedidos recusados por sessão inválida" in msgs[0]["body"] and "1 aparelho" in msgs[0]["body"]


def test_falha_de_renovacao_e_429_em_excesso():
    ref = [line(NOW - 5, s, "/api/v1/auth/refresh", "POST") for s in (401, 401, 429, 401)]
    msgs, _ = rodada({}, ref, NOW)
    assert [m["rule"] for m in msgs] == ["renovacao"]
    muitos = [line(NOW - 5, 429) for _ in range(40)]
    msgs, _ = rodada({}, muitos, NOW)
    assert [m["rule"] for m in msgs] == ["limite_pedidos"]


def test_api_fora_exige_falhas_seguidas_e_volta_ao_normal():
    state = {}
    msgs, _ = rodada(state, [], NOW, health=lambda: "/health falhou: URLError")
    assert msgs == []                                   # 1 falha só: pode ser um instante
    msgs, _ = rodada(state, [], NOW + 60, health=lambda: "/health falhou: URLError")
    assert [m["rule"] for m in msgs] == ["api_fora"]
    # voltou: precisa ficar bem por 10 min antes de avisar "voltou ao normal"
    assert rodada(state, [], NOW + 120)[0] == []
    msgs, _ = rodada(state, [], NOW + 120 + 600)
    assert [(m["rule"], m["kind"]) for m in msgs] == [("api_fora", "normal")]
    assert "voltou ao normal" in msgs[0]["title"]


def test_avisa_uma_vez_lembra_a_cada_30_min_e_nao_repete_no_meio():
    state = {}
    estouro = lambda t: [line(t - 5, 500) for _ in range(6)]
    msgs, _ = rodada(state, estouro(NOW), NOW)
    assert [m["kind"] for m in msgs] == ["novo"]
    for k in range(1, 10):                              # os 9 minutos seguintes: nada de aviso repetido
        assert rodada(state, estouro(NOW + 60 * k), NOW + 60 * k)[0] == []
    msgs, _ = rodada(state, estouro(NOW + 1800), NOW + 1800)
    assert [m["kind"] for m in msgs] == ["lembrete"] and "continua há 30 min" in msgs[0]["title"]


def test_depois_da_publicacao_as_regras_do_servidor_ficam_quietas():
    state = {}
    reinicio = NOW - 60                                  # backend reiniciou há 1 min (publicação)
    ruido = [line(NOW - 5, 502) for _ in range(30)]
    assert rodada(state, ruido, NOW, started_at=lambda: reinicio)[0] == []
    # as regras que não são de falha do servidor continuam valendo
    sessao = [line(NOW - 5, 401, f"/api/v1/x/{i}") for i in range(25)]
    msgs, _ = rodada({}, sessao, NOW, started_at=lambda: reinicio)
    assert [m["rule"] for m in msgs] == ["sessoes"]
    # passado o silêncio, o mesmo ruído avisa
    msgs, _ = rodada({}, [line(NOW + 400 - 5, 502) for _ in range(30)], NOW + 400, started_at=lambda: reinicio)
    assert [m["rule"] for m in msgs] == ["erros_servidor"]


def test_disco_cheio_avisa_uma_vez_por_dia():
    state = {}
    msgs, _ = rodada(state, [], NOW, disk=lambda: 93)
    assert [m["rule"] for m in msgs] == ["disco"] and "93%" in msgs[0]["body"]
    assert rodada(state, [], NOW + 3600 * 5, disk=lambda: 93)[0] == []
    assert [m["kind"] for m in rodada(state, [], NOW + 3600 * 25, disk=lambda: 93)[0]] == ["lembrete"]


def test_excecoes_do_backend():
    msgs, _ = rodada({}, [], NOW, tracebacks=lambda w: 7)
    assert [m["rule"] for m in msgs] == ["excecoes"]


def test_leitura_incremental_do_log_e_troca_de_arquivo(tmp_path):
    log = tmp_path / "access.log"
    log.write_text("\n".join(line(NOW - 100 + i, 200) for i in range(3)) + "\n")
    state = {}
    assert len(mon.read_new(str(log), state)) == 3      # 1ª rodada
    assert mon.read_new(str(log), state) == []          # nada novo
    with open(log, "a") as f:
        f.write(line(NOW, 500) + "\n")
    assert len(mon.read_new(str(log), state)) == 1      # só a linha nova
    # logrotate: o arquivo antigo vira .1 e nasce outro (inode novo) menor que o ponto anterior
    os.replace(log, tmp_path / "access.log.1")
    log.write_text(line(NOW + 1, 500) + "\n" + line(NOW + 2, 500) + "\n")
    assert len(mon.read_new(str(log), state)) == 2      # recomeça do início do arquivo novo
    assert mon.read_new(str(tmp_path / "nao-existe.log"), state) == []


def test_janela_descarta_o_que_ficou_velho():
    state = {}
    rodada(state, [line(NOW - 3000, 500) for _ in range(20)], NOW - 2990)   # estouro antigo
    msgs, _ = rodada(state, [], NOW)                                          # 50 min depois: fora da janela de 5 min
    assert all(m["kind"] != "novo" for m in msgs)


def test_main_teste_manda_por_todos_os_canais_configurados(tmp_path, monkeypatch, capsys):
    env = tmp_path / "monitor.env"
    env.write_text("ALERT_PUSH_EMAILS=a@x.com,b@y.com\nTELEGRAM_BOT_TOKEN=tok\nTELEGRAM_CHAT_ID=123\n# comentario\n")
    chamadas = []
    monkeypatch.setattr(mon, "send_push", lambda t, b, e: chamadas.append(("push", e)) or "push: ok")
    monkeypatch.setattr(mon, "send_telegram", lambda t, b, tok, chat: chamadas.append(("telegram", chat)) or "telegram: ok")
    assert mon.main(["--teste", "--env", str(env)]) == 0
    assert chamadas == [("push", "a@x.com,b@y.com"), ("telegram", "123")]
    assert "teste" in capsys.readouterr().out


def test_sem_canal_configurado_so_registra(tmp_path, capsys):
    env = tmp_path / "vazio.env"
    env.write_text("")
    assert mon.main(["--teste", "--env", str(env)]) == 0
    assert "nenhum canal configurado" in capsys.readouterr().out


def test_main_uma_rodada_grava_o_estado_e_nao_repete_o_aviso(tmp_path, monkeypatch, capsys):
    log = tmp_path / "access.log"
    agora = time.time()
    log.write_text("\n".join(line(agora - 20, 500, "/api/v1/sales/", "POST") for _ in range(8)) + "\n")
    env, estado = tmp_path / "e.env", tmp_path / "estado" / "state.json"
    env.write_text("ALERT_PUSH_EMAILS=a@x.com\n")
    enviados = []
    monkeypatch.setattr(mon, "send_push", lambda t, b, e: enviados.append(t) or "push: ok")
    monkeypatch.setattr(mon, "health_check", lambda *a, **k: "")
    monkeypatch.setattr(mon, "disk_pct", lambda *a, **k: 30)
    monkeypatch.setattr(mon, "backend_started_at", lambda: None)
    monkeypatch.setattr(mon, "traceback_count", lambda w: 0)
    args = ["--log", str(log), "--estado", str(estado), "--env", str(env)]
    # 1ª rodada só olha o fim do arquivo (já tem as 8 linhas), avisa; a 2ª não repete
    assert mon.main(args) == 0
    assert estado.exists() and len(enviados) == 1 and "Erros do servidor" in enviados[0]
    assert mon.main(args) == 0
    assert len(enviados) == 1
    # --simular não manda nada e não mexe no estado
    antes = estado.read_text()
    assert mon.main(args + ["--simular"]) == 0
    assert estado.read_text() == antes and len(enviados) == 1
