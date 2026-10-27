"""Teste de carga em degraus pela URL pública (rodar da SUA máquina, não do servidor).

Cada degrau mantém N usuários simultâneos por DURACAO segundos, cada um repetindo um uso realista da loja 1
(lista de produtos, busca, dashboard, fornecedores, categorias, entradas e, raramente, uma gravação).
Mede por degrau: pedidos/s, mediana, p95, p99, máximo, erros por tipo (timeout, 429, 5xx, conexão) e,
entre degraus, saúde/memória/carga do servidor. Para sozinho se o servidor não aguenta (erro >40% ou container fora).

  python carga_degraus.py <TOKEN> [duracao_s=40] [degraus=5,10,25,50,100,200]
"""
import asyncio
import random
import statistics
import subprocess
import sys
import time
from collections import Counter

import httpx

BASE = "https://api.provadorfit.com.br/api/v1"
TOKEN = sys.argv[1]
DURACAO = int(sys.argv[2]) if len(sys.argv) > 2 else 40
DEGRAUS = [int(x) for x in (sys.argv[3] if len(sys.argv) > 3 else "5,10,25,50,100,200").split(",")]
TIMEOUT = 65.0  # logo acima dos 60 s do nginx: o que passar disso é timeout do servidor, não do cliente
SSH = ["ssh", "-i", str(__import__("pathlib").Path.home() / ".ssh" / "provador_deploy"), "-o", "ConnectTimeout=10",
       "root@204.168.144.151"]
H = {"Authorization": f"Bearer {TOKEN}"}

USOS = [  # (peso, nome, método, url)
    (30, "lista de produtos (50)", "GET", "/products?limit=50"),
    (10, "lista de produtos (pagina 2)", "GET", "/products?limit=50&skip=50"),
    (12, "busca por nome", "GET", "/products?search=Legging&limit=30"),
    (8, "com estoque", "GET", "/products?has_stock=true&limit=30"),
    (10, "dashboard valor do estoque", "GET", "/dashboard/inventory/valuation"),
    (6, "dashboard vendas", "GET", "/dashboard/sales/monthly?period=this_month"),
    (6, "fornecedores", "GET", "/suppliers"),
    (5, "categorias", "GET", "/categories/"),
    (5, "entradas", "GET", "/stock-entries?limit=30"),
    (4, "estoque baixo", "GET", "/products/low-stock"),
    (4, "GRAVACAO: novo fornecedor", "POST", "/suppliers"),
]
PESOS = [u[0] for u in USOS]


def servidor():
    try:
        out = subprocess.run(SSH + [
            "docker inspect provador-backend --format '{{.State.Health.Status}} reinicios={{.RestartCount}}'; "
            "docker stats --no-stream --format 'cpu={{.CPUPerc}} mem={{.MemUsage}}' provador-backend; "
            "cut -d' ' -f1-3 /proc/loadavg"], capture_output=True, text=True, timeout=25).stdout.split("\n")
        return " | ".join(x.strip() for x in out if x.strip())
    except Exception as e:  # noqa: BLE001
        return f"sem resposta do ssh ({type(e).__name__})"


async def usuario(client, fim, lat, erros, cont):
    while time.time() < fim:
        _, nome, metodo, url = random.choices(USOS, weights=PESOS)[0]
        kw = {}
        if metodo == "POST":
            kw["json"] = {"name": f"Carga Degraus {random.randint(0, 10**9)}", "notes": "ESTRESSE"}
        t0 = time.perf_counter()
        try:
            r = await client.request(metodo, url, **kw)
            ms = (time.perf_counter() - t0) * 1000
            lat[nome].append(ms)
            cont["ok" if r.status_code < 400 else "erro"] += 1
            if r.status_code >= 400:
                erros[f"{r.status_code}"] += 1
        except httpx.TimeoutException:
            erros["timeout do cliente (>65s)"] += 1
            cont["erro"] += 1
        except Exception as e:  # noqa: BLE001
            erros[type(e).__name__] += 1
            cont["erro"] += 1
        await asyncio.sleep(random.uniform(0.2, 1.0))  # pausa de "pensar" entre cliques


async def degrau(n):
    lat = {u[1]: [] for u in USOS}
    erros, cont = Counter(), Counter()
    limits = httpx.Limits(max_connections=n + 5, max_keepalive_connections=n + 5)
    async with httpx.AsyncClient(base_url=BASE, headers=H, timeout=TIMEOUT, limits=limits) as client:
        fim = time.time() + DURACAO
        t0 = time.time()
        await asyncio.gather(*[usuario(client, fim, lat, erros, cont) for _ in range(n)])
        dur = time.time() - t0
    todos = sorted(x for v in lat.values() for x in v)
    total = cont["ok"] + cont["erro"]
    print(f"\n=== {n} usuarios simultaneos, {DURACAO}s ===")
    if todos:
        p = lambda q: todos[min(len(todos) - 1, int(len(todos) * q))]  # noqa: E731
        print(f"pedidos: {total}  ({total / dur:.1f}/s)  ok: {cont['ok']}  erros: {cont['erro']} ({100 * cont['erro'] / max(total, 1):.1f}%)")
        print(f"tempo (ms): mediana {statistics.median(todos):.0f}  p95 {p(0.95):.0f}  p99 {p(0.99):.0f}  maximo {todos[-1]:.0f}")
        pior = sorted(((statistics.median(v), k, len(v)) for k, v in lat.items() if v), reverse=True)[:4]
        print("mais lentas (mediana ms): " + "; ".join(f"{k} {m:.0f} (n={c})" for m, k, c in pior))
    if erros:
        print("erros:", dict(erros))
    print("servidor:", servidor(), flush=True)
    return 100 * cont["erro"] / max(total, 1)


async def main():
    print("antes:", servidor(), flush=True)
    for n in DEGRAUS:
        taxa = await degrau(n)
        if taxa > 40:
            print(f"\n>>> PAROU em {n} usuarios: {taxa:.0f}% de erro. Esse é o ponto de quebra.")
            break
        await asyncio.sleep(8)  # deixa o servidor respirar entre degraus
    await asyncio.sleep(10)
    print("\napos o teste (recuperou?):", servidor())
    async with httpx.AsyncClient(base_url=BASE, headers=H, timeout=30) as c:
        t0 = time.perf_counter()
        r = await c.get("/categories/")
        print(f"pedido simples depois da carga: {r.status_code} em {(time.perf_counter() - t0) * 1000:.0f} ms")

asyncio.run(main())
