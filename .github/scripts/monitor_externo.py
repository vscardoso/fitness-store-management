#!/usr/bin/env python3
"""
Monitor EXTERNO da produção do Provador. Roda nos servidores do GitHub (fora do VPS), então continua
avisando quando o VPS inteiro cai, bloqueio de IP da Hetzner incluído (o monitor de dentro do VPS morre junto).

Testa: API (/health), app, vitrine, site da W.A, portas 22 e 443 e validade do certificado de cada domínio.
Sai com código 0 (tudo certo) ou 1 (algo falhou) e escreve o resumo em monitor_resultado.md.
Só biblioteca padrão. Uso: python monitor_externo.py [--simular-falha]
"""
import json
import socket
import ssl
import sys
import time
import urllib.request
from datetime import datetime, timezone

HOST_VPS = "204.168.144.151"
DOMINIOS = ["api.provadorfit.com.br", "app.provadorfit.com.br", "loja.provadorfit.com.br", "wamodafitness.com.br"]
HTTP = [
    ("API", "https://api.provadorfit.com.br/health", "healthy"),
    ("App", "https://app.provadorfit.com.br/", None),
    ("Vitrine", "https://loja.provadorfit.com.br/wa-fitness-1/96", None),
    ("Site da W.A", "https://wamodafitness.com.br/", None),
]
TENTATIVAS = 3          # uma falha isolada de rede do GitHub não pode acordar ninguém
ESPERA_S = 8
CERT_DIAS_MIN = 14      # avisa com 14 dias de folga (o certbot renova sozinho com 30)


def http_ok(url, contem):
    req = urllib.request.Request(url, headers={"User-Agent": "provador-monitor-externo"})
    with urllib.request.urlopen(req, timeout=15) as r:
        corpo = r.read(4000).decode("utf-8", "replace")
        if r.status != 200:
            raise RuntimeError(f"HTTP {r.status}")
        if contem and contem not in corpo:
            raise RuntimeError(f"resposta sem '{contem}'")


def porta_ok(host, porta):
    with socket.create_connection((host, porta), timeout=10):
        pass


def cert_dias(dominio):
    ctx = ssl.create_default_context()
    with socket.create_connection((dominio, 443), timeout=10) as s:
        with ctx.wrap_socket(s, server_hostname=dominio) as t:   # falha se o nome do certificado não bate
            fim = ssl.cert_time_to_seconds(t.getpeercert()["notAfter"])
    return int((fim - time.time()) // 86400)


def com_tentativas(fn):
    ultimo = None
    for i in range(TENTATIVAS):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001 - qualquer falha conta
            ultimo = e
            if i < TENTATIVAS - 1:
                time.sleep(ESPERA_S)
    raise ultimo


def main():
    simular = "--simular-falha" in sys.argv
    falhas, linhas = [], []

    def registra(nome, fn):
        t0 = time.time()
        try:
            r = com_tentativas(fn)
            linhas.append(f"- OK  {nome} ({time.time() - t0:.1f}s){'' if r is None else ' ' + str(r)}")
        except Exception as e:  # noqa: BLE001
            msg = f"{type(e).__name__}: {e}"
            falhas.append((nome, msg))
            linhas.append(f"- FALHOU  {nome}: {msg}")

    for nome, url, contem in HTTP:
        if simular and nome == "API":
            url = "https://api.provadorfit.com.br/rota-que-nao-existe"
        registra(nome, lambda u=url, c=contem: http_ok(u, c))
    for porta, nome in ((22, "SSH (porta 22)"), (443, "HTTPS (porta 443)")):
        registra(nome, lambda p=porta: porta_ok(HOST_VPS, p))
    for d in DOMINIOS:
        def checa(dom=d):
            dias = cert_dias(dom)
            if dias < CERT_DIAS_MIN:
                raise RuntimeError(f"certificado vence em {dias} dias")
            return f"certificado ok, vence em {dias} dias"
        registra(f"Certificado {d}", checa)

    agora = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")
    titulo = "Produção do Provador FORA do ar ou com problema" if falhas else "Produção do Provador ok"
    corpo = [f"**{titulo}**", f"Verificado em {agora} (3 tentativas por teste).", ""] + linhas
    if falhas:
        corpo += ["", "O que fazer:",
                  "1. Se API, app, SSH e HTTPS falharam juntos, o servidor inteiro está inalcançável: veja a Hetzner "
                  "(bloqueio de IP por fatura/abuso, ou servidor parado) em https://console.hetzner.cloud",
                  "2. Se só a vitrine falhou, veja o nginx do site `provador-loja` (sites-enabled) e o certificado.",
                  "3. Se só um certificado falhou, rode `certbot renew` no VPS."]
    texto = "\n".join(corpo) + "\n"
    open("monitor_resultado.md", "w", encoding="utf-8").write(texto)
    print(texto)
    json.dump({"falhou": bool(falhas), "falhas": [f"{n}: {m}" for n, m in falhas]}, open("monitor_resultado.json", "w"))
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
