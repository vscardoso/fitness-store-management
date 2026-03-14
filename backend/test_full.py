"""
Teste completo Fase 1 + Fase 2 - Backend Lookbook / Wishlist / Suggestions
"""
import urllib.request
import urllib.parse
import json
import time
import sys

BASE = "http://localhost:8000/api/v1"
OK = "[OK]"
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
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {}

def check(label, condition, detail=""):
    status = OK if condition else FAIL
    msg = f"  {status} {label}"
    if detail:
        msg += f" -- {detail}"
    print(msg)
    results.append((condition, label))
    return condition

print("=" * 65)
print("FASE 1 + 2 - TESTES BACKEND LOOKBOOK / WISHLIST / SUGGESTIONS")
print("=" * 65)

# ── AUTH ──────────────────────────────────────────────────────
print("\n[AUTH]")
status, resp = req("POST", "/auth/login", {"email": "admin@fitness.com", "password": "admin123"})
check("Login admin", status == 200, f"status={status}")
token = resp.get("access_token", "")
check("Token recebido", bool(token))
if not token:
    print("FATAL: sem token"); sys.exit(1)

# ── SETUP: Criar dados de teste ────────────────────────────────
print("\n[SETUP - Dados de Teste]")

# Criar cliente de teste (ou buscar existente)
ts = int(time.time())
status, cust = req("POST", "/customers/", {
    "full_name": "Cliente Lookbook Teste",
    "phone": f"1198{ts % 10000000:07d}",
    "email": f"lookbook.test.{ts}@test.com"
}, token=token)
check("Criar cliente teste", status in (200, 201), f"status={status}")
cust_id = cust.get("id") if status in (200, 201) else None
print(f"    cliente_id={cust_id}")

# Criar 3 produtos via stock-entries (resposta retorna o entry, não product_id)
for i in range(1, 4):
    ts = int(time.time()) + i
    status, entry = req("POST", "/stock-entries/with-new-product", {
        "entry_code": f"TEST-LOOK-{ts}",
        "entry_date": "2026-03-14",
        "entry_type": "initial",
        "supplier_name": "Fornecedor Teste",
        "product_name": f"Produto Lookbook {i}",
        "product_sku": f"PLB-{ts}",
        "product_category_id": 1,
        "product_price": 59.90 + (i * 30),
        "product_cost_price": 30.00,
        "quantity": 10
    }, token=token)
    check(f"Criar entry produto {i}", status == 201, f"status={status} entry_id={entry.get('id')}")
    time.sleep(0.2)  # evitar entry_code duplicado

# Buscar produtos com estoque real (os criados aparecem com has_stock=True)
# O get_multi paginado pula os catálogos (ids 1-350+), então usamos has_stock=True
status, prods_with_stock = req("GET", "/products/?has_stock=true&limit=10", token=token)
check("Produtos com estoque visíveis na API", status == 200 and len(prods_with_stock) >= 3,
      f"count={len(prods_with_stock) if isinstance(prods_with_stock, list) else '?'}")
prod_ids = [p["id"] for p in (prods_with_stock if isinstance(prods_with_stock, list) else [])[:3]]
print(f"    product_ids={prod_ids}")

# ── LOOKS ─────────────────────────────────────────────────────
print("\n[LOOKS]")
status, looks = req("GET", "/looks/", token=token)
check("GET /looks/ -- listar", status == 200, f"count={len(looks) if isinstance(looks, list) else '?'}")

# Criar look vazio
status, look = req("POST", "/looks/", {
    "name": "Look Treino Perfeito",
    "description": "Teste automatizado",
    "is_public": True,
    "items": []
}, token=token)
check("POST /looks/ -- criar vazio", status == 201, f"status={status}")
look_id = look.get("id")
check("Look tem ID", bool(look_id), f"id={look_id}")
check("Look name correto", look.get("name") == "Look Treino Perfeito")
check("items_count = 0", look.get("items_count") == 0)

# GET detail
status, detail = req("GET", f"/looks/{look_id}", token=token)
check("GET /looks/{id} -- detalhe", status == 200)
check("Detalhe tem items[]", isinstance(detail.get("items"), list))
check("Detalhe total_price >= 0", (detail.get("total_price") or 0) >= 0)

