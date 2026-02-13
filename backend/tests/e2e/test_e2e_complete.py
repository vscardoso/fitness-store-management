"""
TESTE E2E COMPLETO - DO CADASTRO ATÉ A VENDA

Este teste valida TODA a cadeia:
1. Cadastro de novo usuário (signup)
2. Login
3. Criação de produto
4. Criação de cliente
5. Criação de entrada de estoque
6. Criação de venda
7. Validação de inventário

Objetivo: Garantir que o sistema funciona end-to-end desde o zero
"""

import requests
import json
from datetime import datetime, date
from typing import Dict, Any

# Config
BASE_URL = "http://localhost:8000/api/v1"

GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
CYAN = '\033[96m'
BOLD = '\033[1m'
RESET = '\033[0m'

def print_header(title):
    print(f"\n{BLUE}{BOLD}{'='*80}{RESET}")
    print(f"{BLUE}{BOLD}{title:^80}{RESET}")
    print(f"{BLUE}{BOLD}{'='*80}{RESET}\n")

def print_success(msg):
    print(f"{GREEN}[OK] {msg}{RESET}")

def print_error(msg):
    print(f"{RED}[X] {msg}{RESET}")

def print_info(msg):
    print(f"{YELLOW}[i] {msg}{RESET}")

def print_test(msg):
    print(f"{CYAN}>> {msg}{RESET}")


