#!/usr/bin/env python3
"""Monitor de logs do Provador: avisa quando os erros começam a estourar, sem ninguém precisar olhar.

Roda NO VPS, a cada minuto (cron), só com a biblioteca padrão do Python. Lê o que o nginx gravou desde a última rodada
(access.log), junta numa janela de 5 minutos e avaliou estas regras:

  erros_servidor   respostas 5xx da API (o servidor falhou)
  sessoes          401 em rotas que exigem login: gente sendo derrubada do app (o incidente de 10/11/2026)
  renovacao        falhas na renovação da sessão (/auth/refresh com 401, 429 ou 5xx)
  limite_pedidos   429 em excesso (o nginx está barrando pedidos)
  api_fora         /health sem responder, ou o container do backend não está saudável
  excecoes         tracebacks no log do backend
  disco            disco do servidor quase cheio

Cada regra avisa UMA vez quando começa, lembra a cada 30 min enquanto continua e avisa "voltou ao normal" depois de 10 min limpa.
Logo depois de uma publicação (backend reiniciado há poucos minutos) as regras de falha do servidor ficam quietas.

Como avisa (o que estiver configurado em /opt/provador/monitor.env, uma linha CHAVE=valor por canal):
  ALERT_PUSH_EMAILS=a@x.com,b@y.com    notificação no celular, pelo app instalado (Web Push), para essas contas
  TELEGRAM_BOT_TOKEN=... e TELEGRAM_CHAT_ID=...   mensagem no Telegram
Sem nenhum canal configurado só escreve no log (/var/log/provador-monitor.log).

Uso:
  monitor_logs.py                 uma rodada (é o que o cron chama)
  monitor_logs.py --teste         manda uma mensagem de teste por todos os canais e sai
  monitor_logs.py --simular       avalia e mostra o que faria, sem enviar nada e sem mexer no estado
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Callable, Dict, List, Optional

LINE = re.compile(r'^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) [^"]*" (\d{3}) \S+ "[^"]*" "([^"]*)"')
API = "/api/v1/"
# rotas da API em que 401 é normal (senha errada, conferência de e-mail...) ou tem regra própria
OPEN_PATHS = ("/api/v1/auth/login", "/api/v1/auth/signup", "/api/v1/auth/forgot-password", "/api/v1/auth/reset-password",
              "/api/v1/auth/check-email", "/api/v1/auth/check-slug", "/api/v1/auth/refresh", "/api/v1/legal/current")
DEFAULTS = {
    "WINDOW": 300,              # segundos olhados para trás
    "ERR5XX_MIN": 5,            # 5xx na janela
    "SESSION401_MIN": 20,       # 401 em rotas com login na janela
    "REFRESH_FAIL_MIN": 4,      # falhas de renovação de sessão na janela
    "TOO_MANY_MIN": 40,         # 429 na janela
    "EXCEPTIONS_MIN": 5,        # tracebacks do backend na janela
    "HEALTH_FAILS": 2,          # /health falhou tantas rodadas seguidas
    "DISK_PCT": 90,
    "REMIND_MIN": 30,           # lembra de novo depois disso, enquanto continua
    "RECOVER_MIN": 10,          # limpa por tanto tempo antes de avisar que voltou
    "QUIET_AFTER_RESTART": 240,  # segundos de silêncio nas regras do servidor depois de uma publicação
    "DISK_REMIND_HOURS": 24,
}
RULE_TITLES = {
    "erros_servidor": "Erros do servidor",
    "sessoes": "Usuários sendo deslogados",
    "renovacao": "Falha ao renovar a sessão",
    "limite_pedidos": "Muitos pedidos barrados (429)",
    "api_fora": "API fora do ar",
    "excecoes": "Erros dentro do backend",
    "disco": "Disco do servidor cheio",
}
SERVER_RULES = {"erros_servidor", "renovacao", "api_fora", "excecoes"}   # ficam quietas logo depois de reiniciar o backend


def parse_time(stamp: str) -> float:
    return datetime.strptime(stamp, "%d/%b/%Y:%H:%M:%S %z").timestamp()


def parse_line(line: str) -> Optional[list]:
    """[quando, status, método, caminho sem query, ip] ou None."""
    m = LINE.match(line)
    if not m:
        return None
    ip, stamp, method, target, status, _agent = m.groups()
    try:
        ts = parse_time(stamp)
    except ValueError:
        return None
    return [ts, int(status), method, target.split("?", 1)[0], ip]


# ───────────────────────────── leitura incremental do log ─────────────────────────────
def read_new(path: str, state: dict, max_bytes: int = 8_000_000) -> List[str]:
    """Linhas novas desde a última rodada. Log trocado (logrotate) ou menor que o ponto anterior: recomeça do início."""
    try:
        st = os.stat(path)
    except OSError:
        return []
    inode, size = st.st_ino, st.st_size
    offset = state.get("offset", 0)
    if state.get("inode") != inode or size < offset:
        offset = 0 if state.get("inode") is not None else max(0, size - 200_000)   # 1ª rodada: só o final do arquivo
    if size - offset > max_bytes:
        offset = size - max_bytes
    with open(path, "rb") as f:
        f.seek(offset)
        data = f.read(size - offset)
    state["inode"], state["offset"] = inode, size
    text = data.decode("utf-8", errors="replace")
    lines = text.splitlines()
    if offset and lines and not data.startswith(b"\n"):
        pass   # começa no meio de uma linha só quando cortou por max_bytes; a linha quebrada simplesmente não casa
    return lines


# ───────────────────────────── contas ─────────────────────────────
def summarize(events: List[list], now: float, window: int) -> dict:
    """Conta o que importa na janela. `events`: [quando, status, método, caminho, ip]."""
    start = now - window
    err5, s401, refresh_fail, too_many = [], [], [], 0
    ips401 = set()
    for ts, status, method, path, ip in events:
        if ts < start:
            continue
        if path.startswith(API):
            if 500 <= status <= 599:
                err5.append((method, path))
            if status == 401 and not path.startswith(OPEN_PATHS):
                s401.append(path)
                ips401.add(ip)
            if path.startswith("/api/v1/auth/refresh") and (status in (401, 429) or status >= 500):
                refresh_fail.append(status)
        if status == 429:
            too_many += 1
    def top(items):
        counts: Dict[str, int] = {}
        for it in items:
            key = " ".join(it) if isinstance(it, tuple) else str(it)
            counts[key] = counts.get(key, 0) + 1
        return max(counts.items(), key=lambda kv: kv[1])[0] if counts else ""
    return {
        "err5xx": len(err5), "err5xx_top": top(err5),
        "s401": len(s401), "s401_ips": len(ips401),
        "refresh_fail": len(refresh_fail), "too_many": too_many,
    }


def evaluate(stats: dict, extra: dict, cfg: dict, quiet_server: bool) -> Dict[str, str]:
    """Regras que estão disparadas agora -> frase do aviso. `extra`: health_fails, health_detail, exceptions, disk_pct."""
    firing: Dict[str, str] = {}
    mins = cfg["WINDOW"] // 60
    if stats["err5xx"] >= cfg["ERR5XX_MIN"]:
        firing["erros_servidor"] = f"{stats['err5xx']} respostas de erro do servidor (5xx) em {mins} min. Mais frequente: {stats['err5xx_top']}."
    if stats["s401"] >= cfg["SESSION401_MIN"]:
        firing["sessoes"] = (f"{stats['s401']} pedidos recusados por sessão inválida (401) em {mins} min, de {stats['s401_ips']} aparelho(s). "
                             "Gente sendo deslogada do app.")
    if stats["refresh_fail"] >= cfg["REFRESH_FAIL_MIN"]:
        firing["renovacao"] = f"{stats['refresh_fail']} falhas ao renovar a sessão em {mins} min."
    if stats["too_many"] >= cfg["TOO_MANY_MIN"]:
        firing["limite_pedidos"] = f"{stats['too_many']} pedidos barrados pelo limite (429) em {mins} min."
    if extra.get("health_fails", 0) >= cfg["HEALTH_FAILS"]:
        firing["api_fora"] = f"A API não responde ({extra.get('health_detail') or 'sem resposta do /health'})."
    if extra.get("exceptions", 0) >= cfg["EXCEPTIONS_MIN"]:
        firing["excecoes"] = f"{extra['exceptions']} erros (traceback) no log do backend em {mins} min."
    if extra.get("disk_pct", 0) >= cfg["DISK_PCT"]:
        firing["disco"] = f"Disco do servidor com {extra['disk_pct']}% ocupado."
    if quiet_server:
        for r in SERVER_RULES:
            firing.pop(r, None)
    return firing


def decide(rules: dict, firing: Dict[str, str], now: float, cfg: dict) -> List[dict]:
    """Máquina de estados dos avisos. Altera `rules` e devolve as mensagens a enviar ({rule, kind, title, body})."""
    out: List[dict] = []
    remind_s = cfg["REMIND_MIN"] * 60
    for name, text in firing.items():
        r = rules.setdefault(name, {})
        r.pop("ok_since", None)
        if not r.get("active"):
            r.update(active=True, since=now, last_sent=now)
            out.append({"rule": name, "kind": "novo", "title": f"Provador: {RULE_TITLES[name]}", "body": text})
            continue
        gap = (cfg["DISK_REMIND_HOURS"] * 3600) if name == "disco" else remind_s
        if now - r.get("last_sent", 0) >= gap:
            r["last_sent"] = now
            mins = int((now - r.get("since", now)) // 60)
            out.append({"rule": name, "kind": "lembrete", "title": f"Provador: {RULE_TITLES[name]} (continua há {mins} min)", "body": text})
    for name, r in rules.items():
        if name in firing or not r.get("active"):
            continue
        r.setdefault("ok_since", now)
        if now - r["ok_since"] >= cfg["RECOVER_MIN"] * 60:
            mins = int((now - r.get("since", now)) // 60)
            out.append({"rule": name, "kind": "normal", "title": f"Provador: {RULE_TITLES[name]} voltou ao normal",
                        "body": f"Ficou {mins} min com problema e agora está normal."})
            r.clear()
    return out


# ───────────────────────────── leituras do servidor ─────────────────────────────
def health_check(url: str = "http://127.0.0.1:8000/health") -> str:
    """'' se está bem; senão o motivo."""
    try:
        with urllib.request.urlopen(url, timeout=6) as resp:
            return "" if resp.status == 200 else f"/health respondeu {resp.status}"
    except Exception as exc:  # noqa: BLE001
        return f"/health falhou: {type(exc).__name__}"


def docker_value(fmt: str, name: str = "provador-backend") -> str:
    try:
        return subprocess.run(["docker", "inspect", "-f", fmt, name], capture_output=True, text=True, timeout=15).stdout.strip()
    except Exception:  # noqa: BLE001
        return ""


def backend_started_at() -> Optional[float]:
    raw = docker_value("{{.State.StartedAt}}")
    if not raw:
        return None
    try:
        return datetime.strptime(raw[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc).timestamp()   # o docker informa em UTC
    except ValueError:
        return None


def traceback_count(window: int) -> int:
    try:
        out = subprocess.run(["docker", "logs", "--since", f"{window}s", "provador-backend"], capture_output=True, text=True, timeout=30)
        return (out.stdout + out.stderr).count("Traceback (most recent call last)")
    except Exception:  # noqa: BLE001
        return 0


def disk_pct(path: str = "/") -> int:
    u = shutil.disk_usage(path)
    return int(round(u.used * 100 / u.total))


# ───────────────────────────── envio ─────────────────────────────
def load_env(path: str) -> dict:
    cfg: dict = {}
    try:
        for raw in open(path, encoding="utf-8"):
            raw = raw.strip()
            if raw and not raw.startswith("#") and "=" in raw:
                k, v = raw.split("=", 1)
                cfg[k.strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    return cfg


def send_push(title: str, body: str, emails: str) -> str:
    """Web Push pelo backend (container rodando; se ele caiu, sobe um container descartável da mesma imagem)."""
    args = ["scripts/enviar_alerta.py", "--title", title, "--body", body, "--emails", emails]
    for cmd in (["docker", "exec", "-w", "/app", "-e", "PYTHONPATH=/app", "provador-backend", "python"] + args,
                ["docker", "run", "--rm", "--network", "provador_default", "--env-file", "/opt/provador/.env.prod",
                 "-w", "/app", "-e", "PYTHONPATH=/app", "--entrypoint", "python", "provador-backend"] + args):
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
            if r.returncode == 0:
                return "push: " + (r.stdout.strip().splitlines() or ["ok"])[-1]
        except Exception:  # noqa: BLE001
            continue
    return "push: falhou"


def send_telegram(title: str, body: str, token: str, chat_id: str) -> str:
    data = urllib.parse.urlencode({"chat_id": chat_id, "text": f"{title}\n{body}"}).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=data), timeout=15) as r:
            return "telegram: ok" if r.status == 200 else f"telegram: {r.status}"
    except Exception as exc:  # noqa: BLE001
        return f"telegram: falhou ({type(exc).__name__})"


def make_sender(env: dict) -> Callable[[str, str], List[str]]:
    def send(title: str, body: str) -> List[str]:
        results = []
        if env.get("ALERT_PUSH_EMAILS"):
            results.append(send_push(title, body, env["ALERT_PUSH_EMAILS"]))
        if env.get("TELEGRAM_BOT_TOKEN") and env.get("TELEGRAM_CHAT_ID"):
            results.append(send_telegram(title, body, env["TELEGRAM_BOT_TOKEN"], env["TELEGRAM_CHAT_ID"]))
        if not results:
            results.append("nenhum canal configurado (só registrado no log)")
        return results
    return send


# ───────────────────────────── uma rodada ─────────────────────────────
def run_once(cfg: dict, state: dict, lines: List[str], now: float, *, health: Callable[[], str], disk: Callable[[], int],
             started_at: Callable[[], Optional[float]], tracebacks: Callable[[int], int], send: Callable[[str, str], List[str]],
             dry: bool = False) -> List[dict]:
    events = [e for e in state.get("events", []) if e[0] >= now - cfg["WINDOW"]]
    for line in lines:
        ev = parse_line(line)
        if ev:
            events.append(ev)
    events = events[-30000:]
    state["events"] = [e for e in events if e[0] >= now - cfg["WINDOW"]]

    reason = health()
    state["health_fails"] = (state.get("health_fails", 0) + 1) if reason else 0
    started = started_at()
    quiet = bool(started) and 0 <= now - started < cfg["QUIET_AFTER_RESTART"]
    stats = summarize(state["events"], now, cfg["WINDOW"])
    extra = {"health_fails": state["health_fails"], "health_detail": reason, "disk_pct": disk(),
             "exceptions": tracebacks(cfg["WINDOW"]) if not quiet else 0}
    firing = evaluate(stats, extra, cfg, quiet)
    rules = state.setdefault("rules", {})
    messages = decide(rules, firing, now, cfg)
    for m in messages:
        m["sent"] = [] if dry else send(m["title"], m["body"])
    return messages


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Monitor de logs do Provador")
    ap.add_argument("--log", default="/var/log/nginx/access.log")
    ap.add_argument("--estado", default="/var/lib/provador-monitor/state.json")
    ap.add_argument("--env", default="/opt/provador/monitor.env")
    ap.add_argument("--teste", action="store_true", help="manda uma mensagem de teste e sai")
    ap.add_argument("--simular", action="store_true", help="avalia e mostra, sem enviar nem gravar o estado")
    args = ap.parse_args(argv)

    env = load_env(args.env)
    cfg = dict(DEFAULTS)
    for k in DEFAULTS:
        if k in env:
            try:
                cfg[k] = int(env[k])
            except ValueError:
                pass
    send = make_sender(env)
    stamp = datetime.now().strftime("%d/%m %H:%M:%S")

    if args.teste:
        res = send("Provador: teste do monitor", f"Se você recebeu isto, o aviso de erros está funcionando ({stamp}).")
        print(stamp, "teste ->", "; ".join(res))
        return 0

    state: dict = {}
    try:
        state = json.load(open(args.estado, encoding="utf-8"))
    except (OSError, ValueError):
        state = {}
    now = time.time()
    lines = read_new(args.log, state)
    messages = run_once(cfg, state, lines, now, health=health_check, disk=disk_pct, started_at=backend_started_at,
                        tracebacks=traceback_count, send=send, dry=args.simular)
    for m in messages:
        print(stamp, m["kind"], "|", m["title"], "|", m["body"], "|", "; ".join(m["sent"]) or "(simulado)")
    if not args.simular:
        os.makedirs(os.path.dirname(args.estado), exist_ok=True)
        tmp = args.estado + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f)
        os.replace(tmp, args.estado)
    return 0


if __name__ == "__main__":
    sys.exit(main())
