"""Cadastros: falha no meio nao pode deixar produto sem variacao / dado pela metade.
Uso: DATABASE_URL=sqlite+aiosqlite:///./qa_cad.db uvicorn app.main:app --port 8766; rodar na pasta backend."""
import httpx, secrets, datetime, sqlite3

B = "http://127.0.0.1:8766/api/v1"
c = httpx.Client(timeout=60)
T = str(datetime.date.today())
pw = "Qa!" + secrets.token_hex(6)
em = f"qa.cd{secrets.token_hex(2)}@example.com"
c.post(B + "/auth/signup", json={"full_name": "QA Cadastros", "email": em, "password": pw, "store_name": "Loja Cadastros", "plan": "pro", "accept_terms": True, "terms_version": c.get(B + "/legal/current").json()["version"]})
H = {"Authorization": "Bearer " + c.post(B + "/auth/login", json={"email": em, "password": pw}).json()["access_token"]}
cat = c.post(B + "/categories/", json={"name": "Moda"}, headers=H).json()
falhas = []


def check(label, cond, extra=""):
    print(f"[{'OK ' if cond else 'ERR'}] {label}" + (f"  -> {extra}" if extra else ""))
    if not cond:
        falhas.append(label)


def q(sql, *a):
    con = sqlite3.connect("qa_cad.db")
    try:
        return con.execute(sql, a).fetchall()
    finally:
        con.close()


# produto base
r = c.post(B + "/stock-entries/with-new-product", headers=H, json={
    "product_name": "Base QA", "product_sku": "CAD-1", "product_category_id": cat["id"], "product_cost_price": 10,
    "product_price": 30, "quantity": 3, "entry_code": "cad-001", "entry_date": T, "entry_type": "local", "supplier_name": "Forn"})
assert r.status_code == 201, r.text

# 1) POST /products com SKU ja existente: recusado e SEM produto orfao (sem variacao)
n_prod = q("select count(*) from products where is_active=1")[0][0]
r = c.post(B + "/products/", headers=H, json={"name": "Duplicado QA", "sku": "CAD-1", "price": 50, "cost_price": 20, "category_id": cat["id"]})
check("produto com SKU repetido e recusado", r.status_code >= 400, str(r.status_code) + " " + r.text[:90])
check("nenhum produto orfao gravado", q("select count(*) from products where is_active=1")[0][0] == n_prod,
      f"{q('select count(*) from products where is_active=1')[0][0]} (antes {n_prod})")
orfaos = q("select count(*) from products p where p.is_active=1 and not exists (select 1 from product_variants v where v.product_id=p.id and v.is_active=1)")[0][0]
check("nenhum produto ativo sem variacao", orfaos == 0, str(orfaos))

# 2) POST /products valido (catalogo) cria produto + variacao + inventario juntos
r = c.post(B + "/products/", headers=H, json={"name": "Catalogo QA", "sku": "CAD-2", "price": 50, "cost_price": 20, "category_id": cat["id"]})
check("produto de catalogo criado", r.status_code in (200, 201), str(r.status_code) + " " + r.text[:90])
pid = r.json().get("id")
check("produto tem 1 variacao ativa", q("select count(*) from product_variants where product_id=? and is_active=1", pid)[0][0] == 1)

# 3) PUT produto com SKU de outro: recusado e dados originais intactos
r = c.put(f"{B}/products/{pid}", headers=H, json={"name": "Nome Novo QA", "sku": "CAD-1"})
nome = q("select name from products where id=?", pid)[0][0]
check("trocar SKU para um ja usado e recusado", r.status_code >= 400, str(r.status_code))
check("nome nao foi alterado pela metade", nome == "Catalogo QA", nome)

# 4) excluir produto com estoque: recusado/ou soft delete coerente
base = q("select id from products where name='Base QA'")[0][0]
r = c.delete(f"{B}/products/{base}", headers=H)
ativo = q("select is_active from products where id=?", base)[0][0]
vars_ativas = q("select count(*) from product_variants where product_id=? and is_active=1", base)[0][0]
check("excluir produto: produto e variacoes ficam no mesmo estado", (ativo == 1 and vars_ativas >= 1) or (ativo == 0 and vars_ativas == 0), f"status={r.status_code} produto_ativo={ativo} variacoes_ativas={vars_ativas}")

# 5) cliente, fornecedor, despesa: duplicado/invalido recusado sem lixo
n_cli = q("select count(*) from customers")[0][0]
em_cli = f"dup{secrets.token_hex(2)}@example.com"
r1 = c.post(B + "/customers/", headers=H, json={"full_name": "Cliente Um", "email": em_cli, "phone": "34999990001"})
r2 = c.post(B + "/customers/", headers=H, json={"full_name": "Cliente Dois", "email": em_cli, "phone": "34999990002"})
check("cliente com e-mail repetido e recusado", r2.status_code >= 400, f"{r1.status_code}/{r2.status_code}")
check("so 1 cliente novo gravado", q("select count(*) from customers")[0][0] == n_cli + 1)
n_sup = q("select count(*) from suppliers")[0][0]
r = c.post(B + "/suppliers", headers=H, json={"name": "Fornecedor Teste QA", "cnpj": "123.456.789-01"})
check("fornecedor com CPF criado", r.status_code in (200, 201), str(r.status_code))
r = c.post(B + "/suppliers", headers=H, json={"name": "   "})
check("fornecedor sem nome e recusado", r.status_code >= 400, str(r.status_code))
check("so 1 fornecedor novo gravado", q("select count(*) from suppliers")[0][0] == n_sup + 1)

print("\nRESULTADO:", "TUDO OK" if not falhas else f"{len(falhas)} FALHA(S): {falhas}")
