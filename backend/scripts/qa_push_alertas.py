"""Push dos alertas de estoque: usa um Expo falso local para provar o que sai para o celular.
Uso (na pasta backend):
  EXPO_PUSH_URL=http://127.0.0.1:8777/push DATABASE_URL=sqlite+aiosqlite:///./qa_push.db \
    venv/Scripts/python -m uvicorn app.main:app --port 8766
  venv/Scripts/python scripts/qa_push_alertas.py"""
import httpx, secrets, datetime, sqlite3, json, threading
from http.server import BaseHTTPRequestHandler, HTTPServer

B = "http://127.0.0.1:8766/api/v1"
DB = "qa_push.db"
RECEBIDOS: list[dict] = []
ESTADO = {"falhar": False}


class ExpoFalso(BaseHTTPRequestHandler):
    def do_POST(self):
        corpo = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if ESTADO["falhar"]:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(b"expo fora do ar")
            return
        RECEBIDOS.extend(corpo)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"data": [{"status": "ok"} for _ in corpo]}).encode())

    def log_message(self, *a):
        pass


srv = HTTPServer(("127.0.0.1", 8777), ExpoFalso)
threading.Thread(target=srv.serve_forever, daemon=True).start()

c = httpx.Client(timeout=60)
T = str(datetime.date.today())
pw = "Qa!" + secrets.token_hex(6)
falhas = []


def check(label, cond, extra=""):
    print(f"[{'OK ' if cond else 'ERR'}] {label}" + (f"  -> {extra}" if extra else ""))
    if not cond:
        falhas.append(label)


def loja(nome):
    em = f"qa.pu{secrets.token_hex(2)}@example.com"
    c.post(B + "/auth/signup", json={"full_name": nome, "email": em, "password": pw, "store_name": nome, "plan": "pro", "accept_terms": True, "terms_version": c.get(B + "/legal/current").json()["version"]})
    H = {"Authorization": "Bearer " + c.post(B + "/auth/login", json={"email": em, "password": pw}).json()["access_token"]}
    cat = c.post(B + "/categories/", json={"name": "Moda"}, headers=H).json()
    return H, cat


def produto(H, cat, nome, sku, qtd, minimo):
    r = c.post(B + "/stock-entries/with-new-product", headers=H, json={
        "product_name": nome, "product_sku": sku, "product_category_id": cat["id"], "product_cost_price": 20,
        "product_price": 80, "quantity": qtd, "entry_code": "ent-" + sku.lower(), "entry_date": T, "entry_type": "local", "supplier_name": "Forn"})
    assert r.status_code == 201, r.text
    lst = c.get(B + "/products/?limit=100", headers=H).json()
    lst = lst if isinstance(lst, list) else lst.get("items", lst.get("products", []))
    pid = next(p["id"] for p in lst if p["name"] == nome)
    vid = c.get(f"{B}/product-variants/product/{pid}", headers=H).json()[0]["id"]
    con = sqlite3.connect(DB)
    con.execute("update inventory set min_stock=? where product_id=?", (minimo, pid))
    con.commit()
    con.close()
    return pid, vid


def vende(H, pid, vid, qtd):
    r = c.post(B + "/sales/", headers=H, json={"payment_method": "cash", "items": [{"product_id": pid, "variant_id": vid, "quantity": qtd, "unit_price": 80}],
                                                "payments": [{"amount": qtd * 80, "payment_method": "cash"}]})
    assert r.status_code == 201, r.text


def push_now(H):
    r = c.post(B + "/notifications/inbox/push-now", headers=H)
    assert r.status_code == 200, r.text
    return r.json()


H, cat = loja("Loja Push")
r = c.post(B + "/notifications/token", headers=H, json={"token": "ExponentPushToken[qa-token-1]", "device_type": "android"})
check("aparelho registrado", r.status_code == 201, str(r.status_code))
pid, vid = produto(H, cat, "Legging Push", "PU-1", 10, 5)

