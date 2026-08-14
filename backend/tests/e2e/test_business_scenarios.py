"""
Teste E2E de cenários de negócio: produtos, clientes, variantes, vendas,
estoque zerado, descontos e reaproveitamento de produtos em entradas.

Roda contra um servidor real (localhost:8000) com o usuário de teste local.
Cada cenário verifica um resultado MENSURÁVEL (não só "não deu erro") e
imprime PASS/FAIL. No final, mostra um resumo com quantos passaram.

Uso:
    cd backend
    venv\\Scripts\\python.exe tests\\e2e\\test_business_scenarios.py

Pré-requisito: backend local rodando em http://localhost:8000 com o
usuário teste@teste.com / Demo@12345 (tenant_id=1).
"""

import requests
import json
import time
from datetime import date, timedelta
from decimal import Decimal

BASE_URL = "http://localhost:8000/api/v1"
EMAIL = "teste@teste.com"
PASSWORD = "Demo@12345"

GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'


def step(n, title):
    print(f"\n{BLUE}{'='*70}{RESET}")
    print(f"{BLUE}CENÁRIO {n}: {title}{RESET}")
    print(f"{BLUE}{'='*70}{RESET}")


def ok(msg):
    print(f"{GREEN}[PASS] {msg}{RESET}")


def fail(msg):
    print(f"{RED}[FAIL] {msg}{RESET}")


def info(msg):
    print(f"{YELLOW}[INFO] {msg}{RESET}")


