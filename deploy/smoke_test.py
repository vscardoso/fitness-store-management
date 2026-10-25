"""Teste de ponta a ponta contra o servidor de producao: cadastro, produto com entrada, venda em dinheiro, alerta de estoque.
Cria uma loja de TESTE (nome 'Zz Teste Smoke ...') que deve ser apagada depois.
Uso: python deploy/smoke_test.py [BASE] [HOST]
  BASE padrao: http://204.168.144.151/api/v1   HOST padrao: api.provadorfit.com.br (cabecalho Host, enquanto o DNS nao propaga)"""
import sys, secrets, datetime
import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://204.168.144.151/api/v1"
HOST = sys.argv[2] if len(sys.argv) > 2 else "api.provadorfit.com.br"
c = httpx.Client(timeout=60, headers={"Host": HOST} if HOST else {})
T = str(datetime.date.today())
falhas = []


def check(label, cond, extra=""):
    print(f"[{'OK ' if cond else 'ERR'}] {label}" + (f"  -> {extra}" if extra else ""))
    if not cond:
        falhas.append(label)


r = c.get(BASE.replace("/api/v1", "") + "/health")
check("health", r.status_code == 200 and r.json().get("environment") == "production", r.text[:80])

pw = "Sm!" + secrets.token_hex(8)
em = f"smoke.{secrets.token_hex(3)}@example.com"
r = c.post(BASE + "/auth/signup", json={"full_name": "Smoke Teste", "email": em, "password": pw, "store_name": f"Zz Teste Smoke {secrets.token_hex(2)}", "plan": "pro", "accept_terms": True, "terms_version": c.get(BASE + "/legal/current").json()["version"]})
check("cadastro da loja", r.status_code in (200, 201), f"{r.status_code} {r.text[:120]}")
r = c.post(BASE + "/auth/login", json={"email": em, "password": pw})
check("login", r.status_code == 200 and "access_token" in r.json(), str(r.status_code))
H = {"Authorization": "Bearer " + r.json()["access_token"]}

r = c.get(BASE + "/auth/login", headers=H)  # rota so de POST: prova que o roteamento responde 405 e nao 5xx
check("rota inexistente nao da 5xx", r.status_code < 500, str(r.status_code))

cat = c.post(BASE + "/categories/", json={"name": "Moda"}, headers=H)
check("criar categoria", cat.status_code in (200, 201), str(cat.status_code))
cat = cat.json()

r = c.post(BASE + "/stock-entries/with-new-product", headers=H, json={
    "product_name": "Legging Smoke", "product_sku": "SM-1", "product_category_id": cat["id"], "product_cost_price": 20,
    "product_price": 80, "quantity": 10, "entry_code": "ent-sm-1", "entry_date": T, "entry_type": "local", "supplier_name": "Fornecedor Teste"})
check("produto novo com entrada de 10 un", r.status_code == 201, f"{r.status_code} {r.text[:120]}")

lst = c.get(BASE + "/products/?limit=100", headers=H).json()
lst = lst if isinstance(lst, list) else lst.get("items", lst.get("products", []))
pid = next((p["id"] for p in lst if p["name"] == "Legging Smoke"), None)
check("produto aparece na lista", pid is not None)
vars_ = c.get(f"{BASE}/product-variants/product/{pid}", headers=H).json()
vid = vars_[0]["id"]

inv = c.get(f"{BASE}/inventory/product/{pid}", headers=H).json()
check("estoque = 10", inv.get("quantity") == 10, str(inv.get("quantity")))

r = c.post(BASE + "/sales/", headers=H, json={"payment_method": "cash", "items": [{"product_id": pid, "variant_id": vid, "quantity": 3, "unit_price": 80}],
                                                "payments": [{"amount": 240, "payment_method": "cash"}]})
check("venda em dinheiro de 3 un", r.status_code == 201, f"{r.status_code} {r.text[:120]}")
inv = c.get(f"{BASE}/inventory/product/{pid}", headers=H).json()
check("estoque baixou para 7", inv.get("quantity") == 7, str(inv.get("quantity")))

r = c.get(BASE + "/notifications/inbox/unread-count", headers=H)
check("caixa de alertas responde", r.status_code == 200 and r.json().get("count") == 0, r.text[:80])

r = c.post(BASE + "/auth/login", json={"email": em, "password": "errada"})
check("login com senha errada e recusado", r.status_code in (400, 401), str(r.status_code))

r = c.get(BASE + "/products/", headers={"Authorization": "Bearer invalido"})
check("token invalido e recusado", r.status_code == 401, str(r.status_code))

print("\nLoja de teste criada:", em, "(apagar depois)")
print("RESULTADO:", "TUDO OK" if not falhas else f"{len(falhas)} FALHA(S): {falhas}")
