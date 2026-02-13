"""
Teste E2E completo do fluxo de Produtos e Entradas

Testa todo o ciclo:
1. Criar produto
2. Vincular a entrada (stock entry)
3. Editar produto
4. Editar custo unitário da entrada
5. Excluir entrada sem venda (deve permitir)
6. Criar venda usando a entrada
7. Tentar excluir entrada com venda (deve bloquear)
8. Tentar editar entrada com venda (deve bloquear)
"""

import requests
import json
from datetime import datetime, date

# Configuração
BASE_URL = "http://localhost:8000/api/v1"
EMAIL = "admin@fitness.com"
PASSWORD = "admin123"

# Cores para output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def print_step(step_num, description):
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}ETAPA {step_num}: {description}{RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")

def print_success(message):
    print(f"{GREEN}[OK] {message}{RESET}")

def print_error(message):
    print(f"{RED}[ERRO] {message}{RESET}")

def print_info(message):
    print(f"{YELLOW}[INFO] {message}{RESET}")

def print_json(data):
    print(json.dumps(data, indent=2, ensure_ascii=False, default=str))


class E2ETest:
    def __init__(self):
        self.headers = {}
        self.product_id = None
        self.entry_id = None
        self.entry_item_id = None
        self.sale_id = None
        self.category_id = None
        
    def login(self):
        """Passo 1: Autenticação"""
        print_step(1, "AUTENTICAÇÃO")
        
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": EMAIL, "password": PASSWORD}
        )
        
        if response.status_code == 200:
            token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {token}"}
            print_success(f"Login realizado com sucesso")
            print_info(f"Token: {token[:30]}...")
            return True
        else:
            print_error(f"Falha no login: {response.status_code}")
            print_json(response.json())
            return False
    
    def get_category(self):
        """Buscar categoria existente"""
        response = requests.get(
            f"{BASE_URL}/categories",
            headers=self.headers
        )
        
        if response.status_code == 200:
            categories = response.json()
            if categories:
                self.category_id = categories[0]["id"]
                print_info(f"Usando categoria: {categories[0]['name']} (ID: {self.category_id})")
                return True
        
        print_error("Nenhuma categoria encontrada")
        return False
    
    def create_product(self):
        """Passo 2: Criar produto"""
        print_step(2, "CRIAR PRODUTO")
        
        product_data = {
            "name": f"Produto Teste E2E {datetime.now().strftime('%H%M%S')}",
            "sku": f"TST-E2E-{datetime.now().strftime('%H%M%S')}",
            "category_id": self.category_id,
            "cost_price": 50.00,
            "price": 100.00,
            "description": "Produto criado para teste E2E completo",
            "brand": "Teste Brand",
            "color": "Azul",
            "size": "M"
        }
        
        print_info("Dados do produto:")
        print_json(product_data)
        
        response = requests.post(
            f"{BASE_URL}/products",
            headers=self.headers,
            json=product_data
        )
        
        if response.status_code == 201:
            product = response.json()
            self.product_id = product["id"]
            print_success(f"Produto criado: ID {self.product_id} - {product['name']}")
            print_json(product)
            return True
        else:
            print_error(f"Falha ao criar produto: {response.status_code}")
            print_json(response.json())
            return False
    
    def create_stock_entry(self):
        """Passo 3: Criar entrada vinculando produto"""
        print_step(3, "CRIAR ENTRADA DE ESTOQUE")
        
        entry_code = f"E2E-TEST-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        entry_data = {
            "entry_code": entry_code,
            "entry_date": date.today().isoformat(),  # Date puro, não datetime
            "entry_type": "local",
            "supplier_name": "Fornecedor Teste E2E",
            "items": [
                {
                    "product_id": self.product_id,
                    "quantity_received": 100,
                    "unit_cost": 50.00,
                    "notes": "Entrada inicial para teste E2E"
                }
            ]
        }
        
        print_info("Dados da entrada:")
        print_json(entry_data)
        
        response = requests.post(
            f"{BASE_URL}/stock-entries",
            headers=self.headers,
            json=entry_data
        )
        
        if response.status_code == 201:
            entry = response.json()
            self.entry_id = entry["id"]
            # entry_items pode não estar no response, buscar depois
            if "entry_items" in entry and entry["entry_items"]:
                self.entry_item_id = entry["entry_items"][0]["id"]
            print_success(f"Entrada criada: ID {self.entry_id} - Código {entry['entry_code']}")
            
            # Se não temos entry_item_id, buscar a entrada completa
            if not self.entry_item_id:
                print_info("Buscando detalhes da entrada...")
                response = requests.get(
                    f"{BASE_URL}/stock-entries/{self.entry_id}",
                    headers=self.headers
                )
                if response.status_code == 200:
                    entry_details = response.json()
                    if "entry_items" in entry_details and entry_details["entry_items"]:
                        self.entry_item_id = entry_details["entry_items"][0]["id"]
                        print_info(f"EntryItem ID: {self.entry_item_id}")
            else:
                print_info(f"EntryItem ID: {self.entry_item_id}")
            
            print_json(entry)
            return True
        else:
            print_error(f"Falha ao criar entrada: {response.status_code}")
            print_json(response.json())
            return False
    
    def edit_product(self):
        """Passo 4: Editar produto"""
        print_step(4, "EDITAR PRODUTO")
        
        update_data = {
            "name": f"Produto Teste E2E EDITADO {datetime.now().strftime('%H%M%S')}",
            "price": 120.00,  # Aumentar preço de venda
            "description": "Produto editado durante teste E2E"
        }
        
        print_info("Novos dados:")
        print_json(update_data)
        
        response = requests.put(
            f"{BASE_URL}/products/{self.product_id}",
            headers=self.headers,
            json=update_data
        )
        
        if response.status_code == 200:
            product = response.json()
            print_success(f"Produto editado com sucesso")
            # price vem como string Decimal do backend
            price_value = float(product['price']) if isinstance(product['price'], str) else product['price']
            print_info(f"Novo preço: R$ {price_value:.2f}")
            print_json(product)
            return True
        else:
            print_error(f"Falha ao editar produto: {response.status_code}")
            print_json(response.json())
            return False
    
    def edit_entry_item_cost(self):
        """Passo 5: Editar custo unitário da entrada"""
        print_step(5, "EDITAR CUSTO UNITÁRIO DA ENTRADA")
        
        new_cost = 55.00
        update_data = {"unit_cost": new_cost}
        
        print_info(f"Novo custo unitário: R$ {new_cost:.2f}")
        
        response = requests.put(
            f"{BASE_URL}/stock-entries/entry-items/{self.entry_item_id}",
            headers=self.headers,
            json=update_data
        )
        
        if response.status_code == 200:
            item = response.json()
            print_success(f"Custo unitário atualizado")
            # unit_cost vem como string Decimal do backend
            cost_value = float(item['unit_cost']) if isinstance(item['unit_cost'], str) else item['unit_cost']
            print_info(f"Custo anterior: R$ 50.00 -> Novo custo: R$ {cost_value:.2f}")
            print_json(item)
            return True
        else:
            print_error(f"Falha ao editar custo: {response.status_code}")
            print_json(response.json())
            return False
    
    def delete_entry_without_sale(self):
        """Passo 6: Excluir entrada SEM venda (deve permitir)"""
        print_step(6, "EXCLUIR ENTRADA SEM VENDAS")
        
        print_info(f"Tentando excluir entrada {self.entry_id} que não tem vendas...")
        
        # Primeiro vamos criar uma segunda entrada para testar exclusão
        print_info("Criando entrada temporária para teste de exclusão...")
        
        temp_code = f"E2E-TEMP-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        temp_entry_data = {
            "entry_code": temp_code,
            "entry_date": date.today().isoformat(),  # Date puro, não datetime
            "entry_type": "local",
            "supplier_name": "Fornecedor Temporário",
            "items": [
                {
                    "product_id": self.product_id,
                    "quantity_received": 50,
                    "unit_cost": 45.00,
                    "notes": "Entrada temporária para teste de exclusão"
                }
            ]
        }
        
        response = requests.post(
            f"{BASE_URL}/stock-entries",
            headers=self.headers,
            json=temp_entry_data
        )
        
        if response.status_code == 201:
            temp_entry = response.json()
            temp_entry_id = temp_entry["id"]
            print_success(f"Entrada temporária criada: ID {temp_entry_id}")
            
            # Agora tentar excluir
            print_info(f"Deletando entrada {temp_entry_id}...")
            
            response = requests.delete(
                f"{BASE_URL}/stock-entries/{temp_entry_id}",
                headers=self.headers
            )
            
            if response.status_code == 200:
                print_success(f"Entrada excluída com sucesso (soft delete)")
                print_json(response.json())
                return True
            else:
                print_error(f"Falha ao excluir entrada: {response.status_code}")
                print_json(response.json())
                return False
        else:
            print_error(f"Falha ao criar entrada temporária: {response.status_code}")
            return False
    
    def create_sale(self):
        """Passo 7: Criar venda usando a entrada principal"""
        print_step(7, "CRIAR VENDA")
        
        # Buscar ou criar cliente
        print_info("Buscando clientes...")
        response = requests.get(f"{BASE_URL}/customers", headers=self.headers)
        
        customer_id = None
        if response.status_code == 200:
            customers = response.json()
            if customers:
                customer_id = customers[0]["id"]
                print_info(f"Usando cliente: {customers[0]['full_name']} (ID: {customer_id})")
        
        if not customer_id:
            print_info("Criando cliente para teste...")
            customer_data = {
                "full_name": "Cliente Teste E2E",
                "email": f"teste.e2e.{datetime.now().strftime('%H%M%S')}@test.com",
                "phone": "11999999999"
            }
            response = requests.post(
                f"{BASE_URL}/customers",
                headers=self.headers,
                json=customer_data
            )
            if response.status_code == 201:
                customer_id = response.json()["id"]
                print_success(f"Cliente criado: ID {customer_id}")
        
        # Criar venda
        sale_data = {
            "customer_id": customer_id,
            "payment_method": "cash",  # Campo obrigatório (PaymentMethod enum)
            "items": [
                {
                    "product_id": self.product_id,
                    "quantity": 10,  # Vender 10 unidades
                    "unit_price": 120.00
                }
            ],
            "payments": [
                {
                    "payment_method": "cash",  # Corrigido: era "method", agora "payment_method"
                    "amount": 1200.00
                }
            ]
        }
        
        print_info("Dados da venda:")
        print_json(sale_data)
        
        response = requests.post(
            f"{BASE_URL}/sales",
            headers=self.headers,
            json=sale_data
        )
        
        if response.status_code == 201:
            sale = response.json()
            self.sale_id = sale["id"]
            print_success(f"Venda criada: ID {self.sale_id}")
            # total_amount vem como string Decimal do backend
            total_value = float(sale['total_amount']) if isinstance(sale['total_amount'], str) else sale['total_amount']
            print_info(f"Total: R$ {total_value:.2f}")
            print_json(sale)
            return True
        else:
            print_error(f"Falha ao criar venda: {response.status_code}")
            print_json(response.json())
            return False
    
    def try_delete_entry_with_sale(self):
        """Passo 8: Tentar excluir entrada COM venda (deve bloquear)"""
        print_step(8, "TENTAR EXCLUIR ENTRADA COM VENDAS")
        
        print_info(f"Tentando excluir entrada {self.entry_id} que TEM vendas...")
        print_info("[ESPERADO] Esperamos que isso seja BLOQUEADO")
        
        response = requests.delete(
            f"{BASE_URL}/stock-entries/{self.entry_id}",
            headers=self.headers
        )
        
        if response.status_code == 400:
            print_success("[CORRETO] Exclusão bloqueada conforme esperado!")
            print_info("Mensagem de erro:")
            print_json(response.json())
            return True
        elif response.status_code == 200:
            print_error("[PROBLEMA] Entrada foi excluída, mas deveria ter sido bloqueada!")
            return False
        else:
            print_error(f"Erro inesperado: {response.status_code}")
            print_json(response.json())
            return False
    
    def try_edit_entry_with_sale(self):
        """Passo 9: Tentar editar custo de entrada COM venda (deve bloquear)"""
        print_step(9, "TENTAR EDITAR CUSTO DE ENTRADA COM VENDAS")
        
        print_info(f"Tentando editar custo do EntryItem {self.entry_item_id} que TEM vendas...")
        print_info("[ESPERADO] Esperamos que isso seja BLOQUEADO")
        
        response = requests.put(
            f"{BASE_URL}/stock-entries/entry-items/{self.entry_item_id}",
            headers=self.headers,
            json={"unit_cost": 60.00}
        )
        
        if response.status_code == 400:
            print_success("[CORRETO] Edição bloqueada conforme esperado!")
            print_info("Mensagem de erro:")
            print_json(response.json())
            return True
        elif response.status_code == 200:
            print_error("[PROBLEMA] Custo foi editado, mas deveria ter sido bloqueado!")
            return False
        else:
            print_error(f"Erro inesperado: {response.status_code}")
            print_json(response.json())
            return False
    
    def verify_inventory(self):
        """Passo 10: Verificar estado final do inventário"""
        print_step(10, "VERIFICAR ESTADO FINAL DO INVENTÁRIO")
        
        response = requests.get(
            f"{BASE_URL}/inventory/product/{self.product_id}",
            headers=self.headers
        )
        
        if response.status_code == 200:
            inventory = response.json()
            print_success("Inventário consultado com sucesso")
            print_info(f"Quantidade em estoque: {inventory['quantity']} unidades")
            print_info(f"Min stock: {inventory['min_stock']}")
            print_json(inventory)
            
            # Verificar se quantidade está correta
            # Entrada 1: 100 unidades - 10 vendidas = 90
            expected_quantity = 90
            if inventory['quantity'] == expected_quantity:
                print_success(f"[OK] Quantidade correta: {inventory['quantity']} (esperado: {expected_quantity})")
            else:
                print_error(f"[ERRO] Quantidade incorreta: {inventory['quantity']} (esperado: {expected_quantity})")
            
            return True
        else:
            print_error(f"Falha ao consultar inventário: {response.status_code}")
            print_json(response.json())
            return False
    
    def run_full_test(self):
        """Executa todos os testes em sequência"""
        print(f"\n{BLUE}{'='*60}{RESET}")
        print(f"{BLUE}TESTE E2E COMPLETO - PRODUTOS E ENTRADAS{RESET}")
        print(f"{BLUE}{'='*60}{RESET}")
        print(f"{YELLOW}Data/Hora: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{RESET}")
        
        results = []
        
        # Login
        if not self.login():
            return False
        
        # Buscar categoria
        if not self.get_category():
            return False
        
        # Teste 1: Criar produto
        results.append(("Criar Produto", self.create_product()))
        
        # Teste 2: Criar entrada
        results.append(("Criar Entrada", self.create_stock_entry()))
        
        # Teste 3: Editar produto
        results.append(("Editar Produto", self.edit_product()))
        
        # Teste 4: Editar custo da entrada
        results.append(("Editar Custo Entrada", self.edit_entry_item_cost()))
        
        # Teste 5: Excluir entrada sem venda
        results.append(("Excluir Entrada Sem Venda", self.delete_entry_without_sale()))
        
        # Teste 6: Criar venda
        results.append(("Criar Venda", self.create_sale()))
        
        # Teste 7: Tentar excluir entrada com venda
        results.append(("Bloquear Exclusão Com Venda", self.try_delete_entry_with_sale()))
        
        # Teste 8: Tentar editar entrada com venda
        results.append(("Bloquear Edição Com Venda", self.try_edit_entry_with_sale()))
        
        # Teste 9: Verificar inventário
        results.append(("Verificar Inventário", self.verify_inventory()))
        
        # Resumo
        print(f"\n{BLUE}{'='*60}{RESET}")
        print(f"{BLUE}RESUMO DOS TESTES{RESET}")
        print(f"{BLUE}{'='*60}{RESET}\n")
        
        passed = sum(1 for _, result in results if result)
        total = len(results)
        
        for test_name, result in results:
            status = f"{GREEN}[PASSOU]{RESET}" if result else f"{RED}[FALHOU]{RESET}"
            print(f"{test_name:.<40} {status}")
        
        print(f"\n{BLUE}{'='*60}{RESET}")
        success_rate = (passed / total) * 100
        
        if passed == total:
            print(f"{GREEN}[OK] TODOS OS TESTES PASSARAM: {passed}/{total} ({success_rate:.0f}%){RESET}")
        else:
            print(f"{YELLOW}[ALERTA] ALGUNS TESTES FALHARAM: {passed}/{total} ({success_rate:.0f}%){RESET}")
        
        print(f"{BLUE}{'='*60}{RESET}\n")
        
        # IDs criados
        print(f"{YELLOW}IDs criados durante o teste:{RESET}")
        print(f"  Produto ID: {self.product_id}")
        print(f"  Entrada ID: {self.entry_id}")
        print(f"  EntryItem ID: {self.entry_item_id}")
        print(f"  Venda ID: {self.sale_id}")
        
        return passed == total


if __name__ == "__main__":
    test = E2ETest()
    success = test.run_full_test()
    exit(0 if success else 1)