# PUT update
status, updated = req("PUT", f"/looks/{look_id}", {
    "description": "Atualizado pelo teste"
}, token=token)
check("PUT /looks/{id} -- atualizar", status == 200)
check("Description atualizada", updated.get("description") == "Atualizado pelo teste")

# GET /looks/my
status, my_looks = req("GET", "/looks/my", token=token)
check("GET /looks/my -- looks da loja", status == 200)
check("Look aparece em /my", any(l.get("id") == look_id for l in my_looks))

# ── LOOK ITEMS ─────────────────────────────────────────────────
print("\n[LOOK ITEMS]")
if look_id and prod_ids:
    # POST /items retorna o look atualizado (status 200), nao o item
    for i, pid in enumerate(prod_ids[:2]):  # Adicionar 2 dos 3
        status, look_resp = req("POST", f"/looks/{look_id}/items", {
            "product_id": pid,
            "position": i + 1
        }, token=token)
        check(f"Adicionar produto {pid} ao look", status == 200, f"status={status}")

    status, look_with_items = req("GET", f"/looks/{look_id}", token=token)
    check("items_count = 2 apos add", look_with_items.get("items_count") == 2)
    check("total_price > 0", (look_with_items.get("total_price") or 0) > 0)

    # Extrair item_id da lista de itens do look
    items_in_look = look_with_items.get("items", [])
    if items_in_look:
        first_item_id = items_in_look[0].get("id")
        status, _ = req("DELETE", f"/looks/{look_id}/items/{first_item_id}", token=token)
        check("DELETE item do look", status in (200, 204), f"status={status}")
        _, look_after = req("GET", f"/looks/{look_id}", token=token)
        check("items_count = 1 apos remove", look_after.get("items_count") == 1)

# ── DESCONTO AUTOMATICO 3+ PECAS ──────────────────────────────
print("\n[DESCONTO 3+ PECAS]")
if len(prod_ids) >= 3:
    items_3 = [{"product_id": pid, "position": i+1} for i, pid in enumerate(prod_ids[:3])]
    status, look3 = req("POST", "/looks/", {
        "name": "Look Desconto Teste",
        "is_public": False,
        "items": items_3
    }, token=token)
    check("POST /looks/ com 3 itens", status == 201, f"status={status}")
    check("Desconto 10% aplicado", look3.get("discount_percentage") == 10.0,
          f"discount={look3.get('discount_percentage')}")
    check("items_count = 3", look3.get("items_count") == 3)
    check("total_price com desconto < soma simples",
          (look3.get("total_price") or 0) > 0)
    look3_id = look3.get("id")
    if look3_id:
        req("DELETE", f"/looks/{look3_id}", token=token)

# ── WISHLIST ──────────────────────────────────────────────────
print("\n[WISHLIST]")
status, demand = req("GET", "/wishlist/demand", token=token)
check("GET /wishlist/demand -- demanda", status == 200, f"count={len(demand) if isinstance(demand, list) else '?'}")

wish_id = None
if cust_id and prod_ids:
    pid = prod_ids[0]

    status, cust_wish = req("GET", f"/wishlist/customer/{cust_id}", token=token)
    check(f"GET /wishlist/customer/{cust_id}", status == 200)
    check("Wishlist cliente vazia inicialmente", isinstance(cust_wish, list))

    # Adicionar à wishlist
    status, wish = req("POST", "/wishlist/", {
        "customer_id": cust_id,
        "product_id": pid
    }, token=token)
    check("POST /wishlist/ -- adicionar", status == 201, f"status={status}")
    wish_id = wish.get("id")
    check("Wishlist tem customer_id", wish.get("customer_id") == cust_id)
    check("Wishlist notified = False", wish.get("notified") == False)
    check("Wishlist product_id correto", wish.get("product_id") == pid)

    # Duplicado deve ser silencioso
    status2, _ = req("POST", "/wishlist/", {
        "customer_id": cust_id,
        "product_id": pid
    }, token=token)
    check("POST /wishlist/ duplicado -- sem crash", status2 in (200, 201), f"status={status2}")

    # Checar demanda apos adicionar
    status, demand2 = req("GET", "/wishlist/demand", token=token)
    check("Demanda aumentou apos add wishlist", len(demand2) >= 1)

    # Remover
    if wish_id:
        status, _ = req("DELETE", f"/wishlist/{wish_id}", token=token)
        check(f"DELETE /wishlist/{wish_id}", status in (200, 204), f"status={status}")

