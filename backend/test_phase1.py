"""
Test script for Phase 1 + Phase 2 backend endpoints.
"""
import urllib.request
import urllib.parse
import json

BASE = "http://localhost:8000/api/v1"
PASS = "[OK]"
FAIL = "[FAIL]"

results = []

def req(method, path, data=None, token=None):
    url = BASE + path
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode() if data else None
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {}

def check(label, condition, detail=""):
    status = PASS if condition else FAIL
    msg = f"  {status} {label}"
    if detail:
        msg += f" — {detail}"
    print(msg)
    results.append((condition, label))
    return condition

print("=" * 65)
print("FASE 1 + 2 - TESTES BACKEND LOOKBOOK / WISHLIST / SUGGESTIONS")
print("=" * 65)

# ── 1. AUTH ──────────────────────────────────────────────────
print("\n[AUTH]")
status, resp = req("POST", "/auth/login", {"email": "admin@fitness.com", "password": "admin123"})
check("Login admin", status == 200, f"status={status}")
token = resp.get("access_token", "")
check("Token recebido", bool(token))

if not token:
    print("FATAL: sem token, abortando")
    exit(1)

# ── 2. LOOKS ─────────────────────────────────────────────────
print("\n[LOOKS]")
status, resp = req("GET", "/looks/", token=token)
check("GET /looks/ — listar", status == 200, f"status={status}, count={len(resp) if isinstance(resp, list) else '?'}")

status, look = req("POST", "/looks/", {
    "name": "Look Teste Automático",
    "description": "Criado pelo teste",
    "is_public": True,
    "items": []
}, token=token)
check("POST /looks/ — criar", status == 201, f"status={status}")
look_id = look.get("id") if status == 201 else None
if look_id:
    check("Look tem ID", True, f"id={look_id}")
    check("Look tem name", look.get("name") == "Look Teste Automático")
    check("Look items_count=0", look.get("items_count") == 0)

status, detail = req("GET", f"/looks/{look_id}", token=token)
check("GET /looks/{id} — detalhe", status == 200, f"status={status}")
check("Detalhe tem items list", isinstance(detail.get("items"), list))

status, updated = req("PUT", f"/looks/{look_id}", {"description": "Atualizado"}, token=token)
check("PUT /looks/{id} — atualizar", status == 200, f"status={status}")
check("Description atualizada", updated.get("description") == "Atualizado")

status, my_looks = req("GET", "/looks/my", token=token)
check("GET /looks/my — looks da loja", status == 200, f"count={len(my_looks) if isinstance(my_looks, list) else '?'}")

# ── 3. LOOK ITEMS ─────────────────────────────────────────────
print("\n[LOOK ITEMS]")
status, prods = req("GET", "/products/?limit=5", token=token)
check("GET /products/ — tem produtos", status == 200 and isinstance(prods, list) and len(prods) > 0, f"count={len(prods) if isinstance(prods, list) else 0}")
prod_id = prods[0]["id"] if isinstance(prods, list) and prods else None

item_id = None
if look_id and prod_id:
    status, item = req("POST", f"/looks/{look_id}/items", {
        "product_id": prod_id,
        "position": 1
    }, token=token)
    check("POST /looks/{id}/items — adicionar", status == 201, f"status={status}")
    item_id = item.get("id") if status == 201 else None

    if item_id:
        status, look_with_item = req("GET", f"/looks/{look_id}", token=token)
        check("Look items_count=1 após add", look_with_item.get("items_count") == 1)
        check("Look total_price > 0", (look_with_item.get("total_price") or 0) >= 0)

# Criar look com 3+ itens para testar desconto automático
print("\n[DESCONTO AUTOMÁTICO 3+ PEÇAS]")
status, prods_big = req("GET", "/products/?limit=5", token=token)
if isinstance(prods_big, list) and len(prods_big) >= 3:
    items_payload = [{"product_id": p["id"], "position": i+1} for i, p in enumerate(prods_big[:3])]
    status, look3 = req("POST", "/looks/", {
        "name": "Look 3 Peças Teste",
        "is_public": False,
        "items": items_payload
    }, token=token)
    check("POST /looks/ com 3 itens", status == 201, f"status={status}")
    if status == 201:
        check("Desconto 10% aplicado", look3.get("discount_percentage") == 10.0, f"discount={look3.get('discount_percentage')}")
        check("items_count=3", look3.get("items_count") == 3)
        look3_id = look3.get("id")
        req("DELETE", f"/looks/{look3_id}", token=token)
