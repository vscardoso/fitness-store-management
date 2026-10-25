"""Alertas de estoque (caixa de notificacoes): cria, nao duplica, troca baixo por zerado, marca lido e some ao repor.
Uso: DATABASE_URL=sqlite+aiosqlite:///./qa_alert.db uvicorn app.main:app --port 8766; rodar na pasta backend."""
import httpx, secrets, datetime, sqlite3

B = "http://127.0.0.1:8766/api/v1"
DB = "qa_alert.db"
c = httpx.Client(timeout=60)
T = str(datetime.date.today())
pw = "Qa!" + secrets.token_hex(6)
em = f"qa.al{secrets.token_hex(2)}@example.com"
c.post(B + "/auth/signup", json={"full_name": "QA Alertas", "email": em, "password": pw, "store_name": "Loja Alertas", "plan": "pro", "accept_terms": True, "terms_version": c.get(B + "/legal/current").json()["version"]})
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


def inbox():
    r = c.get(B + "/notifications/inbox", headers=H)
    assert r.status_code == 200, r.text
    return r.json()


def unread():
    r = c.get(B + "/notifications/inbox/unread-count", headers=H)
    assert r.status_code == 200, r.text
    return r.json()["count"]


def vende(pid, vid, qtd, preco):
    r = c.post(B + "/sales/", headers=H, json={"payment_method": "cash", "items": [{"product_id": pid, "variant_id": vid, "quantity": qtd, "unit_price": preco}],
                                                "payments": [{"amount": qtd * preco, "payment_method": "cash"}]})
    assert r.status_code == 201, r.text
    return r.json()


r = c.post(B + "/stock-entries/with-new-product", headers=H, json={
    "product_name": "Legging Alerta", "product_sku": "AL-1", "product_category_id": cat["id"], "product_cost_price": 20,
    "product_price": 80, "quantity": 10, "entry_code": "al-001", "entry_date": T, "entry_type": "local", "supplier_name": "Forn"})
assert r.status_code == 201, r.text
pid = next(p["id"] for p in lista("/products/?limit=100") if p["name"] == "Legging Alerta")
vid = c.get(f"{B}/product-variants/product/{pid}", headers=H).json()[0]["id"]

# 1) estoque 10 sem minimo configurado: nada a avisar
check("sem problema de estoque: caixa vazia", inbox() == [] and unread() == 0, str(unread()))

# 2) minimo 5, vende 6 => resta 4 => alerta de estoque baixo
con = sqlite3.connect(DB)
con.execute("update inventory set min_stock=5 where product_id=?", (pid,))
con.commit()
con.close()
s1 = vende(pid, vid, 6, 80)
itens = inbox()
check("1 alerta de estoque baixo", len(itens) == 1 and itens[0]["kind"] == "low_stock", str([i["kind"] for i in itens]))
check("alerta cita o produto e a quantidade", "Legging Alerta" in itens[0]["title"] and "4 un" in itens[0]["body"], itens[0]["body"] if itens else "")
check("alerta aponta para o produto", itens[0]["product_id"] == pid)
check("1 nao lido", unread() == 1, str(unread()))

# 3) consultar de novo nao duplica
inbox(); inbox()
check("consultas repetidas nao duplicam", len(inbox()) == 1)

# 4) vende o resto => zerado troca o alerta de baixo por 'sem estoque'
vende(pid, vid, 4, 80)
itens = inbox()
check("alerta virou 'sem estoque' (sem sobrar o de estoque baixo)", len(itens) == 1 and itens[0]["kind"] == "out_of_stock", str([i["kind"] for i in itens]))

# 5) marcar como lido
nid = itens[0]["id"]
r = c.post(f"{B}/notifications/inbox/{nid}/read", headers=H)
check("marcar como lido", r.status_code == 200 and r.json()["is_read"] is True, str(r.status_code))
check("contador zerou", unread() == 0, str(unread()))
check("lido continua na lista enquanto o problema existe", len(inbox()) == 1 and inbox()[0]["is_read"] is True)
r = c.post(f"{B}/notifications/inbox/999999/read", headers=H)
check("id inexistente da 404", r.status_code == 404, str(r.status_code))

# 6) cancelar a venda devolve o estoque => alerta some
c.post(f"{B}/sales/{s1['id']}/cancel", headers=H, params={"reason": "teste"})
itens = inbox()
check("estoque recuperou (6 un > minimo 5): alerta sumiu", itens == [], str([i["kind"] for i in itens]))

# 7) cai de novo => alerta novo e nao lido (volta a avisar)
vende(pid, vid, 2, 80)
check("nova queda gera novo alerta nao lido", unread() == 1 and len(inbox()) == 1, str(unread()))
r = c.post(B + "/notifications/inbox/read-all", headers=H)
check("marcar todas como lidas", r.status_code == 200 and unread() == 0, str(r.status_code))

# 8) isolamento entre lojas
em2 = f"qa.al{secrets.token_hex(2)}@example.com"
c.post(B + "/auth/signup", json={"full_name": "Outra Loja", "email": em2, "password": pw, "store_name": "Outra", "plan": "pro", "accept_terms": True, "terms_version": c.get(B + "/legal/current").json()["version"]})
H2 = {"Authorization": "Bearer " + c.post(B + "/auth/login", json={"email": em2, "password": pw}).json()["access_token"]}
check("outra loja nao ve os alertas desta", c.get(B + "/notifications/inbox", headers=H2).json() == [])

print("\nRESULTADO:", "TUDO OK" if not falhas else f"{len(falhas)} FALHA(S): {falhas}")
