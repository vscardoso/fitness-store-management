"""Envio condicional: reserva de estoque e devolução tudo-ou-nada (backend de teste 8766)."""
import httpx, secrets, datetime, sqlite3

B = "http://127.0.0.1:8766/api/v1"
c = httpx.Client(timeout=60)
T = str(datetime.date.today())
pw = "Qa!" + secrets.token_hex(6)
em = f"qa.cs{secrets.token_hex(2)}@example.com"
c.post(B + "/auth/signup", json={"full_name": "QA Condicional", "email": em, "password": pw, "store_name": "Loja Condicional", "plan": "pro"})
H = {"Authorization": "Bearer " + c.post(B + "/auth/login", json={"email": em, "password": pw}).json()["access_token"]}
cat = c.post(B + "/categories/", json={"name": "Moda"}, headers=H).json()
falhas = []


def check(label, cond, extra=""):
    print(f"[{'OK ' if cond else 'ERR'}] {label}" + (f"  -> {extra}" if extra else ""))
    if not cond:
        falhas.append(label)


def lista(path):
    r = c.get(B + path, headers=H).json()
    return r if isinstance(r, list) else r.get("items", r.get("products", r.get("sales", r.get("shipments", []))))


def remaining(pid):
    con = sqlite3.connect("qa_cond.db")
    return con.execute("select coalesce(sum(quantity_remaining),0) from entry_items where product_id=?", (pid,)).fetchone()[0]


r = c.post(B + "/stock-entries/with-new-product", headers=H, json={
    "product_name": "Vestido", "product_sku": "VES-1", "product_category_id": cat["id"], "product_cost_price": 20,
    "product_price": 80, "quantity": 10, "entry_code": "cs-001", "entry_date": T, "entry_type": "local", "supplier_name": "Forn"})
assert r.status_code == 201, r.text
pid = next(p["id"] for p in lista("/products/?limit=100") if p["name"] == "Vestido")
vid = c.get(f"{B}/product-variants/product/{pid}", headers=H).json()[0]["id"]
cust = c.post(B + "/customers/", headers=H, json={"full_name": "Cliente Teste", "email": f"cli{secrets.token_hex(2)}@example.com", "phone": "34999990000"})
assert cust.status_code in (200, 201), cust.text
cid = cust.json()["id"]

# 1) envio com mais que o estoque: recusado e nada gravado
r = c.post(B + "/conditional-shipments/", headers=H, json={"customer_id": cid, "shipping_address": "Rua Teste 1, Uberlandia", "items": [{"product_id": pid, "variant_id": vid, "quantity_sent": 99, "unit_price": 80}]})
check("envio acima do estoque e recusado", r.status_code >= 400, str(r.status_code))
check("nenhum envio gravado", len(lista("/conditional-shipments/")) == 0)
check("estoque intacto (10)", remaining(pid) == 10, str(remaining(pid)))

# 2) envio valido reserva 4
r = c.post(B + "/conditional-shipments/", headers=H, json={"customer_id": cid, "shipping_address": "Rua Teste 1, Uberlandia", "items": [{"product_id": pid, "variant_id": vid, "quantity_sent": 4, "unit_price": 80}]})
check("envio de 4 criado", r.status_code in (200, 201), str(r.status_code) + r.text[:100])
sid = r.json()["id"]
item_id = r.json()["items"][0]["id"]
check("4 un reservadas (restam 6)", remaining(pid) == 6, str(remaining(pid)))
r = c.put(f"{B}/conditional-shipments/{sid}/mark-as-sent", headers=H, json={})
check("marcado como enviado", r.status_code in (200, 201), str(r.status_code))

# 3) devolucao invalida (excede o enviado): nada muda
con = sqlite3.connect("qa_cond.db")
n_vendas = con.execute("select count(*) from sales").fetchone()[0]
r = c.put(f"{B}/conditional-shipments/{sid}/process-return", headers=H, json={"items": [{"id": item_id, "quantity_kept": 3, "quantity_returned": 3, "status": "KEPT"}], "create_sale": True})
check("devolucao que excede o enviado e recusada", r.status_code >= 400, str(r.status_code))
con = sqlite3.connect("qa_cond.db")
st = con.execute("select status from conditional_shipments where id=?", (sid,)).fetchone()[0]
check("envio continua SENT", st == "SENT", st)
check("nenhuma venda criada", con.execute("select count(*) from sales").fetchone()[0] == n_vendas)
check("estoque continua 6", remaining(pid) == 6, str(remaining(pid)))

# 4) devolucao valida: 1 comprado, 3 devolvidos => venda + estoque volta (6+3=9)
r = c.put(f"{B}/conditional-shipments/{sid}/process-return", headers=H, json={"items": [{"id": item_id, "quantity_kept": 1, "quantity_returned": 3, "status": "KEPT"}], "create_sale": True})
check("devolucao valida processada", r.status_code in (200, 201), str(r.status_code) + r.text[:120])
con = sqlite3.connect("qa_cond.db")
st = con.execute("select status from conditional_shipments where id=?", (sid,)).fetchone()[0]
check("status final de venda parcial", "PARTIAL" in st, st)
check("1 venda criada", con.execute("select count(*) from sales").fetchone()[0] == n_vendas + 1)
check("estoque voltou para 9", remaining(pid) == 9, str(remaining(pid)))

print("\nRESULTADO:", "TUDO OK" if not falhas else f"{len(falhas)} FALHA(S): {falhas}")