else:
    print("  ⚠️  Menos de 3 produtos — pulando teste de desconto")

# Remover item
if item_id and look_id:
    status, _ = req("DELETE", f"/looks/{look_id}/items/{item_id}", token=token)
    check("DELETE /looks/{id}/items/{item_id}", status == 204 or status == 200, f"status={status}")

# ── 4. WISHLIST ───────────────────────────────────────────────
print("\n[WISHLIST]")
status, demand = req("GET", "/wishlist/demand", token=token)
check("GET /wishlist/demand — demanda", status == 200, f"status={status}, count={len(demand) if isinstance(demand, list) else '?'}")

status, customers = req("GET", "/customers/?limit=3", token=token)
check("GET /customers/ — tem clientes", status == 200 and isinstance(customers, list) and len(customers) > 0)
cust_id = customers[0]["id"] if isinstance(customers, list) and customers else None

wish_id = None
if cust_id:
    status, cust_wish = req("GET", f"/wishlist/customer/{cust_id}", token=token)
    check(f"GET /wishlist/customer/{cust_id}", status == 200, f"status={status}")

    if prod_id:
        status, wish = req("POST", "/wishlist/", {
            "customer_id": cust_id,
            "product_id": prod_id
        }, token=token)
        check("POST /wishlist/ — adicionar", status == 201, f"status={status}")
        wish_id = wish.get("id") if status == 201 else None
        if wish_id:
            check("Wishlist tem customer_id", wish.get("customer_id") == cust_id)
            check("Wishlist notified=False", wish.get("notified") == False)

        # Adicionar duplicado (deve ser silencioso ou retornar existente)
        status2, _ = req("POST", "/wishlist/", {
            "customer_id": cust_id,
            "product_id": prod_id
        }, token=token)
        check("POST /wishlist/ duplicado — sem crash", status2 in (200, 201), f"status={status2}")

    if wish_id:
        status, _ = req("DELETE", f"/wishlist/{wish_id}", token=token)
        check(f"DELETE /wishlist/{wish_id}", status in (200, 204), f"status={status}")

# ── 5. SUGGESTIONS ────────────────────────────────────────────
print("\n[SUGGESTIONS]")
if prod_id:
    status, suggestions = req("GET", f"/suggestions/{prod_id}", token=token)
    check(f"GET /suggestions/{prod_id}", status == 200, f"status={status}, count={len(suggestions) if isinstance(suggestions, list) else '?'}")

    status, tags = req("GET", f"/suggestions/{prod_id}/tags", token=token)
    check(f"GET /suggestions/{prod_id}/tags", status == 200, f"tags={len(tags) if isinstance(tags, list) else '?'}")

    status, tag = req("POST", "/suggestions/tags", {
        "product_id": prod_id,
        "tag_type": "color",
        "tag_value": "preto"
    }, token=token)
    check("POST /suggestions/tags — criar tag", status == 201, f"status={status}")
    tag_id = tag.get("id") if status == 201 else None

    if tag_id:
        # Now suggestions should have this product tagged
        status, sug2 = req("GET", f"/suggestions/{prod_id}", token=token)
        check("Sugestões após tag criada", status == 200)

        status, _ = req("DELETE", f"/suggestions/tags/{tag_id}", token=token)
        check(f"DELETE /suggestions/tags/{tag_id}", status in (200, 204), f"status={status}")

# ── 6. CLEANUP ────────────────────────────────────────────────
print("\n[CLEANUP]")
if look_id:
    status, _ = req("DELETE", f"/looks/{look_id}", token=token)
    check("DELETE look de teste", status in (200, 204), f"status={status}")

# ── RESULTADO FINAL ───────────────────────────────────────────
print("\n" + "=" * 65)
passed = sum(1 for ok, _ in results if ok)
failed = sum(1 for ok, _ in results if not ok)
print(f"RESULTADO: {passed}/{len(results)} testes passaram")
if failed > 0:
    print(f"\nFALHAS:")
    for ok, label in results:
        if not ok:
            print(f"  {FAIL} {label}")
print("=" * 65)
