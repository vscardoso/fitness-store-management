"""Ambiente de teste local (SIT na máquina): cria uma loja de exemplo num backend DESCARTÁVEL e grava o acesso em
backend/ambiente_teste_acesso.local.txt (ignorado pelo git). Nunca rodar contra produção: só aceita localhost.

Uso (com o backend de teste ligado em 127.0.0.1:8000, ver docs/AMBIENTE_TESTE.md):
    python scripts/ambiente_teste.py [http://127.0.0.1:8000/api/v1]

Cria: loja, 6 entradas com produtos (tênis, conjuntos...), 3 vendas, fila de etiquetas, financeiro implantado com
transferência, despesa a pagar e retirada (para testar "Corrigir").
"""
import secrets
import sys
from datetime import date, timedelta
from pathlib import Path

import httpx

B = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000/api/v1"
assert B.startswith(("http://127.0.0.1", "http://localhost")), "só roda contra o backend de teste local"
OUT = Path(__file__).resolve().parent.parent / "ambiente_teste_acesso.local.txt"

c = httpx.Client(timeout=90)
email = "loja.teste@exemplo.com"
senha = "Teste!" + secrets.token_hex(4)
ver = c.get(B + "/legal/current").json()["version"]
r = c.post(B + "/auth/signup", json={"full_name": "Loja Teste", "email": email, "password": senha, "store_name": "Loja Teste (SIT)",
                                     "plan": "pro", "accept_terms": True, "terms_version": ver})
assert r.status_code in (200, 201), r.text
H = {"Authorization": "Bearer " + c.post(B + "/auth/login", json={"email": email, "password": senha}).json()["access_token"]}
hoje = date.today()
T = hoje.isoformat()


def ok(r, *codes):
    assert r.status_code in (codes or (200, 201)), f"{r.request.url} -> {r.status_code} {r.text[:300]}"
    return r.json()


cats = {n: ok(c.post(B + "/categories/", json={"name": n}, headers=H))["id"] for n in ("Calçados", "Conjuntos", "Camisetas")}

PRODUTOS = [  # nome, sku, categoria, custo, preço, quantidade, código da entrada, fornecedor
    ("Tênis New Balance 9060", "NB-9060", "Calçados", 38, 159.9, 4, "COMPRAS-SP-01", "Fornecedor A"),
    ("Tênis Nike Air Max", "NK-AIR", "Calçados", 120, 349.9, 3, "COMPRAS-SP-02", "Rua 25"),
    ("Conjunto Alô Poliamida", "CJ-ALO", "Conjuntos", 52, 139.9, 6, "COMPRAS-SP-03", "Andrea SP"),
    ("Conjunto Lupo Seamless", "CJ-LUPO", "Conjuntos", 61, 159.9, 5, "COMPRAS-SP-04", "Fornecedor A"),
    ("Camiseta Dry Fit", "CT-DRY", "Camisetas", 18, 59.9, 10, "COMPRAS-SP-05", "Rua 25"),
    ("Regata Blusa Tule", "RG-TULE", "Camisetas", 14, 49.9, 8, "COMPRAS-SP-06", "Andrea SP"),
]
prods = {}
for nome, sku, cat, custo, preco, qtd, code, forn in PRODUTOS:
    ok(c.post(B + "/stock-entries/with-new-product", headers=H, json={
        "product_name": nome, "product_sku": sku, "product_category_id": cats[cat], "product_cost_price": custo, "product_price": preco,
        "quantity": qtd, "entry_code": code, "entry_date": (hoje - timedelta(days=3)).isoformat(), "entry_type": "local", "supplier_name": forn}))
lista = ok(c.get(B + "/products/?limit=100", headers=H))
lista = lista if isinstance(lista, list) else lista.get("items", lista.get("products", []))
for p in lista:
    v = ok(c.get(f"{B}/product-variants/product/{p['id']}", headers=H))
    prods[p["name"]] = (p["id"], v[0]["id"], p.get("sale_price") or p.get("price") or 100)

# despesa do lote na primeira entrada (para aparecer "de despesas" no custo da peça)
ents = ok(c.get(B + "/stock-entries/?limit=20", headers=H))
ents = ents if isinstance(ents, list) else ents.get("items", [])
primeira = next(e for e in ents if e["entry_code"] == "COMPRAS-SP-01")
ok(c.post(B + "/expenses", headers=H, json={"amount": "34.00", "description": "Frete do lote", "expense_date": T, "stock_entry_id": primeira["id"]}))

# 3 vendas
for nome, qtd in (("Camiseta Dry Fit", 2), ("Tênis New Balance 9060", 1), ("Conjunto Alô Poliamida", 1)):
    pid, vid, preco = prods[nome]
    total = float(preco) * qtd
    ok(c.post(B + "/sales/", headers=H, json={"payment_method": "cash", "items": [{"product_id": pid, "variant_id": vid, "quantity": qtd, "unit_price": float(preco)}],
                                              "payments": [{"amount": total, "payment_method": "cash"}]}))

# fila de etiquetas
pid, vid, _ = prods["Tênis New Balance 9060"]
ok(c.post(B + "/labels/queue", headers=H, json={"items": [{"variant_id": vid, "quantity": 1}], "entry_id": primeira["id"]}))

# financeiro
ok(c.post(B + "/finance/setup", headers=H, json={"start_date": (hoje - timedelta(days=10)).isoformat(), "cash_balance": 150, "card_balance": 0,
                                                 "banks": [{"name": "Nubank", "balance": 1000, "receives_pix": True}], "payables": []}))
acc = {a["name"]: a["id"] for a in ok(c.get(B + "/finance/accounts", headers=H))["accounts"]}
ok(c.post(B + "/finance/transfers", headers=H, json={"from_account_id": acc["Gaveta"], "to_account_id": acc["Nubank"], "amount": "100.00", "description": "Depósito"}))
ok(c.post(B + "/finance/payables", headers=H, json={"description": "Energia", "amount": "200.00", "due_date": (hoje + timedelta(days=3)).isoformat(), "counts_as_expense": True}))
ok(c.post(B + "/finance/entries", headers=H, json={"kind": "owner_withdrawal", "account_id": acc["Nubank"], "amount": "100.00", "person": "Ana"}))

OUT.write_text(f"Ambiente de teste (SIT local)\nApp:    http://127.0.0.1:8081\nE-mail: {email}\nSenha:  {senha}\n", encoding="utf-8")
print("Ambiente de teste pronto. Acesso gravado em", OUT)
