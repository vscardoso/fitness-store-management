"""Auditoria de atomicidade (QA manual). Uso: DATABASE_URL=sqlite+aiosqlite:///./qa_aud.db uvicorn app.main:app --port 8766; depois rodar este script na pasta backend. Falha no meio nao pode deixar nada gravado."""
import httpx, secrets, datetime

B = "http://127.0.0.1:8766/api/v1"
c = httpx.Client(timeout=60)
T = str(datetime.date.today())
pw = "Qa!" + secrets.token_hex(6)
em = f"qa.au{secrets.token_hex(2)}@example.com"
c.post(B + "/auth/signup", json={"full_name": "QA Auditoria", "email": em, "password": pw, "store_name": "Loja Auditoria", "plan": "pro", "accept_terms": True, "terms_version": c.get(B + "/legal/current").json()["version"]})
H = {"Authorization": "Bearer " + c.post(B + "/auth/login", json={"email": em, "password": pw}).json()["access_token"]}
cat = c.post(B + "/categories/", json={"name": "Moda"}, headers=H).json()
falhas = []


def check(label, cond, extra=""):
    print(f"[{'OK ' if cond else 'ERR'}] {label}" + (f"  -> {extra}" if extra else ""))
    if not cond:
        falhas.append(label)


def lista(path):
    r = c.get(B + path, headers=H).json()
    return r if isinstance(r, list) else r.get("items", r.get("products", r.get("sales", [])))


def compra(nome, sku, qtd, custo, preco, code):
    r = c.post(B + "/stock-entries/with-new-product", headers=H, json={
        "product_name": nome, "product_sku": sku, "product_category_id": cat["id"], "product_cost_price": custo,
        "product_price": preco, "quantity": qtd, "entry_code": code, "entry_date": T, "entry_type": "local", "supplier_name": "Forn"})
    assert r.status_code == 201, r.text
    pid = next(p["id"] for p in lista("/products/?limit=100") if p["name"] == nome)
    vid = c.get(f"{B}/product-variants/product/{pid}", headers=H).json()[0]["id"]
    return pid, vid


def estoque(pid):
    r = c.get(f"{B}/inventory/product/{pid}", headers=H).json()
    return r.get("quantity") if isinstance(r, dict) else r


a, av = compra("Item A", "AUD-A", 5, 10, 30, "aud-001")
b, bv = compra("Item B", "AUD-B", 1, 10, 30, "aud-002")

# 1) VENDA: item A ok, item B sem estoque suficiente => nada pode ser baixado nem gravado
antes_a, antes_b = estoque(a), estoque(b)
n_vendas = len(lista("/sales/?limit=100"))
items = [{"product_id": a, "variant_id": av, "quantity": 2, "unit_price": 30},
         {"product_id": b, "variant_id": bv, "quantity": 9, "unit_price": 30}]
r = c.post(B + "/sales/", headers=H, json={"payment_method": "cash", "items": items,
                                           "payments": [{"amount": 300, "payment_method": "cash"}]})
check("venda com 2o item sem estoque é recusada", r.status_code >= 400, str(r.status_code))
check("estoque do item A intacto após venda recusada", estoque(a) == antes_a, f"{estoque(a)} (antes {antes_a})")
check("estoque do item B intacto", estoque(b) == antes_b)
check("nenhuma venda gravada", len(lista("/sales/?limit=100")) == n_vendas)

# 2) ENTRADA com itens: 2o item com variação de outro produto => nada gravado
n_ent = len(lista("/stock-entries/?limit=100"))
r = c.post(B + "/stock-entries/", headers=H, json={
    "entry_code": "aud-003", "entry_date": T, "entry_type": "local", "supplier_name": "Forn",
    "items": [{"product_id": a, "variant_id": av, "quantity_received": 3, "unit_cost": 10},
              {"product_id": b, "variant_id": av, "quantity_received": 3, "unit_cost": 10}]})
check("entrada com item inconsistente é recusada", r.status_code >= 400, str(r.status_code))
check("nenhuma entrada gravada", len(lista("/stock-entries/?limit=100")) == n_ent)
check("estoque de A intacto após entrada recusada", estoque(a) == antes_a)

# 3) VINCULAR a entrada existente: variacao respeitada, validada e custo obrigatorio
e0 = lista("/stock-entries/?limit=100")[0]["id"]
r = c.post(B + "/product-variants/with-product", headers=H, json={
    "name": "Multi", "category_id": cat["id"], "base_price": 50,
    "variants": [{"sku": "AUD-M-P", "size": "P", "price": 50, "cost_price": 5}, {"sku": "AUD-M-M", "size": "M", "price": 50, "cost_price": 5}]})
assert r.status_code in (200, 201), r.text
mp = r.json(); mpid = mp["id"]; vP, vM = [v["id"] for v in mp["variants"]][:2]
r = c.post(f"{B}/stock-entries/{e0}/items", headers=H, json={"product_id": mpid, "quantity_received": 2, "unit_cost": 5})
check("produto com 2 variacoes sem variant_id e recusado", r.status_code >= 400, str(r.status_code))
r = c.post(f"{B}/stock-entries/{e0}/items", headers=H, json={"product_id": mpid, "variant_id": av, "quantity_received": 2, "unit_cost": 5})
check("variacao de OUTRO produto e recusada", r.status_code >= 400, str(r.status_code))
r = c.post(f"{B}/stock-entries/{e0}/items", headers=H, json={"product_id": mpid, "variant_id": vM, "quantity_received": 2, "unit_cost": 0})
check("custo zero e recusado", r.status_code >= 400, str(r.status_code))
r = c.post(f"{B}/stock-entries/{e0}/items", headers=H, json={"product_id": mpid, "variant_id": vM, "quantity_received": 4, "unit_cost": 5})
check("variacao M com custo e aceita", r.status_code in (200, 201), str(r.status_code))
import sqlite3
con = sqlite3.connect("qa_aud.db")
rows = dict(con.execute("select variant_id, sum(quantity_remaining) from entry_items where product_id=? group by variant_id", (mpid,)).fetchall())
check("entry_items: 4 un na variacao M e 0 na P", rows.get(vM) == 4 and rows.get(vP) in (None, 0), str(rows))

print("\nRESULTADO:", "TUDO OK" if not falhas else f"{len(falhas)} FALHA(S): {falhas}")
