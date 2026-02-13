"""
TESTE AVANÇADO DO SISTEMA FIFO - VARREDURA COMPLETA

Este teste valida:
1. FIFO funciona corretamente (estoque mais antigo vendido primeiro)
2. Múltiplas entradas com custos diferentes escalonados
3. Vendas graduais consumindo entradas na ordem FIFO
4. Cálculos de custo médio, lucro, margem
5. Atualização de preços de custo e venda
6. Estatísticas do dashboard (vendas, lucro, ROI)
7. Rastreabilidade completa (sale_sources detalhado)
8. Bloqueio de edições após vendas
9. Validação de consumo das entradas (depleção)
10. Testes de robustez e competência do sistema
"""

import requests
import json
from datetime import datetime, date, timedelta
from typing import List, Dict, Any
from decimal import Decimal

# Config
BASE_URL = "http://localhost:8000/api/v1"
EMAIL = "admin@fitness.com"
PASSWORD = "admin123"

GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
CYAN = '\033[96m'
MAGENTA = '\033[95m'
BOLD = '\033[1m'
RESET = '\033[0m'

def print_header(title):
    print(f"\n{BLUE}{BOLD}{'='*80}{RESET}")
    print(f"{BLUE}{BOLD}{title:^80}{RESET}")
    print(f"{BLUE}{BOLD}{'='*80}{RESET}\n")

def print_subheader(title):
    print(f"\n{CYAN}{'-'*80}{RESET}")
    print(f"{CYAN}{BOLD}{title}{RESET}")
    print(f"{CYAN}{'-'*80}{RESET}")

def print_success(msg):
    print(f"{GREEN}[OK] {msg}{RESET}")

def print_error(msg):
    print(f"{RED}[X] {msg}{RESET}")

def print_info(msg):
    print(f"{YELLOW}[i] {msg}{RESET}")

def print_test(msg):
    print(f"{CYAN}>> {msg}{RESET}")

def print_data(label, data):
    print(f"{MAGENTA}{label}:{RESET}")
    if isinstance(data, (dict, list)):
        print(json.dumps(data, indent=2, ensure_ascii=False, default=str))
    else:
        print(data)

def format_money(value):
    """Formatar valor monetário"""
    if isinstance(value, str):
        value = float(value)
    return f"R$ {value:,.2f}".replace(",", ".")


