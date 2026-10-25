"""Cancelamento de envio condicional: devolve ao FIFO o que foi reservado, em uma transacao so.
Uso (pasta backend): DATABASE_URL=sqlite+aiosqlite:///./qa_cancel.db uvicorn app.main:app --port 8766; python scripts/qa_cancelamento_condicional.py"""
import datetime
import secrets
import sqlite3

import httpx

B = "http://127.0.0.1:8766/api/v1"
DB = "qa_cancel.db"
c = httpx.Client(timeout=60)
T = str(datetime.date.today())
pw = "Qa!" + secrets.token_hex(6)
em = f"qa.cc{secrets.token_hex(2)}@example.com"
c.post(B + "/auth/signup", json={"full_name": "QA Cancela", "email": em, "password": pw, "store_name": "Loja Cancela", "plan": "pro", "accept_terms": True, "terms_version": c.get(B + "/legal/current").json()["version"]})
H = {"Authorization": "Bearer " + c.post(B + "/auth/login", json={"email": em, "password": pw}).json()["access_token"]}
cat = c.post(B + "/categories/", json={"name": "Moda"}, headers=H).json()
falhas = []


def check(label, cond, extra=""):
    print(f"[{'OK ' if cond else 'ERR'}] {label}" + (f"  -> {extra}" if extra else ""))
    if not cond:
        falhas.append(label)


def lista(path):
    r = c.get(B + path, headers=H).json()
    return r if isinstance(r, list) else r.get("items", r.get("products", r.get("shipments", [])))


def q(sql, *a):
    con = sqlite3.connect(DB)
    try:
        return con.execute(sql, a).fetchone()[0]
    finally:
        con.close()


r = c.post(B + "/stock-entries/with-new-product", headers=H, json={
    "product_name": "Conjunto", "product_sku": "CON-1", "product_category_id": cat["id"], "product_cost_price": 20,
    "product_price": 80, "quantity": 10, "entry_code": "cc-001", "entry_date": T, "entry_type": "local", "supplier_name": "Forn"})
assert r.status_code == 201, r.text
pid = next(p["id"] for p in lista("/products/?limit=100") if p["name"] == "Conjunto")
vid = c.get(f"{B}/product-variants/product/{pid}", headers=H).json()[0]["id"]
cid = c.post(B + "/customers/", headers=H, json={"full_name": "Cliente", "email": f"cli{secrets.token_hex(2)}@example.com", "phone": "34999990000"}).json()["id"]


def restante():
    return q("select coalesce(sum(quantity_remaining),0) from entry_items where product_id=?", pid)


def novo_envio(qtd):
    r = c.post(B + "/conditional-shipments/", headers=H, json={"customer_id": cid, "shipping_address": "Rua Teste 1, Uberlandia", "items": [{"product_id": pid, "variant_id": vid, "quantity_sent": qtd, "unit_price": 80}]})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


check("estoque inicial 10", restante() == 10, str(restante()))

# 1) cancelar envio PENDING devolve a reserva
sid = novo_envio(4)
check("reserva de 4 (restam 6)", restante() == 6, str(restante()))
r = c.delete(f"{B}/conditional-shipments/{sid}", headers=H, params={"reason": "Cliente desistiu"})
check("cancelamento devolve 200", r.status_code == 200, f"{r.status_code} {r.text[:150]}")
check("estoque voltou para 10", restante() == 10, str(restante()))
check("status CANCELLED", q("select status from conditional_shipments where id=?", sid) == "CANCELLED")
check("motivo gravado nas notas", "Cliente desistiu" in (q("select notes from conditional_shipments where id=?", sid) or ""))

# 2) cancelar de novo: recusado e estoque nao duplica
r = c.delete(f"{B}/conditional-shipments/{sid}", headers=H, params={"reason": "Cliente desistiu"})
check("segundo cancelamento recusado", r.status_code >= 400, str(r.status_code))
check("estoque continua 10 (nao devolveu duas vezes)", restante() == 10, str(restante()))

# 3) cancelar envio SENT tambem devolve
sid2 = novo_envio(3)
c.put(f"{B}/conditional-shipments/{sid2}/mark-as-sent", headers=H, json={})
check("reserva de 3 (restam 7)", restante() == 7, str(restante()))
r = c.delete(f"{B}/conditional-shipments/{sid2}", headers=H, params={"reason": "Cancelado pela loja"})
check("cancelamento do SENT devolve 200", r.status_code == 200, f"{r.status_code} {r.text[:150]}")
check("estoque de volta a 10", restante() == 10, str(restante()))

# 4) motivo curto demais: recusado, nada muda
sid3 = novo_envio(2)
r = c.delete(f"{B}/conditional-shipments/{sid3}", headers=H, params={"reason": "no"})
check("motivo curto recusado (422)", r.status_code == 422, str(r.status_code))
check("envio segue ativo e reserva mantida (restam 8)", restante() == 8 and q("select status from conditional_shipments where id=?", sid3) != "CANCELLED", str(restante()))

print("\nTUDO OK" if not falhas else f"\nFALHAS: {falhas}")
raise SystemExit(1 if falhas else 0)