# 1) sem problema: nada sai
check("sem alerta: push-now nao envia nada", push_now(H) == {"tenants": 1, "pending": 0, "sent": 0} and RECEBIDOS == [])

# 2) estoque baixo: 1 push com titulo/corpo/rota certos
vende(H, pid, vid, 6)
r = push_now(H)
check("1 alerta pendente, 1 push enviado", r["pending"] == 1 and r["sent"] == 1, str(r))
m = RECEBIDOS[-1] if RECEBIDOS else {}
check("push para o aparelho certo", m.get("to") == "ExponentPushToken[qa-token-1]", str(m.get("to")))
check("titulo e corpo do alerta", m.get("title") == "Estoque baixo: Legging Push" and "4 un" in m.get("body", ""), str(m.get("title")))
check("toque abre a Central", m.get("data", {}).get("route") == "/notifications", str(m.get("data")))

# 3) repetir nao reenvia
push_now(H)
push_now(H)
check("nao reenvia o mesmo alerta", len(RECEBIDOS) == 1, str(len(RECEBIDOS)))

# 4) abrir a Central antes do agendador nao perde o push
vende(H, pid, vid, 4)
c.get(B + "/notifications/inbox", headers=H)  # cria o alerta 'sem estoque' sem enviar push
r = push_now(H)
check("alerta criado ao abrir a Central ainda vira push", r["sent"] == 1 and len(RECEBIDOS) == 2 and RECEBIDOS[-1]["title"] == "Sem estoque: Legging Push", str(r))

# 5) varios de uma vez: um aviso so, agrupado
p2, v2 = produto(H, cat, "Top Push", "PU-2", 10, 5)
p3, v3 = produto(H, cat, "Short Push", "PU-3", 10, 5)
vende(H, p2, v2, 6)
vende(H, p3, v3, 6)
antes = len(RECEBIDOS)
r = push_now(H)
check("2 alertas novos viram 1 push agrupado", r["pending"] == 2 and len(RECEBIDOS) == antes + 1, str(r))
check("push agrupado cita os dois produtos", "2 produtos" in RECEBIDOS[-1]["body"] and "Top Push" in RECEBIDOS[-1]["body"] and "Short Push" in RECEBIDOS[-1]["body"], RECEBIDOS[-1]["body"])

# 6) Expo fora do ar: nao quebra e nao repete para sempre
p4, v4 = produto(H, cat, "Body Push", "PU-4", 10, 5)
vende(H, p4, v4, 6)
ESTADO["falhar"] = True
antes = len(RECEBIDOS)
r = push_now(H)
check("Expo fora do ar: endpoint responde sem erro, 0 enviados", r["pending"] == 1 and r["sent"] == 0, str(r))
ESTADO["falhar"] = False
push_now(H)
check("alerta nao fica reenviando em loop", len(RECEBIDOS) == antes, str(len(RECEBIDOS) - antes))

# 7) loja sem aparelho: marca como tratado e nao envia (nem manda alerta antigo quando um aparelho entrar depois)
H2, cat2 = loja("Loja Sem Aparelho")
q, qv = produto(H2, cat2, "Meia Push", "PU-5", 10, 5)
vende(H2, q, qv, 6)
antes = len(RECEBIDOS)
r = push_now(H2)
check("loja sem aparelho: nada enviado", r["pending"] == 1 and r["sent"] == 0 and len(RECEBIDOS) == antes, str(r))
c.post(B + "/notifications/token", headers=H2, json={"token": "ExponentPushToken[qa-token-2]", "device_type": "ios"})
push_now(H2)
check("aparelho novo nao recebe alerta antigo", len(RECEBIDOS) == antes, str(len(RECEBIDOS) - antes))

# 8) a Central continua mostrando tudo (push nao interfere)
itens = c.get(B + "/notifications/inbox", headers=H).json()
check("Central lista os alertas ativos", len(itens) >= 4, str(len(itens)))

print("\nRESULTADO:", "TUDO OK" if not falhas else f"{len(falhas)} FALHA(S): {falhas}")
srv.shutdown()