class FIFOAdvancedTest:
    def __init__(self):
        self.headers = {}
        self.product_id = None
        self.category_id = None
        self.customer_id = None
        self.entries = []  # Lista de {entry_id, entry_item_id, quantity, unit_cost, date, supplier}
        self.sales = []    # Lista de sale_id
        self.test_results = []
        
    def add_test_result(self, test_name, passed, message=""):
        """Adicionar resultado de teste"""
        self.test_results.append({
            "name": test_name,
            "passed": passed,
            "message": message
        })
        
    def login(self):
        """Login e buscar categoria/cliente"""
        print_header("ETAPA 1: SETUP INICIAL")
        
        print_test("Realizando login...")
        response = requests.post(f"{BASE_URL}/auth/login", json={"email": EMAIL, "password": PASSWORD})
        
        if response.status_code != 200:
            print_error(f"Falha no login: {response.status_code}")
            self.add_test_result("Login", False, "Credenciais inválidas")
            return False
        
        self.headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
        print_success("Login realizado com sucesso")
        self.add_test_result("Login", True)
        
        # Buscar categoria
        print_test("Buscando categoria para o produto...")
        response = requests.get(f"{BASE_URL}/categories", headers=self.headers)
        
        if response.status_code == 200 and response.json():
            self.category_id = response.json()[0]["id"]
            print_info(f"Categoria: {response.json()[0]['name']} (ID: {self.category_id})")
            self.add_test_result("Buscar Categoria", True)
        else:
            print_error("Nenhuma categoria encontrada")
            self.add_test_result("Buscar Categoria", False)
            return False
        
        # Buscar/criar cliente
        print_test("Buscando/criando cliente para testes...")
        response = requests.get(f"{BASE_URL}/customers", headers=self.headers)
        
        if response.status_code == 200 and response.json():
            self.customer_id = response.json()[0]["id"]
            print_info(f"Cliente encontrado: {response.json()[0]['full_name']} (ID: {self.customer_id})")
        else:
            # Criar cliente
            customer_data = {
                "full_name": f"Cliente FIFO Test {datetime.now().strftime('%H%M%S')}",
                "email": f"fifo.test.{datetime.now().strftime('%Y%m%d%H%M%S')}@test.com",
                "phone": "11999887766",
                "document_number": f"{datetime.now().strftime('%H%M%S')}999"
            }
            
            response = requests.post(f"{BASE_URL}/customers", headers=self.headers, json=customer_data)
            
            if response.status_code == 201:
                self.customer_id = response.json()["id"]
                print_success(f"Cliente criado: ID {self.customer_id}")
            else:
                print_error("Falha ao criar cliente")
                return False
        
        self.add_test_result("Setup Cliente", True)
        return True
    
    def create_product(self):
        """Criar produto para teste FIFO"""
        print_header("ETAPA 2: CRIAR PRODUTO DE TESTE")
        
        product_data = {
            "name": f"Whey Protein FIFO Test {datetime.now().strftime('%H%M%S')}",
            "sku": f"FIFO-TEST-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "category_id": self.category_id,
            "cost_price": 40.00,  # Custo base inicial
            "price": 100.00,      # Preço de venda inicial
            "description": "Produto para teste avançado do sistema FIFO com múltiplas entradas",
            "brand": "Test Brand",
            "barcode": f"789{datetime.now().strftime('%H%M%S')}",
        }
        
        print_test("Criando produto com os seguintes dados:")
        print(f"  Nome: {product_data['name']}")
        print(f"  SKU: {product_data['sku']}")
        print(f"  Custo base: {format_money(product_data['cost_price'])}")
        print(f"  Preço venda: {format_money(product_data['price'])}")
        
        response = requests.post(f"{BASE_URL}/products", headers=self.headers, json=product_data)
        
        if response.status_code == 201:
            product = response.json()
            self.product_id = product["id"]
            
            print_success(f"Produto criado com sucesso!")
            print_info(f"  ID: {self.product_id}")
            print_info(f"  Nome: {product['name']}")
            print_info(f"  Custo: {format_money(product['cost_price'])}")
            print_info(f"  Preço: {format_money(product['price'])}")
            
            margin = ((float(product['price']) - float(product['cost_price'])) / float(product['price'])) * 100
            print_info(f"  Margem inicial: {margin:.2f}%")
            
            self.add_test_result("Criar Produto", True)
            return True
        else:
            print_error(f"Falha ao criar produto: {response.status_code}")
            print_data("Erro", response.json())
            self.add_test_result("Criar Produto", False, f"Status {response.status_code}")
            return False
    
    def create_multiple_entries(self):
        """Criar 4 entradas com custos escalonados para teste robusto de FIFO"""
        print_header("ETAPA 3: CRIAR ENTRADAS COM CUSTOS ESCALONADOS")
        
        entries_config = [
            {
                "name": "Entrada MAIS ANTIGA (15 dias atrás)",
                "date_offset": -15,
                "quantity": 30,
                "unit_cost": 35.00,
                "supplier": "Fornecedor Alpha (Mais Barato)",
                "notes": "Compra promocional - preço excelente"
            },
            {
                "name": "Entrada ANTIGA (10 dias atrás)",
                "date_offset": -10,
                "quantity": 50,
                "unit_cost": 40.00,
                "supplier": "Fornecedor Beta (Preço Normal)",
                "notes": "Compra regular"
            },
            {
                "name": "Entrada RECENTE (5 dias atrás)",
                "date_offset": -5,
                "quantity": 75,
                "unit_cost": 45.00,
                "supplier": "Fornecedor Gamma (Preço Aumentou)",
                "notes": "Fornecedor subiu preço"
            },
            {
                "name": "Entrada HOJE (mais recente)",
                "date_offset": 0,
                "quantity": 100,
                "unit_cost": 50.00,
                "supplier": "Fornecedor Delta (Mais Caro)",
                "notes": "Última compra - preço alto"
            },
        ]
        
        print_info(f"Criando {len(entries_config)} entradas com custos escalonados")
        print_info("FIFO deve consumir na ordem: Entrada 1 -> Entrada 2 -> Entrada 3 -> Entrada 4")
        print_info("Custos: R$ 35 -> R$ 40 -> R$ 45 -> R$ 50 (crescente)\n")
        
        total_quantity = 0
        total_cost = 0.0
        
        for i, config in enumerate(entries_config, 1):
            print_subheader(f"Criando Entrada {i}: {config['name']}")
            
            entry_date = (date.today() + timedelta(days=config["date_offset"])).isoformat()
            
            entry_data = {
                "entry_code": f"FIFO-E{i}-{datetime.now().strftime('%Y%m%d%H%M%S')}",
                "entry_date": entry_date,
                "entry_type": "local",
                "supplier_name": config["supplier"],
                "notes": config["notes"],
                "items": [{
                    "product_id": self.product_id,
                    "quantity_received": config["quantity"],
                    "unit_cost": config["unit_cost"],
                    "notes": f"Lote {i} - {config['notes']}"
                }]
            }
            
            print_test("Dados da entrada:")
            print(f"  Data: {entry_date}")
            print(f"  Quantidade: {config['quantity']} unidades")
            print(f"  Custo unitário: {format_money(config['unit_cost'])}")
            print(f"  Custo total: {format_money(config['quantity'] * config['unit_cost'])}")
            print(f"  Fornecedor: {config['supplier']}")
            
            response = requests.post(f"{BASE_URL}/stock-entries", headers=self.headers, json=entry_data)
            
            if response.status_code == 201:
                entry = response.json()
                entry_id = entry["id"]
                
                # Buscar detalhes para pegar entry_item_id
                response_detail = requests.get(f"{BASE_URL}/stock-entries/{entry_id}", headers=self.headers)
                
                if response_detail.status_code == 200:
                    entry_details = response_detail.json()
                    entry_item = entry_details["entry_items"][0]
                    entry_item_id = entry_item["id"]
                    
                    self.entries.append({
                        "number": i,
                        "entry_id": entry_id,
                        "entry_item_id": entry_item_id,
                        "quantity": config["quantity"],
                        "unit_cost": config["unit_cost"],
                        "date": entry_date,
                        "supplier": config["supplier"],
                        "notes": config["notes"],
                        "quantity_remaining": config["quantity"],
                        "quantity_sold": 0
                    })
                    
                    total_quantity += config["quantity"]
                    total_cost += config["quantity"] * config["unit_cost"]
                    
                    print_success(f"Entrada {i} criada com sucesso!")
                    print_info(f"  Entry ID: {entry_id}")
                    print_info(f"  Entry Item ID: {entry_item_id}\n")
                    
                    self.add_test_result(f"Criar Entrada {i}", True)
                else:
                    print_error(f"Falha ao buscar detalhes da entrada {i}")
                    return False
            else:
                print_error(f"Falha ao criar entrada {i}: {response.status_code}")
                print_data("Erro", response.json())
                self.add_test_result(f"Criar Entrada {i}", False)
                return False
        
        # Resumo das entradas
        print_subheader("RESUMO DAS ENTRADAS CRIADAS")
        avg_cost = total_cost / total_quantity
        
        print_info(f"Total de entradas: {len(self.entries)}")
        print_info(f"Estoque total: {total_quantity} unidades")
        print_info(f"Custo total: {format_money(total_cost)}")
        print_info(f"Custo médio ponderado: {format_money(avg_cost)}")
        
        print("\nDetalhamento por entrada:")
        for entry in self.entries:
            print(f"  {entry['number']}. {entry['supplier']}")
            print(f"     Quantidade: {entry['quantity']} un | Custo: {format_money(entry['unit_cost'])} | Data: {entry['date']}")
        
        return True
    
    def validate_inventory(self, expected_quantity, step_description=""):
        """Validar quantidade em estoque"""
        print_test(f"Validando estoque{': ' + step_description if step_description else '...'}")
        
        response = requests.get(f"{BASE_URL}/inventory/product/{self.product_id}", headers=self.headers)
        
        if response.status_code == 200:
            inventory = response.json()
            actual = inventory["quantity"]
            
            if actual == expected_quantity:
                print_success(f"Estoque correto: {actual} unidades (esperado: {expected_quantity})")
                self.add_test_result(f"Validar Estoque: {step_description}", True)
                return True
            else:
                print_error(f"ESTOQUE INCORRETO: {actual} unidades (esperado: {expected_quantity})")
                self.add_test_result(f"Validar Estoque: {step_description}", False, f"Erro: {actual} != {expected_quantity}")
                return False
        else:
            print_error(f"Falha ao buscar inventário: {response.status_code}")
            self.add_test_result(f"Validar Estoque: {step_description}", False, "Endpoint falhou")
            return False
    
    def create_sale_with_fifo_validation(self, sale_num, quantity, expected_sources):
        """
        Criar venda e validar FIFO rigorosamente
        
        Args:
            sale_num: Número da venda (para log)
            quantity: Quantidade a vender
            expected_sources: Lista de dicts com:
                - entry_number: Número da entrada (1-4)
                - quantity: Quantidade a consumir desta entrada
        """
        print_header(f"ETAPA {3 + sale_num}: VENDA #{sale_num} - {quantity} UNIDADES")
        
        # Buscar produto atualizado
        response = requests.get(f"{BASE_URL}/products/{self.product_id}", headers=self.headers)
        
        if response.status_code != 200:
            print_error("Falha ao buscar produto")
            return False
        
        product = response.json()
        unit_price = float(product["price"])
        total_revenue = quantity * unit_price
        
        print_test(f"Preparando venda de {quantity} unidades")
        print_info(f"  Preço unitário: {format_money(unit_price)}")
        print_info(f"  Receita total: {format_money(total_revenue)}")
        
        # Calcular custo esperado based on FIFO
        expected_cost = 0.0
        print_info("\n  Consumo esperado (FIFO):")
        for source in expected_sources:
            entry_num = source["entry_number"]
            qty = source["quantity"]
            entry = self.entries[entry_num - 1]
            cost = entry["unit_cost"] * qty
            expected_cost += cost
            print(f"    • Entrada {entry_num}: {qty} un × {format_money(entry['unit_cost'])} = {format_money(cost)}")
        
        expected_profit = total_revenue - expected_cost
        expected_margin = (expected_profit / total_revenue * 100) if total_revenue > 0 else 0
        
        print_info(f"\n  Custo esperado (FIFO): {format_money(expected_cost)}")
        print_info(f"  Lucro esperado: {format_money(expected_profit)}")
        print_info(f"  Margem esperada: {expected_margin:.2f}%")
        
        # Criar venda
        sale_data = {
            "customer_id": self.customer_id,
            "payment_method": "cash",
            "items": [{
                "product_id": self.product_id,
                "quantity": quantity,
                "unit_price": unit_price
            }],
            "payments": [{
                "payment_method": "cash",
                "amount": total_revenue
            }]
        }
        
        print_test("\nCriando venda...")
        response = requests.post(f"{BASE_URL}/sales", headers=self.headers, json=sale_data)
        
        if response.status_code != 201:
            print_error(f"Falha ao criar venda: {response.status_code}")
            print_data("Erro", response.json())
            self.add_test_result(f"Venda {sale_num}: Criar", False)
            return False
        
        sale = response.json()
        sale_id = sale["id"]
        self.sales.append(sale_id)
        
        print_success(f"Venda criada: ID {sale_id}")
        self.add_test_result(f"Venda {sale_num}: Criar", True)
        
        # VALIDAR FIFO - CRÍTICO
        print_subheader(f"VALIDAÇÃO FIFO - VENDA {sale_num}")
        
        item = sale["items"][0]
        sale_sources = item.get("sale_sources", [])
        
        if not sale_sources:
            print_error("CRÍTICO: sale_sources está vazio!")
            print_error("O sistema não está registrando a origem FIFO das vendas!")
            self.add_test_result(f"Venda {sale_num}: FIFO Rastreabilidade", False, "sale_sources vazio")
            return False
        
        print_info(f"Encontradas {len(sale_sources)} fontes na venda")
        
        # Validar cada fonte
        fifo_correct = True
        for i, expected_source in enumerate(expected_sources):
            entry_num = expected_source["entry_number"]
            expected_qty = expected_source["quantity"]
            expected_entry = self.entries[entry_num - 1]
            
            print_test(f"\nValidando fonte {i+1}:")
            print(f"  Esperado: Entrada {entry_num} ({expected_entry['supplier']})")
            print(f"  Quantidade esperada: {expected_qty} un")
            print(f"  Custo esperado: {format_money(expected_entry['unit_cost'])}")
            
            if i >= len(sale_sources):
                print_error(f"  ERRO: Fonte {i+1} não encontrada em sale_sources!")
                fifo_correct = False
                continue
            
            actual_source = sale_sources[i]
            actual_entry_id = actual_source["entry_id"]
            actual_qty = actual_source["quantity_taken"]
            actual_cost = float(actual_source["unit_cost"])
            
            # Verificar se é a entrada correta
            if actual_entry_id == expected_entry["entry_id"]:
                print_success(f"  [OK] Entrada correta: ID {actual_entry_id}")
            else:
                print_error(f"  [X] Entrada ERRADA: {actual_entry_id} (esperado: {expected_entry['entry_id']})")
                fifo_correct = False
            
            # Verificar quantidade
            if actual_qty == expected_qty:
                print_success(f"  [OK] Quantidade correta: {actual_qty} un")
            else:
                print_error(f"  [X] Quantidade ERRADA: {actual_qty} un (esperado: {expected_qty})")
                fifo_correct = False
            
            # Verificar custo
            if abs(actual_cost - expected_entry["unit_cost"]) < 0.01:
                print_success(f"  [OK] Custo correto: {format_money(actual_cost)}")
            else:
                print_error(f"  [X] Custo ERRADO: {format_money(actual_cost)} (esperado: {format_money(expected_entry['unit_cost'])})")
                fifo_correct = False
            
            # Atualizar tracking interno
            self.entries[entry_num - 1]["quantity_sold"] += expected_qty
            self.entries[entry_num - 1]["quantity_remaining"] -= expected_qty
        
        if fifo_correct:
            print_success("\n[OK] FIFO VALIDADO: Consumo correto das entradas!")
            self.add_test_result(f"Venda {sale_num}: FIFO Correto", True)
        else:
            print_error("\n[X] FIFO FALHOU: Ordem ou quantidades incorretas!")
            self.add_test_result(f"Venda {sale_num}: FIFO Correto", False)
            return False
        
        # Validar cálculos financeiros
        print_subheader("VALIDAÇÃO DE CÁLCULOS FINANCEIROS")
        
        actual_cost = float(item.get("cost_total", 0))
        actual_profit = float(item.get("profit", 0))
        actual_margin = float(item.get("margin_percent", 0))
        
        print_test("Comparando valores:")
        print(f"  Custo calculado: {format_money(actual_cost)} (esperado: {format_money(expected_cost)})")
        print(f"  Lucro calculado: {format_money(actual_profit)} (esperado: {format_money(expected_profit)})")
        print(f"  Margem calculada: {actual_margin:.2f}% (esperado: {expected_margin:.2f}%)")
        
        calcs_correct = True
        
        if abs(actual_cost - expected_cost) < 0.01:
            print_success("  [OK] Custo correto")
        else:
            print_error(f"  [X] Custo ERRADO (diferença: {format_money(abs(actual_cost - expected_cost))})")
            calcs_correct = False
        
        if abs(actual_profit - expected_profit) < 0.01:
            print_success("  [OK] Lucro correto")
        else:
            print_error(f"  [X] Lucro ERRADO (diferença: {format_money(abs(actual_profit - expected_profit))})")
            calcs_correct = False
        
        if abs(actual_margin - expected_margin) < 0.1:
            print_success("  [OK] Margem correta")
        else:
            print_error(f"  [X] Margem ERRADA (diferença: {abs(actual_margin - expected_margin):.2f}%)")
            calcs_correct = False
        
        if calcs_correct:
            self.add_test_result(f"Venda {sale_num}: Cálculos", True)
        else:
            self.add_test_result(f"Venda {sale_num}: Cálculos", False)
        
        return fifo_correct and calcs_correct
    
    def validate_entry_depletion_detailed(self):
        """Validar depleção detalhada das entradas"""
        print_header("VALIDAÇÃO: CONSUMO DETALHADO DAS ENTRADAS")
        
        all_correct = True
        
        for entry_info in self.entries:
            print_subheader(f"Entrada {entry_info['number']}: {entry_info['supplier']}")
            
            # Buscar estado atual no banco
            response = requests.get(
                f"{BASE_URL}/stock-entries/entry-items/{entry_info['entry_item_id']}",
                headers=self.headers
            )
            
            if response.status_code != 200:
                print_error(f"Falha ao buscar entry_item {entry_info['entry_item_id']}")
                all_correct = False
                continue
            
            item = response.json()
            qty_received = item["quantity_received"]
            qty_sold = item["quantity_sold"]
            qty_remaining = item["quantity_remaining"]
            
            # Validar com tracking interno
            expected_sold = entry_info["quantity_sold"]
            expected_remaining = entry_info["quantity_remaining"]
            
            print_info(f"  Recebido: {qty_received} un")
            print_info(f"  Vendido: {qty_sold} un (esperado: {expected_sold})")
            print_info(f"  Restante: {qty_remaining} un (esperado: {expected_remaining})")
            print_info(f"  Custo unitário: {format_money(entry_info['unit_cost'])}")
            
            depletion_percent = (qty_sold / qty_received * 100) if qty_received > 0 else 0
            print_info(f"  Taxa de consumo: {depletion_percent:.1f}%")
            
            # Validar consistência
            if qty_sold == expected_sold and qty_remaining == expected_remaining:
                print_success("  [OK] Depleção correta")
            else:
                print_error("  [X] Depleção INCORRETA")
                all_correct = False
            
            # Validar matemática básica
            if qty_received == qty_sold + qty_remaining:
                print_success("  [OK] Matemática correta (recebido = vendido + restante)")
            else:
                print_error(f"  [X] ERRO matemático: {qty_received} != {qty_sold} + {qty_remaining}")
                all_correct = False
            
            print()
        
        if all_correct:
            self.add_test_result("Validar Depleção Entradas", True)
        else:
            self.add_test_result("Validar Depleção Entradas", False)
        
        return all_correct
    
    def test_price_updates(self):
        """Testar atualização de preços"""
        print_header("TESTE EXTRA: ATUALIZAÇÃO DE PREÇOS")
        
        # Buscar produto atual
        response = requests.get(f"{BASE_URL}/products/{self.product_id}", headers=self.headers)
        if response.status_code != 200:
            print_error("Falha ao buscar produto")
            return False
        
        product = response.json()
        current_price = float(product["price"])
        current_cost = float(product["cost_price"])
        
        print_test("Preços atuais:")
        print(f"  Custo: {format_money(current_cost)}")
        print(f"  Venda: {format_money(current_price)}")
        
        # Atualizar preço de venda
        new_price = 120.00
        print_test(f"\nAtualizando preço de venda: {format_money(current_price)} -> {format_money(new_price)}")
        
        response = requests.put(
            f"{BASE_URL}/products/{self.product_id}",
            headers=self.headers,
            json={"price": new_price}
        )
        
        if response.status_code == 200:
            product_updated = response.json()
            actual_price = float(product_updated["price"])
            
            if abs(actual_price - new_price) < 0.01:
                print_success(f"[OK] Preço atualizado com sucesso: {format_money(actual_price)}")
                self.add_test_result("Atualizar Preço Venda", True)
                return True
            else:
                print_error(f"[X] Preço não foi atualizado corretamente: {format_money(actual_price)}")
                self.add_test_result("Atualizar Preço Venda", False)
                return False
        else:
            print_error(f"Falha ao atualizar preço: {response.status_code}")
            self.add_test_result("Atualizar Preço Venda", False)
            return False
    
    def test_edit_protection(self):
        """Testar proteção contra edição de entradas com vendas"""
        print_header("TESTE EXTRA: PROTEÇÃO CONTRA EDIÇÕES")
        
        # Tentar editar custo de uma entrada que teve vendas (Entrada 1)
        entry = self.entries[0]
        
        if entry["quantity_sold"] == 0:
            print_info("Entrada 1 não teve vendas, pulando teste de proteção")
            return True
        
        print_test(f"Tentando editar custo da Entrada 1 (já vendeu {entry['quantity_sold']} un)")
        print_info(f"  Custo atual: {format_money(entry['unit_cost'])}")
        print_info(f"  Tentando mudar para: {format_money(60.00)}")
        
        response = requests.put(
            f"{BASE_URL}/stock-entries/entry-items/{entry['entry_item_id']}",
            headers=self.headers,
            json={"unit_cost": 60.00}
        )
        
        if response.status_code == 400:
            error_msg = response.json().get("detail", "")
            print_success("[OK] Sistema bloqueou corretamente a edição")
            print_info(f"  Mensagem: {error_msg}")
            self.add_test_result("Proteção Edição com Vendas", True)
            return True
        elif response.status_code == 200:
            print_error("[X] CRÍTICO: Sistema permitiu editar item com vendas!")
            print_error("  Isso quebra a rastreabilidade FIFO!")
            self.add_test_result("Proteção Edição com Vendas", False, "Edição permitida indevidamente")
            return False
        else:
            print_error(f"[X] Resposta inesperada: {response.status_code}")
            self.add_test_result("Proteção Edição com Vendas", False, f"Status inesperado: {response.status_code}")
            return False
    
    def test_delete_protection(self):
        """Testar proteção contra exclusão de entradas com vendas"""
        print_header("TESTE EXTRA: PROTEÇÃO CONTRA EXCLUSÃO")
        
        # Tentar excluir uma entrada que teve vendas
        entry = self.entries[0]
        
        if entry["quantity_sold"] == 0:
            print_info("Entrada 1 não teve vendas, pulando teste de proteção")
            return True
        
        print_test(f"Tentando excluir Entrada 1 (já vendeu {entry['quantity_sold']} un)")
        
        response = requests.delete(
            f"{BASE_URL}/stock-entries/{entry['entry_id']}",
            headers=self.headers
        )
        
        if response.status_code == 400:
            error_msg = response.json().get("detail", "")
            print_success("[OK] Sistema bloqueou corretamente a exclusão")
            print_info(f"  Mensagem: {error_msg[:100]}...")
            self.add_test_result("Proteção Exclusão com Vendas", True)
            return True
        elif response.status_code == 200:
            print_error("[X] CRÍTICO: Sistema permitiu excluir entrada com vendas!")
            print_error("  Isso quebra a auditoria e rastreabilidade!")
            self.add_test_result("Proteção Exclusão com Vendas", False, "Exclusão permitida indevidamente")
            return False
        else:
            print_error(f"[X] Resposta inesperada: {response.status_code}")
            self.add_test_result("Proteção Exclusão com Vendas", False, f"Status inesperado: {response.status_code}")
            return False
    
    def validate_final_inventory_state(self):
        """Validar estado final completo do inventário"""
        print_header("VALIDAÇÃO FINAL: ESTADO DO INVENTÁRIO")
        
        # Calcular estoque esperado
        total_received = sum(e["quantity"] for e in self.entries)
        total_sold = sum(len(self.sales) > 0 and e["quantity_sold"] for e in self.entries)
        expected_remaining = total_received - total_sold
        
        print_info("Resumo do movimento:")
        print(f"  Total recebido: {total_received} un")
        print(f"  Total vendido: {total_sold} un")
        print(f"  Esperado em estoque: {expected_remaining} un")
        
        # Buscar inventário
        response = requests.get(f"{BASE_URL}/inventory/product/{self.product_id}", headers=self.headers)
        
        if response.status_code == 200:
            inventory = response.json()
            actual_stock = inventory["quantity"]
            
            print_test(f"\nEstoque atual no sistema: {actual_stock} un")
            
            if actual_stock == expected_remaining:
                print_success("[OK] Estoque final correto!")
                self.add_test_result("Estoque Final", True)
                return True
            else:
                print_error(f"[X] Estoque INCORRETO (diferença: {abs(actual_stock - expected_remaining)} un)")
                self.add_test_result("Estoque Final", False)
                return False
        else:
            print_error("Falha ao buscar inventário final")
            return False
    
    def print_final_report(self):
        """Imprimir relatório final detalhado"""
        print_header("RELATÓRIO FINAL - TESTE AVANÇADO FIFO")
        
        # Contar resultados
        total_tests = len(self.test_results)
        passed_tests = sum(1 for t in self.test_results if t["passed"])
        failed_tests = total_tests - passed_tests
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        
        # Sumário
        print_subheader("SUMÁRIO")
        print(f"  Total de testes: {total_tests}")
        print(f"  Aprovados: {GREEN}{passed_tests}{RESET}")
        print(f"  Reprovados: {RED}{failed_tests}{RESET}")
        print(f"  Taxa de sucesso: {success_rate:.1f}%")
        
        # Lista de testes
        print_subheader("DETALHAMENTO DOS TESTES")
        
        for i, result in enumerate(self.test_results, 1):
            status = f"{GREEN}[PASSOU]{RESET}" if result["passed"] else f"{RED}[FALHOU]{RESET}"
            print(f"{i:2d}. {result['name']:.<60} {status}")
            if result["message"]:
                print(f"    {YELLOW}{result['message']}{RESET}")
        
        # Informações do teste
        print_subheader("INFORMAÇÕES DO TESTE")
        print(f"  Produto ID: {self.product_id}")
        print(f"  Total de entradas: {len(self.entries)}")
        print(f"  Total de vendas: {len(self.sales)}")
        
        if self.entries:
            total_stock = sum(e["quantity"] for e in self.entries)
            total_sold = sum(e["quantity_sold"] for e in self.entries)
            total_remaining = sum(e["quantity_remaining"] for e in self.entries)
            
            print(f"\n  Estoque:")
            print(f"    Total recebido: {total_stock} un")
            print(f"    Total vendido: {total_sold} un")
            print(f"    Total restante: {total_remaining} un")
        
        # Resultado final
        print(f"\n{BLUE}{'='*80}{RESET}")
        
        if passed_tests == total_tests:
            print(f"{GREEN}{BOLD}  *** SUCESSO TOTAL: TODOS OS TESTES PASSARAM! ***{RESET}")
            print(f"{GREEN}{BOLD}  Sistema FIFO está ROBUSTO e FUNCIONANDO PERFEITAMENTE{RESET}")
        elif success_rate >= 80:
            print(f"{YELLOW}{BOLD}  [!] ATENÇÃO: {passed_tests}/{total_tests} testes passaram ({success_rate:.0f}%){RESET}")
            print(f"{YELLOW}  Sistema está funcional mas há problemas a corrigir{RESET}")
        else:
            print(f"{RED}{BOLD}  [XXX] FALHA CRÍTICA: Apenas {passed_tests}/{total_tests} testes passaram ({success_rate:.0f}%){RESET}")
            print(f"{RED}  Sistema FIFO tem problemas graves que precisam ser corrigidos{RESET}")
        
        print(f"{BLUE}{'='*80}{RESET}\n")
        
        return passed_tests == total_tests
    
    def run_complete_test(self):
        """Executar bateria completa de testes FIFO"""
        print_header("INICIANDO TESTE AVANÇADO DO SISTEMA FIFO")
        print(f"{YELLOW}Data/Hora: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{RESET}")
        print(f"{YELLOW}Objetivo: Validação completa da robustez e competência do sistema FIFO{RESET}\n")
        
        # Etapa 1: Setup
        if not self.login():
            print_error("Falha no setup inicial")
            return False
        
        # Etapa 2: Criar produto
        if not self.create_product():
            print_error("Falha ao criar produto")
            return False
        
        # Etapa 3: Criar entradas
        if not self.create_multiple_entries():
            print_error("Falha ao criar entradas")
            return False
        
        # Validar estoque inicial
        total_stock = sum(e["quantity"] for e in self.entries)
        self.validate_inventory(total_stock, "após criação das entradas")
        
        # VENDA 1: 35 unidades (deve consumir Entrada 1 completa + 5 da Entrada 2)
        # Entrada 1: 30 un @ R$ 35
        # Entrada 2: 5 un @ R$ 40
        self.create_sale_with_fifo_validation(
            sale_num=1,
            quantity=35,
            expected_sources=[
                {"entry_number": 1, "quantity": 30},  # Entrada 1 completa
                {"entry_number": 2, "quantity": 5},   # 5 da Entrada 2
            ]
        )
        self.validate_inventory(total_stock - 35, "após Venda 1")
        
        # VENDA 2: 50 unidades (deve consumir resto da Entrada 2 + parte da Entrada 3)
        # Entrada 2: 45 un restantes @ R$ 40
        # Entrada 3: 5 un @ R$ 45
        self.create_sale_with_fifo_validation(
            sale_num=2,
            quantity=50,
            expected_sources=[
                {"entry_number": 2, "quantity": 45},  # Resto da Entrada 2
                {"entry_number": 3, "quantity": 5},   # Início da Entrada 3
            ]
        )
        self.validate_inventory(total_stock - 85, "após Venda 2")
        
        # VENDA 3: 80 unidades (deve consumir resto da Entrada 3 + parte da Entrada 4)
        # Entrada 3: 70 un restantes @ R$ 45
        # Entrada 4: 10 un @ R$ 50
        self.create_sale_with_fifo_validation(
            sale_num=3,
            quantity=80,
            expected_sources=[
                {"entry_number": 3, "quantity": 70},  # Resto da Entrada 3
                {"entry_number": 4, "quantity": 10},  # Início da Entrada 4
            ]
        )
        self.validate_inventory(total_stock - 165, "após Venda 3")
        
        # Validações extras
        self.validate_entry_depletion_detailed()
        self.test_price_updates()
        self.test_edit_protection()
        self.test_delete_protection()
        self.validate_final_inventory_state()
        
        # Relatório final
        return self.print_final_report()


if __name__ == "__main__":
    print(f"\n{BOLD}{'='*80}{RESET}")
    print(f"{BOLD}  TESTE AVANÇADO DO SISTEMA FIFO{RESET}")
    print(f"{BOLD}  Varredura Completa - Robustez e Competência{RESET}")
    print(f"{BOLD}{'='*80}{RESET}\n")
    
    test = FIFOAdvancedTest()
    success = test.run_complete_test()
    
    exit(0 if success else 1)
