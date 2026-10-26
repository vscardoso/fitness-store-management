#!/usr/bin/env python3
"""Guarda de publicação: só deixa o backend ser reiniciado quando ninguém está salvando algo.

Roda NO VPS, antes do deploy (chamado pelo GitHub Actions). Lê o access.log do nginx e olha, em tempo real:
- escritas (POST/PUT/PATCH/DELETE na API) nos últimos 120 s: alguém está lançando entrada, venda, cadastro...
  reiniciar agora derrubaria a gravação no meio;
- pessoas conectadas (IPs diferentes) nos últimos 5 min, só para informar.

Uso:
    guarda_publicacao.py --status              # só mostra a situação; sai com 0 (livre) ou 10 (ocupado)
    guarda_publicacao.py --esperar 25          # espera até 25 min a API ficar sem escrita; 10 se não liberar
    FORCAR=1 guarda_publicacao.py --esperar 25 # publica mesmo assim (avisa nas mensagens)
Opções: --log CAMINHO (padrão /var/log/nginx/access.log), --janela-escrita SEGUNDOS (padrão 120).
"""
import argparse
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

LINE = re.compile(r'^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) [^"]*" (\d{3}) \S+ "[^"]*" "([^"]*)"')
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
# Chamadas que não são uma pessoa salvando algo: renovação de sessão, registro de erro do app, webhooks e verificação
IGNORED_PREFIXES = ("/api/v1/auth/refresh", "/api/v1/client-logs", "/api/v1/webhooks", "/webhooks", "/health")
IGNORED_AGENTS = ("curl", "python-requests", "python-httpx", "GitHub", "UptimeRobot", "kube-probe")
BUSY, FREE = 10, 0


def parse_time(stamp: str) -> float:
    return datetime.strptime(stamp, "%d/%b/%Y:%H:%M:%S %z").timestamp()


def read_tail(path: str, max_bytes: int = 4_000_000) -> list:
    with open(path, "rb") as f:
        f.seek(0, os.SEEK_END)
        size = f.tell()
        f.seek(max(0, size - max_bytes))
        data = f.read().decode("utf-8", errors="replace")
    return data.splitlines()


def activity(lines: list, now: float, write_window: int = 120, people_window: int = 300) -> dict:
    writes, ips = [], set()
    for line in lines:
        m = LINE.match(line)
        if not m:
            continue
        ip, stamp, method, path, status, agent = m.groups()
        if not path.startswith("/api/v1/") or path.startswith(IGNORED_PREFIXES):
            continue
        if any(a.lower() in agent.lower() for a in IGNORED_AGENTS) or ip in ("127.0.0.1", "::1"):
            continue
        try:
            age = now - parse_time(stamp)
        except ValueError:
            continue
        if age < 0 or age > people_window:
            continue
        ips.add(ip)
        if method in WRITE_METHODS and age <= write_window:
            writes.append((int(age), method, path.split("?")[0]))
    writes.sort()
    return {"writes": writes, "people": len(ips)}


def report(info: dict, write_window: int) -> str:
    n = len(info["writes"])
    if n:
        ultimo = info["writes"][0]
        return (f"OCUPADO: {n} gravação(ões) nos últimos {write_window}s (a última há {ultimo[0]}s: {ultimo[1]} {ultimo[2]}); "
                f"{info['people']} pessoa(s) conectada(s) nos últimos 5 min.")
    return f"LIVRE: nenhuma gravação nos últimos {write_window}s; {info['people']} pessoa(s) conectada(s) nos últimos 5 min."


def check(log: str, write_window: int) -> tuple:
    info = activity(read_tail(log), time.time(), write_window)
    return (BUSY if info["writes"] else FREE), report(info, write_window)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--status", action="store_true")
    p.add_argument("--esperar", type=int, default=0, metavar="MINUTOS")
    p.add_argument("--log", default="/var/log/nginx/access.log")
    p.add_argument("--janela-escrita", type=int, default=120)
    a = p.parse_args()
    force = os.environ.get("FORCAR") == "1"

    code, msg = check(a.log, a.janela_escrita)
    print(msg, flush=True)
    if code == FREE or a.status and not a.esperar:
        return code if not force else FREE
    deadline = time.time() + a.esperar * 60
    while code == BUSY and time.time() < deadline:
        time.sleep(15)
        code, msg = check(a.log, a.janela_escrita)
        print(time.strftime("%H:%M:%S"), msg, flush=True)
    if code == BUSY:
        if force:
            print("FORCAR=1: publicando mesmo com gente gravando.", flush=True)
            return FREE
        print(f"Adiado: ainda há gente gravando depois de {a.esperar} min. Rode de novo quando liberar.", flush=True)
    return code


if __name__ == "__main__":
    sys.exit(main())