class BusinessScenarios:
    def __init__(self):
        self.headers = {}
        self.results = []  # (nome, bool)
        self.category_id = None
        self.unique = str(int(time.time()))[-6:]  # sufixo único p/ evitar colisão de SKU/código

    def record(self, name, passed):
        self.results.append((name, passed))
        return passed

    # ── Setup ────────────────────────────────────────────────────────────

    def login(self):
        step(0, "AUTENTICAÇÃO")
        r = requests.post(f"{BASE_URL}/auth/login", json={"email": EMAIL, "password": PASSWORD})
        if r.status_code != 200:
            fail(f"Login falhou: {r.status_code} {r.text}")
            return False
        token = r.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {token}"}
        ok("Login realizado")
        return True

    def get_category(self):
        r = requests.get(f"{BASE_URL}/categories", headers=self.headers)
        cats = r.json()
        if not cats:
            r = requests.post(f"{BASE_URL}/categories", headers=self.headers,
                               json={"name": "Categoria Teste E2E", "slug": f"cat-e2e-{self.unique}"})
            self.category_id = r.json()["id"]
        else:
            self.category_id = cats[0]["id"]
        info(f"category_id = {self.category_id}")

    # ── 1. Produtos ──────────────────────────────────────────────────────

    def test_01_create_product(self):
        step(1, "PRODUTOS — criar produto simples")
        payload = {
            "name": f"Produto E2E {self.unique}",
            "sku": f"E2E-{self.unique}-001",
            "price": 79.90,
            "cost_price": 40.00,
            "category_id": self.category_id,
            "brand": "MarcaTeste",
            "color": "Azul",
            "size": "M",
            "is_catalog": False,
            # Sem initial_stock: regra "FIFO STRICT" do backend bloqueia estoque
            # direto no produto — todo estoque precisa vir de uma StockEntry
            # rastreável (descoberto ao rodar este teste pela 1ª vez).
        }
        r = requests.post(f"{BASE_URL}/products/", headers=self.headers, json=payload)
        passed = r.status_code == 201
        if not passed:
            fail(f"HTTP {r.status_code}: {r.text}")
            self.product_id = None
            return self.record("01_criar_produto", False)

        self.product_id = r.json()["id"]
        ok(f"Produto criado (id={self.product_id}, sku={payload['sku']})")

        # Dá estoque via StockEntry (único jeito válido, pela regra FIFO strict)
        entry = requests.post(f"{BASE_URL}/stock-entries/", headers=self.headers, json={
            "entry_code": f"E2E-INIT-{self.unique}",
            "entry_date": date.today().isoformat(),
            "entry_type": "local",
            "supplier_name": "Fornecedor E2E Inicial",
            "items": [{"product_id": self.product_id, "quantity_received": 10, "unit_cost": 40.0}],
        })
        passed = entry.status_code == 201
        if passed:
            ok(f"Estoque inicial (10 un) criado via StockEntry")
        else:
            fail(f"StockEntry inicial falhou: HTTP {entry.status_code}: {entry.text}")
        return self.record("01_criar_produto", passed)

    # ── 2. Clientes ──────────────────────────────────────────────────────

    def test_02_create_customer(self):
        step(2, "CLIENTES — criar cliente")
        payload = {
            "full_name": f"Cliente Teste E2E {self.unique}",
            "phone": "(34) 99999-0000",
            "email": f"cliente.e2e.{self.unique}@teste.com",
        }
        r = requests.post(f"{BASE_URL}/customers/", headers=self.headers, json=payload)
        passed = r.status_code == 201
        if passed:
            self.customer_id = r.json()["id"]
            ok(f"Cliente criado (id={self.customer_id})")
        else:
            fail(f"HTTP {r.status_code}: {r.text}")
            self.customer_id = None
        return self.record("02_criar_cliente", passed)

    # ── 3. Variantes ─────────────────────────────────────────────────────

    def test_03_create_product_with_variants(self):
        step(3, "VARIANTES — produto com múltiplas variantes (cor/tamanho)")
        payload = {
            "product_name": f"Camiseta E2E {self.unique}",
            "product_category_id": self.category_id,
            "product_brand": "MarcaTeste",
            "base_price": 49.9,
            "entry_date": date.today().isoformat(),
            "entry_type": "local",
            "supplier_name": "Fornecedor E2E",
            "entry_code": f"E2E-VAR-{self.unique}",
            "variants": [
                {"color": "Preto", "size": "P", "sku": f"E2E-{self.unique}-CAM-PRE-P", "quantity": 5, "cost_price": 20.0, "price": 49.9},
                {"color": "Preto", "size": "M", "sku": f"E2E-{self.unique}-CAM-PRE-M", "quantity": 5, "cost_price": 20.0, "price": 49.9},
                {"color": "Branco", "size": "M", "sku": f"E2E-{self.unique}-CAM-BRA-M", "quantity": 3, "cost_price": 20.0, "price": 49.9},
            ],
        }
        r = requests.post(f"{BASE_URL}/stock-entries/with-new-product-variants", headers=self.headers, json=payload)
        if r.status_code not in (200, 201):
            fail(f"HTTP {r.status_code}: {r.text}")
            self.variant_product_id = None
            return self.record("03_produto_com_variantes", False)

        # A resposta é a StockEntry (não o produto) — o product_id real só
        # aparece dentro de entry_items ao buscar a entrada com detalhes
        # (descoberto ao rodar este teste: usar data["id"] direto pega o id
        # da ENTRADA, não do produto, e só "funciona" por coincidência de IDs).
        entry_id = r.json()["id"]
        entry_detail = requests.get(f"{BASE_URL}/stock-entries/{entry_id}", headers=self.headers)
        entry_items = entry_detail.json().get("entry_items", [])
        if not entry_items:
            fail(f"Entrada criada (id={entry_id}) mas sem entry_items para achar o product_id")
            self.variant_product_id = None
            return self.record("03_produto_com_variantes", False)
        self.variant_product_id = entry_items[0]["product_id"]
        # Confirma no detalhe do produto que as 3 variantes existem com estoque correto
        pr = requests.get(f"{BASE_URL}/products/{self.variant_product_id}", headers=self.headers)
        variants = pr.json().get("variants", [])
        expected_total = 5 + 5 + 3
        actual_total = sum(v["current_stock"] for v in variants)
        passed = len(variants) == 3 and actual_total == expected_total
        if passed:
            ok(f"3 variantes criadas, estoque total = {actual_total} (esperado {expected_total})")
        else:
            fail(f"variantes={len(variants)} (esperado 3), estoque total={actual_total} (esperado {expected_total})")
        return self.record("03_produto_com_variantes", passed)

    # ── 4. Vendas ────────────────────────────────────────────────────────

    def test_04_create_simple_sale(self):
        step(4, "VENDAS — venda simples")
        if not getattr(self, "product_id", None):
            fail("Sem product_id (cenário 1 falhou) — pulando")
            return self.record("04_venda_simples", False)

        payload = {
            "customer_id": getattr(self, "customer_id", None),
            "payment_method": "cash",
            "items": [{"product_id": self.product_id, "quantity": 1, "unit_price": 79.90}],
            "payments": [{"amount": 79.90, "payment_method": "cash"}],
        }
        r = requests.post(f"{BASE_URL}/sales/", headers=self.headers, json=payload)
        passed = r.status_code == 201 and float(r.json().get("total_amount", 0)) == 79.90
        if passed:
            self.sale_id = r.json()["id"]
            ok(f"Venda criada (id={self.sale_id}, total=R$79.90)")
        else:
            fail(f"HTTP {r.status_code}: {r.text}")
        return self.record("04_venda_simples", passed)

    # ── 5. Estoque zerado ────────────────────────────────────────────────

    def test_05_zero_stock_blocks_sale(self):
        step(5, "ESTOQUE ZERADO — venda deve ser bloqueada")
        # Cria produto SEM estoque (initial_stock=0, sem entrada)
        payload = {
            "name": f"Produto Sem Estoque E2E {self.unique}",
            "sku": f"E2E-{self.unique}-ZERO",
            "price": 30.0,
            "cost_price": 15.0,
            "category_id": self.category_id,
            "initial_stock": 0,
            "is_catalog": False,
        }
        r = requests.post(f"{BASE_URL}/products/", headers=self.headers, json=payload)
        if r.status_code != 201:
            fail(f"Não conseguiu criar produto de teste: {r.status_code} {r.text}")
            return self.record("05_estoque_zerado_bloqueia", False)
        zero_stock_product_id = r.json()["id"]

        sale_payload = {
            "payment_method": "cash",
            "items": [{"product_id": zero_stock_product_id, "quantity": 1, "unit_price": 30.0}],
            "payments": [{"amount": 30.0, "payment_method": "cash"}],
        }
        r = requests.post(f"{BASE_URL}/sales/", headers=self.headers, json=sale_payload)
        # Esperado: backend rejeita (400/422), NÃO 201
        passed = r.status_code in (400, 422)
        if passed:
            ok(f"Venda de produto sem estoque bloqueada corretamente (HTTP {r.status_code})")
        else:
            fail(f"Venda deveria ter sido bloqueada, mas retornou HTTP {r.status_code}: {r.text}")
        return self.record("05_estoque_zerado_bloqueia", passed)

    # ── 6/7. Desconto vs preço cheio ─────────────────────────────────────

    def test_06_sale_with_discount(self):
        step(6, "VENDA COM DESCONTO")
        if not getattr(self, "product_id", None):
            fail("Sem product_id — pulando")
            return self.record("06_venda_com_desconto", False)

        # Desconto no item E na venda são cumulativos no backend (confirmado ao
        # rodar este teste) — usamos só o desconto de item aqui, que é o caso
        # mais comum (desconto pontual num produto específico da venda).
        discount = 10.0  # R$10 de desconto
        expected_total = 79.90 - discount
        payload = {
            "payment_method": "pix",
            "items": [{"product_id": self.product_id, "quantity": 1, "unit_price": 79.90, "discount_amount": discount}],
            "payments": [{"amount": expected_total, "payment_method": "pix"}],
        }
        r = requests.post(f"{BASE_URL}/sales/", headers=self.headers, json=payload)
        if r.status_code != 201:
            fail(f"HTTP {r.status_code}: {r.text}")
            return self.record("06_venda_com_desconto", False)
        total = float(r.json()["total_amount"])
        passed = abs(total - expected_total) < 0.01
        if passed:
            ok(f"Total com desconto = R${total:.2f} (esperado R${expected_total:.2f})")
        else:
            fail(f"Total = R${total:.2f}, esperado R${expected_total:.2f}")
        return self.record("06_venda_com_desconto", passed)

    def test_07_sale_full_price(self):
        step(7, "VENDA COM PREÇO CHEIO (sem desconto)")
        if not getattr(self, "product_id", None):
            fail("Sem product_id — pulando")
            return self.record("07_venda_preco_cheio", False)

        payload = {
            "payment_method": "credit_card",
            "items": [{"product_id": self.product_id, "quantity": 1, "unit_price": 79.90}],
            "payments": [{"amount": 79.90, "payment_method": "credit_card"}],
        }
        r = requests.post(f"{BASE_URL}/sales/", headers=self.headers, json=payload)
        if r.status_code != 201:
            fail(f"HTTP {r.status_code}: {r.text}")
            return self.record("07_venda_preco_cheio", False)
        total = float(r.json()["total_amount"])
        discount = float(r.json().get("discount_amount", 0))
        passed = abs(total - 79.90) < 0.01 and discount == 0
        if passed:
            ok(f"Total sem desconto = R${total:.2f}, discount_amount=0")
        else:
            fail(f"Total = R${total:.2f}, discount_amount={discount}")
        return self.record("07_venda_preco_cheio", passed)

    # ── 8. Campanha de desconto por forma de pagamento ──────────────────

    def test_08_payment_discount_campaign(self):
        step(8, "CAMPANHA DE DESCONTO — desconto por forma de pagamento")
        # BUG CONHECIDO (documentado, não corrigido aqui): DELETE de payment-discount
        # é soft-delete, mas a constraint UNIQUE(tenant_id, payment_method) não é
        # escopada por is_active — recriar o mesmo payment_method depois de deletar
        # quebra com 500 "UNIQUE constraint failed". Por isso rodar este cenário 2x
        # seguidas falha na 2ª vez, a menos que o registro soft-deleted seja limpo
        # manualmente. Reportar para correção separada (constraint deveria incluir
        # is_active, ou o create deveria reativar um registro inativo existente).
        payload = {
            "payment_method": "pix",
            "discount_percentage": 5.0,
            "description": "Campanha PIX -5% (teste E2E)",
        }
        r = requests.post(f"{BASE_URL}/payment-discounts/", headers=self.headers, json=payload)
        if r.status_code not in (200, 201):
            fail(f"HTTP {r.status_code}: {r.text}")
            info("Se for UNIQUE constraint failed: veja o bug conhecido no comentário acima")
            return self.record("08_campanha_desconto", False)
        discount_id = r.json()["id"]

        # Confirma que a campanha aparece na listagem de descontos ativos
        r2 = requests.get(f"{BASE_URL}/payment-discounts/?active_only=true", headers=self.headers)
        items = r2.json().get("items", r2.json()) if isinstance(r2.json(), dict) else r2.json()
        found = any(d["id"] == discount_id and d["payment_method"] == "pix" for d in items)
        passed = found
        if passed:
            ok(f"Campanha PIX -5% criada e listada (id={discount_id})")
        else:
            fail(f"Campanha criada mas não encontrada na listagem ativa")
        # Limpa a campanha de teste para não afetar descontos reais do usuário
        requests.delete(f"{BASE_URL}/payment-discounts/{discount_id}", headers=self.headers)
        return self.record("08_campanha_desconto", passed)

    # ── 9. Reaproveitar produto na MESMA entrada ────────────────────────

    def test_09_reuse_product_same_entry(self):
        step(9, "REAPROVEITAMENTO — mesmo produto 2x na MESMA entrada")
        if not getattr(self, "product_id", None):
            fail("Sem product_id — pulando")
            return self.record("09_reaproveitar_mesma_entrada", False)

        # Uma StockEntry com 2 EntryItems: um do produto do cenário 1,
        # outro de um segundo produto novo — simula "nota com 2 produtos,
        # um deles já cadastrado" (reaproveitamento dentro da mesma entrada).
        r = requests.post(f"{BASE_URL}/products/", headers=self.headers, json={
            "name": f"Produto E2E Extra {self.unique}", "sku": f"E2E-{self.unique}-EXTRA",
            "price": 19.9, "cost_price": 10.0, "category_id": self.category_id, "is_catalog": False,
        })
        extra_product_id = r.json()["id"] if r.status_code == 201 else None

        payload = {
            "entry_code": f"E2E-SAME-{self.unique}",
            "entry_date": date.today().isoformat(),
            "entry_type": "local",
            "supplier_name": "Fornecedor E2E Mesma Entrada",
            "items": [
                {"product_id": self.product_id, "quantity_received": 3, "unit_cost": 40.0},
                {"product_id": extra_product_id, "quantity_received": 2, "unit_cost": 10.0},
            ] if extra_product_id else [
                {"product_id": self.product_id, "quantity_received": 3, "unit_cost": 40.0},
            ],
        }
        r = requests.post(f"{BASE_URL}/stock-entries/", headers=self.headers, json=payload)
        passed = r.status_code == 201 and r.json().get("total_items") == len(payload["items"])
        if passed:
            ok(f"Entrada criada com {len(payload['items'])} produtos (1 reaproveitado + 1 novo)")
        else:
            fail(f"HTTP {r.status_code}: {r.text}")
        return self.record("09_reaproveitar_mesma_entrada", passed)

    # ── 10. Entrada vinculada a viagem e entrada local ──────────────────

    def test_10_entry_trip_and_local(self):
        step(10, "ENTRADAS — vinculada a viagem vs. local")
        trip_payload = {
            "trip_code": f"E2E-TRIP-{self.unique}",
            "trip_date": date.today().isoformat(),
            "destination": "São Paulo (teste E2E)",
            "travel_cost_fuel": 150.0,
        }
        r = requests.post(f"{BASE_URL}/trips/", headers=self.headers, json=trip_payload)
        if r.status_code not in (200, 201):
            fail(f"Criar trip falhou: HTTP {r.status_code}: {r.text}")
            return self.record("10_entrada_viagem_e_local", False)
        trip_id = r.json()["id"]

        # Produto para a entrada de viagem
        rp = requests.post(f"{BASE_URL}/products/", headers=self.headers, json={
            "name": f"Produto E2E Viagem {self.unique}", "sku": f"E2E-{self.unique}-TRIP",
            "price": 59.9, "cost_price": 25.0, "category_id": self.category_id, "is_catalog": False,
        })
        trip_product_id = rp.json()["id"]

        entry_trip = requests.post(f"{BASE_URL}/stock-entries/", headers=self.headers, json={
            "entry_code": f"E2E-ENTRY-TRIP-{self.unique}",
            "entry_date": date.today().isoformat(),
            "entry_type": "trip",
            "trip_id": trip_id,
            "supplier_name": "Compra em viagem E2E",
            "items": [{"product_id": trip_product_id, "quantity_received": 4, "unit_cost": 25.0}],
        })
        trip_ok = entry_trip.status_code == 201 and entry_trip.json().get("trip_id") == trip_id

        entry_local = requests.post(f"{BASE_URL}/stock-entries/", headers=self.headers, json={
            "entry_code": f"E2E-ENTRY-LOCAL-{self.unique}",
            "entry_date": date.today().isoformat(),
            "entry_type": "local",
            "supplier_name": "Compra local E2E",
            "items": [{"product_id": self.product_id, "quantity_received": 2, "unit_cost": 40.0}],
        })
        local_ok = entry_local.status_code == 201 and not entry_local.json().get("trip_id")

        passed = trip_ok and local_ok
        if passed:
            ok(f"Entrada de viagem (trip_id={trip_id}) e entrada local (sem trip_id) criadas corretamente")
        else:
            if not trip_ok:
                fail(f"Entrada de viagem: HTTP {entry_trip.status_code}: {entry_trip.text}")
            if not local_ok:
                fail(f"Entrada local: HTTP {entry_local.status_code}: {entry_local.text}")
        return self.record("10_entrada_viagem_e_local", passed)

    # ── 11. Reaproveitar produto em OUTRA entrada (regressão do bug variant_id) ──

    def test_11_reuse_product_another_entry(self):
        step(11, "REAPROVEITAMENTO — mesmo produto em entrada DIFERENTE (regressão)")
        if not getattr(self, "variant_product_id", None):
            fail("Sem variant_product_id (cenário 3 falhou) — pulando")
            return self.record("11_reaproveitar_outra_entrada", False)

        # Pega a variante "Preto/M" criada no cenário 3
        pr = requests.get(f"{BASE_URL}/products/{self.variant_product_id}", headers=self.headers)
        variants = pr.json().get("variants", [])
        target = next((v for v in variants if v["color"] == "Preto" and v["size"] == "M"), None)
        if not target:
            fail("Variante Preto/M não encontrada")
            return self.record("11_reaproveitar_outra_entrada", False)

        stock_before = target["current_stock"]

        # Nova entrada, mesma variante, EM OUTRA StockEntry (não a do cenário 3)
        r = requests.post(f"{BASE_URL}/stock-entries/", headers=self.headers, json={
            "entry_code": f"E2E-REUSE-{self.unique}",
            "entry_date": date.today().isoformat(),
            "entry_type": "local",
            "supplier_name": "Fornecedor E2E Reposição",
            "items": [{"product_id": self.variant_product_id, "variant_id": target["id"], "quantity_received": 7, "unit_cost": 20.0}],
        })
        if r.status_code != 201:
            fail(f"HTTP {r.status_code}: {r.text}")
            return self.record("11_reaproveitar_outra_entrada", False)

        # Confirma que o estoque da variante SOMOU (não ficou órfão/invisível — era o bug real)
        pr2 = requests.get(f"{BASE_URL}/products/{self.variant_product_id}", headers=self.headers)
        variants2 = pr2.json().get("variants", [])
        target2 = next((v for v in variants2 if v["id"] == target["id"]), None)
        stock_after = target2["current_stock"] if target2 else None

        passed = stock_after == stock_before + 7
        if passed:
            ok(f"Estoque da variante Preto/M: {stock_before} -> {stock_after} (+7, correto)")
        else:
            fail(f"Estoque da variante: {stock_before} -> {stock_after} (esperado {stock_before + 7}) — regressão do bug variant_id!")
        return self.record("11_reaproveitar_outra_entrada", passed)

    # ── 12. Cancelamento de venda reverte estoque (FIFO) + pontos de fidelidade ──

    def test_12_cancel_sale_restores_stock(self):
        step(12, "CANCELAMENTO DE VENDA — reverte estoque FIFO e pontos de fidelidade")
        if not getattr(self, "product_id", None) or not getattr(self, "customer_id", None):
            fail("Sem product_id/customer_id — pulando")
            return self.record("12_cancelamento_reverte_estoque", False)

        pr_before = requests.get(f"{BASE_URL}/products/{self.product_id}", headers=self.headers)
        stock_before = pr_before.json()["current_stock"]

        cu_before = requests.get(f"{BASE_URL}/customers/{self.customer_id}", headers=self.headers)
        points_before = cu_before.json()["loyalty_points"]

        sale_payload = {
            "customer_id": self.customer_id,
            "payment_method": "cash",
            "items": [{"product_id": self.product_id, "quantity": 1, "unit_price": 79.90}],
            "payments": [{"amount": 79.90, "payment_method": "cash"}],
        }
        r = requests.post(f"{BASE_URL}/sales/", headers=self.headers, json=sale_payload)
        if r.status_code != 201:
            fail(f"Venda para cancelar falhou: HTTP {r.status_code}: {r.text}")
            return self.record("12_cancelamento_reverte_estoque", False)
        sale_id = r.json()["id"]

        rc = requests.post(f"{BASE_URL}/sales/{sale_id}/cancel", headers=self.headers,
                            params={"reason": "Teste E2E de cancelamento"})
        if rc.status_code != 200:
            fail(f"Cancelamento falhou: HTTP {rc.status_code}: {rc.text}")
            return self.record("12_cancelamento_reverte_estoque", False)
        status_ok = rc.json().get("status") == "cancelled"

        pr_after = requests.get(f"{BASE_URL}/products/{self.product_id}", headers=self.headers)
        stock_after = pr_after.json()["current_stock"]
        stock_ok = stock_after == stock_before

        cu_after = requests.get(f"{BASE_URL}/customers/{self.customer_id}", headers=self.headers)
        points_after = cu_after.json()["loyalty_points"]
        points_ok = points_after == points_before

        passed = status_ok and stock_ok and points_ok
        if passed:
            ok(f"Venda cancelada: status=cancelled, estoque {stock_before}->{stock_after} (restaurado), "
               f"pontos {points_before}->{points_after} (revertidos)")
        else:
            fail(f"status_ok={status_ok} estoque {stock_before}->{stock_after} (ok={stock_ok}) "
                 f"pontos {points_before}->{points_after} (ok={points_ok})")
        return self.record("12_cancelamento_reverte_estoque", passed)

    # ── 13. Registro de perda de estoque ─────────────────────────────────

    def test_13_stock_loss_registration(self):
        step(13, "PERDA DE ESTOQUE — despesa de categoria 'Perdas de Estoque' entra no P&L")
        r = requests.get(f"{BASE_URL}/expenses/categories", headers=self.headers)
        cats = r.json()
        loss_cat = next((c for c in cats if c["name"] == "Perdas de Estoque"), None)
        if not loss_cat:
            fail("Categoria 'Perdas de Estoque' não encontrada (deveria existir por padrão)")
            return self.record("13_perda_de_estoque", False)

        before = requests.get(f"{BASE_URL}/expenses/resultado-periodo", headers=self.headers, params={"days": 7})
        losses_before = float(before.json()["stock_losses_total"])

        loss_amount = 37.50
        payload = {
            "amount": loss_amount,
            "description": f"Perda E2E {self.unique} (produto avariado)",
            "expense_date": date.today().isoformat(),
            "category_id": loss_cat["id"],
        }
        r = requests.post(f"{BASE_URL}/expenses", headers=self.headers, json=payload)
        if r.status_code != 201:
            fail(f"HTTP {r.status_code}: {r.text}")
            return self.record("13_perda_de_estoque", False)
        expense_id = r.json()["id"]

        after = requests.get(f"{BASE_URL}/expenses/resultado-periodo", headers=self.headers, params={"days": 7})
        losses_after = float(after.json()["stock_losses_total"])
        passed = abs(losses_after - (losses_before + loss_amount)) < 0.01
        if passed:
            ok(f"stock_losses_total: R${losses_before:.2f} -> R${losses_after:.2f} (+R${loss_amount:.2f})")
        else:
            fail(f"stock_losses_total: R${losses_before:.2f} -> R${losses_after:.2f} "
                 f"(esperado +R${loss_amount:.2f})")

        requests.delete(f"{BASE_URL}/expenses/{expense_id}", headers=self.headers)
        return self.record("13_perda_de_estoque", passed)

    # ── 14. resultado-periodo desconta custo de viagem (regressão net_profit) ──

    def test_14_result_by_period_trip_costs(self):
        step(14, "P&L POR PERÍODO — custo de viagem entra no net_profit (regressão)")
        trip_cost = 200.0
        r = requests.post(f"{BASE_URL}/trips/", headers=self.headers, json={
            "trip_code": f"E2E-TRIPCOST-{self.unique}",
            "trip_date": date.today().isoformat(),
            "destination": "Belo Horizonte (teste E2E)",
            "travel_cost_fuel": trip_cost,
        })
        if r.status_code not in (200, 201):
            fail(f"Criar trip falhou: HTTP {r.status_code}: {r.text}")
            return self.record("14_pl_periodo_trip_costs", False)

        before = requests.get(f"{BASE_URL}/expenses/resultado-periodo", headers=self.headers, params={"days": 7})
        b = before.json()
        gross_profit = float(b["revenue"]) - float(b["cmv"])
        expected_net = gross_profit - float(b["total_expenses"]) - float(b["trip_costs"])
        actual_net = float(b["net_profit"])
        passed = abs(actual_net - expected_net) < 0.01
        if passed:
            ok(f"net_profit = gross_profit - despesas - custo_viagens = R${actual_net:.2f} (bate com o cálculo manual)")
        else:
            fail(f"net_profit={actual_net:.2f}, esperado {expected_net:.2f} "
                 f"(gross={gross_profit:.2f} despesas={b['total_expenses']} viagens={b['trip_costs']})")
        return self.record("14_pl_periodo_trip_costs", passed)

    # ── 15. Regressão: /sales/reports/top-products não deve dar 500 ─────

    def test_15_top_products_report(self):
        step(15, "REGRESSÃO — /sales/reports/top-products não deve quebrar (bug Product.sku)")
        r = requests.get(f"{BASE_URL}/sales/reports/top-products", headers=self.headers,
                          params={"limit": 5})
        products = r.json().get("products") if r.status_code == 200 else None
        passed = r.status_code == 200 and isinstance(products, list)
        if passed:
            ok(f"top-products OK (HTTP 200, {len(products)} produto(s))")
        else:
            fail(f"HTTP {r.status_code}: {r.text}")
        return self.record("15_regressao_top_products", passed)

    # ── 16. Regressão: GET /suppliers/{id} não deve dar 405 ─────────────

    def test_16_get_supplier_by_id(self):
        step(16, "REGRESSÃO — GET /suppliers/{id} não deve dar 405")
        r = requests.post(f"{BASE_URL}/suppliers", headers=self.headers, json={
            "name": f"Fornecedor E2E {self.unique}",
            "phone": "(34) 98888-0000",
        })
        if r.status_code != 201:
            fail(f"Criar fornecedor falhou: HTTP {r.status_code}: {r.text}")
            return self.record("16_regressao_supplier_get_by_id", False)
        supplier_id = r.json()["id"]

        rg = requests.get(f"{BASE_URL}/suppliers/{supplier_id}", headers=self.headers)
        passed = rg.status_code == 200 and rg.json().get("id") == supplier_id
        if passed:
            ok(f"GET /suppliers/{supplier_id} OK (HTTP 200)")
        else:
            fail(f"HTTP {rg.status_code}: {rg.text}")

        requests.delete(f"{BASE_URL}/suppliers/{supplier_id}", headers=self.headers)
        return self.record("16_regressao_supplier_get_by_id", passed)

    # ── Resumo ───────────────────────────────────────────────────────────

    def print_summary(self):
        print(f"\n{BLUE}{'='*70}{RESET}")
        print(f"{BLUE}RESUMO{RESET}")
        print(f"{BLUE}{'='*70}{RESET}")
        passed_count = sum(1 for _, p in self.results if p)
        total = len(self.results)
        for name, passed in self.results:
            tag = f"{GREEN}PASS{RESET}" if passed else f"{RED}FAIL{RESET}"
            print(f"  [{tag}] {name}")
        print(f"\n{passed_count}/{total} cenários passaram.")
        return passed_count == total


def main():
    t = BusinessScenarios()
    if not t.login():
        return
    t.get_category()

    t.test_01_create_product()
    t.test_02_create_customer()
    t.test_03_create_product_with_variants()
    t.test_04_create_simple_sale()
    t.test_05_zero_stock_blocks_sale()
    t.test_06_sale_with_discount()
    t.test_07_sale_full_price()
    t.test_08_payment_discount_campaign()
    t.test_09_reuse_product_same_entry()
    t.test_10_entry_trip_and_local()
    t.test_11_reuse_product_another_entry()
    t.test_12_cancel_sale_restores_stock()
    t.test_13_stock_loss_registration()
    t.test_14_result_by_period_trip_costs()
    t.test_15_top_products_report()
    t.test_16_get_supplier_by_id()

    all_passed = t.print_summary()
    exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