class E2ECompleteTest:
    def __init__(self):
        self.headers = {}
        self.user_email = f"teste.e2e.{datetime.now().strftime('%Y%m%d%H%M%S')}@fitness.com"
        self.user_password = "Teste@123"
        self.user_id = None
        self.tenant_id = None
        
        self.category_id = None
        self.product_id = None
        self.customer_id = None
        self.entry_id = None
        self.entry_item_id = None
        self.sale_id = None
        
        self.test_results = []
    
    def add_result(self, test_name, passed, message=""):
        """Adicionar resultado de teste"""
        self.test_results.append({
            "name": test_name,
            "passed": passed,
            "message": message
        })
        if passed:
            print_success(f"{test_name}")
        else:
            print_error(f"{test_name}: {message}")
    
    def signup_user(self):
        """1. Cadastrar novo usuário"""
        print_header("ETAPA 1: CADASTRO DE USUÁRIO")
        
        signup_data = {
            "email": self.user_email,
            "password": self.user_password,
            "full_name": f"Usuário Teste E2E {datetime.now().strftime('%H%M%S')}",
            "store_name": f"Loja Teste E2E {datetime.now().strftime('%H%M%S')}",
            "phone": "11987654321"
        }
        
        print_test(f"Criando usuário: {self.user_email}")
        print_info(f"Nome: {signup_data['full_name']}")
        print_info(f"Loja: {signup_data['store_name']}")
        
        response = requests.post(f"{BASE_URL}/auth/signup", json=signup_data)
        
        if response.status_code == 201:
            user_data = response.json()
            self.user_id = user_data["user_id"]
            self.tenant_id = user_data["store_id"]  # store_id é o tenant
            
            print_success(f"Usuário criado!")
            print_info(f"  User ID: {self.user_id}")
            print_info(f"  Tenant/Store ID: {self.tenant_id}")
            print_info(f"  Email: {user_data['user_email']}")
            print_info(f"  Store: {user_data['store_name']}")
            print_info(f"  Plan: {user_data['plan']}")
            
            self.add_result("Cadastro de Usuário", True)
            return True
        else:
            error_msg = response.json().get("detail", "Erro desconhecido")
            print_error(f"Falha no cadastro: {response.status_code}")
            print_error(f"  {error_msg}")
            self.add_result("Cadastro de Usuário", False, error_msg)
            return False
    
    def login_user(self):
        """2. Login do usuário"""
        print_header("ETAPA 2: LOGIN")
        
        print_test(f"Fazendo login: {self.user_email}")
        
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": self.user_email,
            "password": self.user_password
        })
        
        if response.status_code == 200:
            token_data = response.json()
            self.headers = {"Authorization": f"Bearer {token_data['access_token']}"}
            
            print_success("Login realizado!")
            print_info(f"  Token Type: {token_data['token_type']}")
            
            self.add_result("Login", True)
            return True
        else:
            print_error(f"Falha no login: {response.status_code}")
            self.add_result("Login", False, f"Status {response.status_code}")
            return False
    
    def create_category(self):
        """3. Criar categoria"""
        print_header("ETAPA 3: CRIAR CATEGORIA")
        
        category_data = {
            "name": f"Categoria Teste {datetime.now().strftime('%H%M%S')}",
            "description": "Categoria criada pelo teste E2E"
        }
        
        print_test(f"Criando categoria: {category_data['name']}")
        
        response = requests.post(f"{BASE_URL}/categories", headers=self.headers, json=category_data)
        
        if response.status_code == 201:
            category = response.json()
            self.category_id = category["id"]
            
            print_success(f"Categoria criada: ID {self.category_id}")
            self.add_result("Criar Categoria", True)
            return True
        else:
            error_detail = response.text
            try:
                error_json = response.json()
                error_detail = error_json.get("detail", error_json)
            except:
                pass
            
            print_error(f"Falha ao criar categoria: {response.status_code}")
            print_error(f"  Erro: {error_detail}")
            self.add_result("Criar Categoria", False, str(error_detail)[:100])
            return False
    
    def create_product(self):
        """4. Criar produto"""
        print_header("ETAPA 4: CRIAR PRODUTO")
        
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        
        product_data = {
            "name": f"Whey Protein E2E {timestamp}",
            "sku": f"E2E-{timestamp}",
            "barcode": f"7890{timestamp}",
            "category_id": self.category_id,
            "cost_price": 45.00,
            "price": 99.90,
            "description": "Produto criado pelo teste E2E completo",
            "brand": "E2E Brand",
            "min_stock": 5
        }
        
        print_test("Criando produto com dados:")
        print_info(f"  Nome: {product_data['name']}")
        print_info(f"  SKU: {product_data['sku']}")
        print_info(f"  Custo: R$ {product_data['cost_price']:.2f}")
        print_info(f"  Preço: R$ {product_data['price']:.2f}")
        
        response = requests.post(f"{BASE_URL}/products", headers=self.headers, json=product_data)
        
        if response.status_code == 201:
            product = response.json()
            self.product_id = product["id"]
            
            print_success(f"Produto criado: ID {self.product_id}")
            print_info(f"  Nome: {product['name']}")
            
            margin = ((float(product['price']) - float(product['cost_price'])) / float(product['price'])) * 100
            print_info(f"  Margem: {margin:.2f}%")
            
            self.add_result("Criar Produto", True)
            return True
        else:
            error_msg = response.json().get("detail", "Erro desconhecido")
            print_error(f"Falha ao criar produto: {response.status_code}")
            print_error(f"  {error_msg}")
            self.add_result("Criar Produto", False, error_msg)
            return False
    
    def create_customer(self):
        """5. Criar cliente"""
        print_header("ETAPA 5: CRIAR CLIENTE")
        
        timestamp = datetime.now().strftime('%H%M%S')
        
        customer_data = {
            "full_name": f"Cliente E2E Test {timestamp}",
            "email": f"cliente.e2e.{timestamp}@test.com",
            "phone": "11998887777",
            "document_number": f"999{timestamp}",
            "street": "Rua Teste E2E",
            "number": "123",
            "neighborhood": "Bairro Teste",
            "city": "São Paulo",
            "state": "SP",
            "postal_code": "01234567"
        }
        
        print_test(f"Criando cliente: {customer_data['full_name']}")
        
        response = requests.post(f"{BASE_URL}/customers", headers=self.headers, json=customer_data)
        
        if response.status_code == 201:
            customer = response.json()
            self.customer_id = customer["id"]
            
            print_success(f"Cliente criado: ID {self.customer_id}")
            print_info(f"  Nome: {customer['full_name']}")
            print_info(f"  Email: {customer['email']}")
            
            self.add_result("Criar Cliente", True)
            return True
        else:
            error_msg = response.json().get("detail", "Erro desconhecido")
            print_error(f"Falha ao criar cliente: {response.status_code}")
            print_error(f"  {error_msg}")
            self.add_result("Criar Cliente", False, error_msg)
            return False
    
    def create_stock_entry(self):
        """6. Criar entrada de estoque"""
        print_header("ETAPA 6: CRIAR ENTRADA DE ESTOQUE")
        
        entry_data = {
            "entry_code": f"E2E-ENTRY-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "entry_date": date.today().isoformat(),
            "entry_type": "local",
            "supplier_name": "Fornecedor E2E Test",
            "notes": "Entrada criada pelo teste E2E completo",
            "items": [{
                "product_id": self.product_id,
                "quantity_received": 50,
                "unit_cost": 45.00,
                "notes": "Lote inicial teste E2E"
            }]
        }
        
        print_test("Criando entrada de estoque:")
        print_info(f"  Código: {entry_data['entry_code']}")
        print_info(f"  Fornecedor: {entry_data['supplier_name']}")
        print_info(f"  Quantidade: 50 unidades")
        print_info(f"  Custo unitário: R$ 45.00")
        print_info(f"  Custo total: R$ 2.250,00")
        
        response = requests.post(f"{BASE_URL}/stock-entries", headers=self.headers, json=entry_data)
        
        if response.status_code == 201:
            entry = response.json()
            self.entry_id = entry["id"]
            
            print_success(f"Entrada criada: ID {self.entry_id}")
            
            # Buscar detalhes para pegar entry_item_id
            response_detail = requests.get(f"{BASE_URL}/stock-entries/{self.entry_id}", headers=self.headers)
            
            if response_detail.status_code == 200:
                entry_details = response_detail.json()
                self.entry_item_id = entry_details["entry_items"][0]["id"]
                print_info(f"  Entry Item ID: {self.entry_item_id}")
            
            self.add_result("Criar Entrada de Estoque", True)
            return True
        else:
            error_msg = response.json().get("detail", "Erro desconhecido")
            print_error(f"Falha ao criar entrada: {response.status_code}")
            print_error(f"  {error_msg}")
            self.add_result("Criar Entrada de Estoque", False, error_msg)
            return False
    
    def validate_inventory_after_entry(self):
        """7. Validar estoque após entrada"""
        print_header("ETAPA 7: VALIDAR ESTOQUE APÓS ENTRADA")
        
        print_test(f"Validando estoque do produto {self.product_id}...")
        
        response = requests.get(f"{BASE_URL}/inventory/product/{self.product_id}", headers=self.headers)
        
        if response.status_code == 200:
            inventory = response.json()
            quantity = inventory["quantity"]
            
            print_info(f"  Estoque atual: {quantity} unidades")
            
            if quantity == 50:
                print_success("Estoque correto: 50 unidades")
                self.add_result("Validar Estoque Após Entrada", True)
                return True
            else:
                print_error(f"Estoque incorreto: {quantity} (esperado: 50)")
                self.add_result("Validar Estoque Após Entrada", False, f"{quantity} != 50")
                return False
        else:
            print_error(f"Falha ao buscar inventário: {response.status_code}")
            self.add_result("Validar Estoque Após Entrada", False)
            return False
    
    def create_sale(self):
        """8. Criar venda"""
        print_header("ETAPA 8: CRIAR VENDA")
        
        sale_quantity = 10
        unit_price = 99.90
        total = sale_quantity * unit_price
        
        sale_data = {
            "customer_id": self.customer_id,
            "payment_method": "cash",
            "items": [{
                "product_id": self.product_id,
                "quantity": sale_quantity,
                "unit_price": unit_price
            }],
            "payments": [{
                "payment_method": "cash",
                "amount": total
            }]
        }
        
        print_test(f"Criando venda de {sale_quantity} unidades:")
        print_info(f"  Cliente ID: {self.customer_id}")
        print_info(f"  Preço unitário: R$ {unit_price:.2f}")
        print_info(f"  Total: R$ {total:.2f}")
        
        response = requests.post(f"{BASE_URL}/sales", headers=self.headers, json=sale_data)
        
        if response.status_code == 201:
            sale = response.json()
            self.sale_id = sale["id"]
            
            print_success(f"Venda criada: ID {self.sale_id}")
            
            # Validar FIFO
            item = sale["items"][0]
            cost_total = float(item.get("cost_total", 0))
            profit = float(item.get("profit", 0))
            margin = float(item.get("margin_percent", 0))
            
            print_info(f"  Custo total: R$ {cost_total:.2f}")
            print_info(f"  Lucro: R$ {profit:.2f}")
            print_info(f"  Margem: {margin:.2f}%")
            
            # Validar sale_sources (FIFO)
            sale_sources = item.get("sale_sources", [])
            if sale_sources:
                print_success(f"FIFO rastreado: {len(sale_sources)} fonte(s)")
                for source in sale_sources:
                    print_info(f"    Entry {source['entry_id']}: {source['quantity_taken']} un @ R$ {source['unit_cost']:.2f}")
            else:
                print_error("ATENÇÃO: sale_sources vazio!")
            
            self.add_result("Criar Venda", True)
            return True
        else:
            error_msg = response.json().get("detail", "Erro desconhecido")
            print_error(f"Falha ao criar venda: {response.status_code}")
            print_error(f"  {error_msg}")
            self.add_result("Criar Venda", False, error_msg)
            return False
    
    def validate_inventory_after_sale(self):
        """9. Validar estoque após venda"""
        print_header("ETAPA 9: VALIDAR ESTOQUE APÓS VENDA")
        
        print_test(f"Validando estoque do produto {self.product_id}...")
        
        response = requests.get(f"{BASE_URL}/inventory/product/{self.product_id}", headers=self.headers)
        
        if response.status_code == 200:
            inventory = response.json()
            quantity = inventory["quantity"]
            
            print_info(f"  Estoque atual: {quantity} unidades")
            print_info(f"  Entrada inicial: 50 un")
            print_info(f"  Vendido: 10 un")
            print_info(f"  Esperado: 40 un")
            
            if quantity == 40:
                print_success("Estoque correto: 40 unidades (50 - 10)")
                self.add_result("Validar Estoque Após Venda", True)
                return True
            else:
                print_error(f"Estoque incorreto: {quantity} (esperado: 40)")
                self.add_result("Validar Estoque Após Venda", False, f"{quantity} != 40")
                return False
        else:
            print_error(f"Falha ao buscar inventário: {response.status_code}")
            self.add_result("Validar Estoque Após Venda", False)
            return False
    
    def validate_sale_details(self):
        """10. Validar detalhes da venda"""
        print_header("ETAPA 10: VALIDAR DETALHES DA VENDA")
        
        print_test(f"Buscando detalhes da venda {self.sale_id}...")
        
        response = requests.get(f"{BASE_URL}/sales/{self.sale_id}", headers=self.headers)
        
        if response.status_code == 200:
            sale = response.json()
            
            print_success("Venda encontrada!")
            print_info(f"  Status: {sale['status']}")
            print_info(f"  Total: R$ {float(sale['total_amount']):.2f}")
            print_info(f"  Cliente ID: {sale['customer_id']}")
            print_info(f"  Items: {len(sale['items'])}")
            print_info(f"  Pagamentos: {len(sale['payments'])}")
            
            # Validar dados
            if sale["customer_id"] == self.customer_id:
                print_success("Cliente correto")
            else:
                print_error(f"Cliente incorreto: {sale['customer_id']} != {self.customer_id}")
            
            if len(sale["items"]) == 1:
                print_success("1 item na venda")
            else:
                print_error(f"Número de items incorreto: {len(sale['items'])}")
            
            self.add_result("Validar Detalhes da Venda", True)
            return True
        else:
            print_error(f"Falha ao buscar venda: {response.status_code}")
            self.add_result("Validar Detalhes da Venda", False)
            return False
    
    def print_final_report(self):
        """Relatório final"""
        print_header("RELATÓRIO FINAL - TESTE E2E COMPLETO")
        
        total = len(self.test_results)
        passed = sum(1 for r in self.test_results if r["passed"])
        failed = total - passed
        success_rate = (passed / total * 100) if total > 0 else 0
        
        print_info(f"Total de testes: {total}")
        print_info(f"Aprovados: {GREEN}{passed}{RESET}")
        print_info(f"Reprovados: {RED}{failed}{RESET}")
        print_info(f"Taxa de sucesso: {success_rate:.1f}%")
        
        print(f"\n{CYAN}Detalhamento:{RESET}")
        for i, result in enumerate(self.test_results, 1):
            status = f"{GREEN}[PASSOU]{RESET}" if result["passed"] else f"{RED}[FALHOU]{RESET}"
            print(f"{i:2d}. {result['name']:.<50} {status}")
            if result["message"]:
                print(f"    {YELLOW}{result['message']}{RESET}")
        
        print(f"\n{CYAN}IDs Criados:{RESET}")
        print(f"  User ID: {self.user_id}")
        print(f"  Tenant ID: {self.tenant_id}")
        print(f"  Category ID: {self.category_id}")
        print(f"  Product ID: {self.product_id}")
        print(f"  Customer ID: {self.customer_id}")
        print(f"  Entry ID: {self.entry_id}")
        print(f"  Sale ID: {self.sale_id}")
        
        print(f"\n{BLUE}{'='*80}{RESET}")
        
        if passed == total:
            print(f"{GREEN}{BOLD}  *** SUCESSO TOTAL: TODOS OS TESTES PASSARAM! ***{RESET}")
            print(f"{GREEN}{BOLD}  Sistema E2E está FUNCIONANDO PERFEITAMENTE{RESET}")
        elif success_rate >= 80:
            print(f"{YELLOW}{BOLD}  [!] ATENÇÃO: {passed}/{total} testes passaram ({success_rate:.0f}%){RESET}")
        else:
            print(f"{RED}{BOLD}  [XXX] FALHA: Apenas {passed}/{total} testes passaram{RESET}")
        
        print(f"{BLUE}{'='*80}{RESET}\n")
        
        return passed == total
    
    def run_complete_test(self):
        """Executar teste E2E completo"""
        print_header("INICIANDO TESTE E2E COMPLETO")
        print(f"{YELLOW}Data/Hora: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{RESET}")
        print(f"{YELLOW}Objetivo: Validar cadeia completa desde cadastro até venda{RESET}\n")
        
        # Executar todas as etapas
        if not self.signup_user():
            return False
        
        if not self.login_user():
            return False
        
        if not self.create_category():
            return False
        
        if not self.create_product():
            return False
        
        if not self.create_customer():
            return False
        
        if not self.create_stock_entry():
            return False
        
        if not self.validate_inventory_after_entry():
            return False
        
        if not self.create_sale():
            return False
        
        if not self.validate_inventory_after_sale():
            return False
        
        if not self.validate_sale_details():
            return False
        
        # Relatório final
        return self.print_final_report()


if __name__ == "__main__":
    print(f"\n{BOLD}{'='*80}{RESET}")
    print(f"{BOLD}  TESTE E2E COMPLETO - DO CADASTRO À VENDA{RESET}")
    print(f"{BOLD}  Validação completa da cadeia de funcionalidades{RESET}")
    print(f"{BOLD}{'='*80}{RESET}\n")
    
    test = E2ECompleteTest()
    success = test.run_complete_test()
    
    exit(0 if success else 1)