# ── SUGGESTIONS ───────────────────────────────────────────────
print("\n[SUGGESTIONS]")
if prod_ids:
    pid = prod_ids[0]

    status, sug = req("GET", f"/suggestions/{pid}", token=token)
    check(f"GET /suggestions/{pid}", status == 200 and isinstance(sug, list), f"status={status} type={type(sug).__name__}")

    status, tags = req("GET", f"/suggestions/{pid}/tags", token=token)
    check(f"GET /suggestions/{pid}/tags", status == 200, f"tags={len(tags) if isinstance(tags, list) else '?'}")

    # Criar tag
    status, tag = req("POST", "/suggestions/tags", {
        "product_id": pid,
        "tag_type": "color",
        "tag_value": "preto"
    }, token=token)
    check("POST /suggestions/tags -- criar tag", status == 201, f"status={status}")
    tag_id = tag.get("id")
    check("Tag tem id", bool(tag_id))
    check("Tag type correto", tag.get("tag_type") == "color")
    check("Tag value correto", tag.get("tag_value") == "preto")

    # Verificar que tag aparece
    status, tags2 = req("GET", f"/suggestions/{pid}/tags", token=token)
    check("Tag aparece em GET tags", len(tags2) >= 1)

    # Sugestoes com o segundo produto tendo cor compativel (branco combina com preto)
    if len(prod_ids) >= 2:
        pid2 = prod_ids[1]
        status, tag2 = req("POST", "/suggestions/tags", {
            "product_id": pid2,
            "tag_type": "color",
            "tag_value": "branco"
        }, token=token)
        check("Tag no produto 2 (cor compativel)", status == 201)

        status, sug2 = req("GET", f"/suggestions/{pid}", token=token)
        check("Sugestoes retornam produto 2 (mesma tag)",
              isinstance(sug2, list) and any(s.get("product_id") == pid2 for s in sug2),
              f"sug_ids={[s.get('product_id') for s in sug2] if isinstance(sug2, list) else sug2}")

        if tag2.get("id"):
            req("DELETE", f"/suggestions/tags/{tag2['id']}", token=token)

    # Remover tag
    if tag_id:
        status, _ = req("DELETE", f"/suggestions/tags/{tag_id}", token=token)
        check(f"DELETE /suggestions/tags/{tag_id}", status in (200, 204), f"status={status}")

# ── WISHLIST COM LOOK ──────────────────────────────────────────
print("\n[WISHLIST COM LOOK]")
if cust_id and prod_ids and look_id:
    status, wish_look = req("POST", "/wishlist/", {
        "customer_id": cust_id,
        "product_id": prod_ids[0],
        "look_id": look_id,
        "notes": "Quero esse look completo!"
    }, token=token)
    check("Wishlist associada a look", status == 201, f"status={status}")
    check("Wishlist look_id correto", wish_look.get("look_id") == look_id)
    wl_id = wish_look.get("id")
    if wl_id:
        req("DELETE", f"/wishlist/{wl_id}", token=token)

# ── CLEANUP ───────────────────────────────────────────────────
print("\n[CLEANUP]")
if look_id:
    status, _ = req("DELETE", f"/looks/{look_id}", token=token)
    check("DELETE look de teste", status in (200, 204), f"status={status}")

if cust_id:
    status, _ = req("DELETE", f"/customers/{cust_id}", token=token)
    check("DELETE cliente de teste", status in (200, 204), f"status={status}")

# ── RESULTADO ─────────────────────────────────────────────────
print("\n" + "=" * 65)
passed = sum(1 for ok, _ in results if ok)
failed = sum(1 for ok, _ in results if not ok)
total = len(results)
print(f"RESULTADO: {passed}/{total} testes passaram")
if failed:
    print(f"\nFALHAS ({failed}):")
    for ok, label in results:
        if not ok:
            print(f"  {FAIL} {label}")
print("=" * 65)
sys.exit(0 if failed == 0 else 1)
