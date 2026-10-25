"""Devolução de venda, cancelamento e exclusão de entrada: tudo-ou-nada e estoque coerente.
Uso: DATABASE_URL=sqlite+aiosqlite:///./qa_dev.db uvicorn app.main:app --port 8766; rodar na pasta backend."""
import httpx, secrets, datetime, sqlite3

B = "http://127.0.0.1:8766/api/v1"
DB = "qa_dev.db"
c = httpx.Client(timeout=60)
T = str(datetime.date.today())
pw = "Qa!" + secrets.token_hex(6)
em = f"qa.dv{secrets.token_hex(2)}@example.com"
c.post(B + "/auth/signup", json={"full_name": "QA Devolucao", "email": em, "password": pw, "store_name": "Loja Devolucao", "plan": "pro", "accept_terms": True, "terms_version": c.get(B + "/legal/current").json()["version"]})
H = {"Authorization": "Bearer " + c.post(B + "/auth/login", json={"email": em, "password": pw}).json()["access_token"]}
cat = c.post(B + "/categories/", json={"name": "Moda"}, headers=H).json()
falhas = []


def check(label, cond, extra=""):
    print(f"[{'OK ' if cond else 'ERR'}] {label}" + (f"  -> {extra}" if extra else ""))
    if not cond:
        falhas.append(label)


def q(sql, *a):
    con = sqlite3.connect(DB)
    try:
        return con.execute(sql, a).fetchall()
    finally:
        con.close()


def lista(path):
    r = c.get(B + path, headers=H).json()
    return r if isinstance(r, list) else r.get("items", r.get("products", r.get("sales", [])))


def remaining(pid):
    return q("select coalesce(sum(quantity_remaining),0) from entry_items where product_id=? and is_active=1", pid)[0][0]


def compra(nome, sku, qtd, custo, preco, code):
    r = c.post(B + "/stock-entries/with-new-product", headers=H, json={
        "product_name": nome, "product_sku": sku, "product_category_id": cat["id"], "product_cost_price": custo,
        "product_price": preco, "quantity": qtd, "entry_code": code, "entry_date": T, "entry_type": "local", "supplier_name": "Forn"})
    assert r.status_code == 201, r.text
    pid = next(p["id"] for p in lista("/products/?limit=100") if p["name"] == nome)
    vid = c.get(f"{B}/product-variants/product/{pid}", headers=H).json()[0]["id"]
    return pid, vid, r.json()["id"]


def vende(pid, vid, qtd, preco):
    r = c.post(B + "/sales/", headers=H, json={"payment_method": "cash", "items": [{"product_id": pid, "variant_id": vid, "quantity": qtd, "unit_price": preco}],
                                                "payments": [{"amount": qtd * preco, "payment_method": "cash"}]})
    assert r.status_code == 201, r.text
    return r.json()


p1, v1, e1 = compra("Legging QA", "DV-1", 10, 20, 80, "dv-001")
p2, v2, e2 = compra("Top QA", "DV-2", 6, 15, 50, "dv-002")

# 1) DEVOLUCAO: excede o vendido => recusada, nada muda
s = vende(p1, v1, 4, 80)
item = s["items"][0]["id"]
check("venda de 4 baixou o estoque (restam 6)", remaining(p1) == 6, str(remaining(p1)))
n_ret = q("select count(*) from sale_returns")[0][0]
r = c.post(f"{B}/returns/{s['id']}", headers=H, json={"items": [{"sale_item_id": item, "quantity": 9}], "reason": "teste excesso"})
check("devolução acima do vendido é recusada", r.status_code >= 400, str(r.status_code))
check("nenhuma devolução gravada", q("select count(*) from sale_returns")[0][0] == n_ret)
check("estoque continua 6", remaining(p1) == 6, str(remaining(p1)))
check("venda continua COMPLETED", q("select status from sales where id=?", s["id"])[0][0].lower() == "completed", q("select status from sales where id=?", s["id"])[0][0])

# 2) DEVOLUCAO valida de 1 un: estoque volta, status parcial
r = c.post(f"{B}/returns/{s['id']}", headers=H, json={"items": [{"sale_item_id": item, "quantity": 1}], "reason": "teste devolução"})
check("devolução de 1 un processada", r.status_code in (200, 201), str(r.status_code) + r.text[:100])
check("estoque voltou para 7", remaining(p1) == 7, str(remaining(p1)))
check("venda PARTIALLY_REFUNDED", q("select status from sales where id=?", s["id"])[0][0].lower() == "partially_refunded", q("select status from sales where id=?", s["id"])[0][0])
r = c.post(f"{B}/returns/{s['id']}", headers=H, json={"items": [{"sale_item_id": item, "quantity": 4}], "reason": "teste excesso 2"})
check("segunda devolução que passa do saldo (1+4 > 4) é recusada", r.status_code >= 400, str(r.status_code))
check("estoque continua 7", remaining(p1) == 7, str(remaining(p1)))

# 3) CANCELAR venda: estoque volta, status cancelado; cancelar de novo é recusado sem mexer no estoque
s2 = vende(p2, v2, 2, 50)
check("venda de 2 baixou o estoque (restam 4)", remaining(p2) == 4, str(remaining(p2)))
r = c.post(f"{B}/sales/{s2['id']}/cancel", headers=H, params={"reason": "teste cancelamento"})
check("cancelamento processado", r.status_code in (200, 204), str(r.status_code))
check("estoque voltou para 6", remaining(p2) == 6, str(remaining(p2)))
r = c.post(f"{B}/sales/{s2['id']}/cancel", headers=H, params={"reason": "de novo"})
check("cancelar duas vezes é recusado", r.status_code >= 400, str(r.status_code))
check("estoque continua 6 (não devolveu em dobro)", remaining(p2) == 6, str(remaining(p2)))

# 4) EXCLUIR entrada: com vendas => recusada e nada muda; sem vendas => soft delete e estoque some
r = c.delete(f"{B}/stock-entries/{e1}", headers=H)
check("excluir entrada com vendas é recusado", r.status_code >= 400, str(r.status_code))
check("entrada com vendas continua ativa", q("select is_active from stock_entries where id=?", e1)[0][0] == 1)
check("estoque do produto 1 intacto (7)", remaining(p1) == 7, str(remaining(p1)))
p3, v3, e3 = compra("Short QA", "DV-3", 5, 10, 40, "dv-003")
r = c.delete(f"{B}/stock-entries/{e3}", headers=H)
check("excluir entrada sem vendas funciona", r.status_code in (200, 204), str(r.status_code))
check("entrada marcada inativa", q("select is_active from stock_entries where id=?", e3)[0][0] == 0)
check("estoque da entrada excluída zerou", remaining(p3) == 0, str(remaining(p3)))

print("\nRESULTADO:", "TUDO OK" if not falhas else f"{len(falhas)} FALHA(S): {falhas}")
