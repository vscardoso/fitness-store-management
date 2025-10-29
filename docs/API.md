# API Documentation - Fitness Store Management

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Autenticação](#autenticação)
- [Endpoints](#endpoints)
  - [Auth](#auth)
  - [Produtos](#produtos)
  - [Categorias](#categorias)
  - [Estoque](#estoque)
  - [Vendas](#vendas)
  - [Clientes](#clientes)
  - [Usuários](#usuários)

---

## 🌐 Visão Geral

**Base URL:** `http://localhost:8000/api/v1`

**Content-Type:** `application/json`

**Autenticação:** Bearer Token (JWT)

---

## 🔐 Autenticação

### Login

```http
POST /auth/login
```

**Request Body:**
```json
{
  "email": "admin@fitnessstore.com",
  "password": "senha123"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "email": "admin@fitnessstore.com",
    "full_name": "Administrador",
    "role": "admin",
    "is_active": true
  }
}
```

### Refresh Token

```http
POST /auth/refresh
```

**Request Body:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Logout

```http
POST /auth/logout
Authorization: Bearer {access_token}
```

---

## 📦 Produtos

### Listar Produtos

```http
GET /products?skip=0&limit=100&search=legging&category_id=1
Authorization: Bearer {access_token}
```

**Query Parameters:**
- `skip` (optional): Número de itens a pular (paginação)
- `limit` (optional): Limite de itens por página (padrão: 100)
- `search` (optional): Busca por nome, SKU ou marca
- `category_id` (optional): Filtrar por categoria

**Response:**
```json
[
  {
    "id": 1,
    "name": "Legging Fitness Preta",
    "sku": "LEG-FIT-001",
    "barcode": "7891234567890",
    "description": "Legging de alta compressão",
    "brand": "Nike",
    "category_id": 1,
    "cost_price": 50.00,
    "price": 120.00,
    "min_stock_threshold": 5,
    "is_active": true,
    "created_at": "2025-10-29T10:00:00",
    "updated_at": "2025-10-29T10:00:00",
    "category": {
      "id": 1,
      "name": "Roupas Femininas"
    }
  }
]
```

### Buscar Produto por ID

```http
GET /products/{id}
Authorization: Bearer {access_token}
```

### Criar Produto

```http
POST /products
Authorization: Bearer {access_token}
```

**Request Body:**
```json
{
  "name": "Legging Fitness Preta",
  "sku": "LEG-FIT-001",
  "barcode": "7891234567890",
  "description": "Legging de alta compressão",
  "brand": "Nike",
  "category_id": 1,
  "cost_price": 50.00,
  "price": 120.00,
  "min_stock_threshold": 5
}
```

### Atualizar Produto

```http
PUT /products/{id}
Authorization: Bearer {access_token}
```

**Request Body:** (todos os campos opcionais)
```json
{
  "name": "Legging Fitness Preta Premium",
  "price": 150.00
}
```

### Deletar Produto (Soft Delete)

```http
DELETE /products/{id}
Authorization: Bearer {access_token}
```

### Produtos com Estoque Baixo

```http
GET /products/low-stock
Authorization: Bearer {access_token}
```

---

## 📁 Categorias

### Listar Categorias

```http
GET /categories
Authorization: Bearer {access_token}
```

### Criar Categoria

```http
POST /categories
Authorization: Bearer {access_token}
```

**Request Body:**
```json
{
  "name": "Roupas Femininas",
  "description": "Roupas esportivas femininas"
}
```

### Atualizar Categoria

```http
PUT /categories/{id}
Authorization: Bearer {access_token}
```

### Deletar Categoria

```http
DELETE /categories/{id}
Authorization: Bearer {access_token}
```

---

## 📊 Estoque

### Consultar Estoque de um Produto

```http
GET /inventory/product/{product_id}
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "id": 1,
  "product_id": 1,
  "warehouse_id": 1,
  "quantity": 50,
  "min_stock": 5,
  "max_stock": 100,
  "last_movement_date": "2025-10-29T10:00:00"
}
```

### Movimentar Estoque (Entrada)

```http
POST /inventory/movement
Authorization: Bearer {access_token}
```

**Request Body:**
```json
{
  "product_id": 1,
  "movement_type": "IN",
  "quantity": 20,
  "notes": "Entrada por compra"
}
```

### Movimentar Estoque (Saída)

```http
POST /inventory/movement
Authorization: Bearer {access_token}
```

**Request Body:**
```json
{
  "product_id": 1,
  "movement_type": "OUT",
  "quantity": 5,
  "notes": "Saída por venda"
}
```

### Histórico de Movimentações

```http
GET /inventory/movements?product_id=1&skip=0&limit=50
Authorization: Bearer {access_token}
```

---

## 🛒 Vendas

### Criar Venda

```http
POST /sales
Authorization: Bearer {access_token}
```

**Request Body:**
```json
{
  "customer_id": 1,
  "items": [
    {
      "product_id": 1,
      "quantity": 2,
      "unit_price": 120.00,
      "discount": 0
    }
  ],
  "payment_method": "CREDIT_CARD",
  "discount": 10.00,
  "notes": "Venda balcão"
}
```

### Listar Vendas

```http
GET /sales?skip=0&limit=100&start_date=2025-10-01&end_date=2025-10-31
Authorization: Bearer {access_token}
```

### Buscar Venda por ID

```http
GET /sales/{id}
Authorization: Bearer {access_token}
```

### Cancelar Venda

```http
POST /sales/{id}/cancel
Authorization: Bearer {access_token}
```

---

## 👥 Clientes

### Listar Clientes

```http
GET /customers?skip=0&limit=100&search=joão
Authorization: Bearer {access_token}
```

### Criar Cliente

```http
POST /customers
Authorization: Bearer {access_token}
```

**Request Body:**
```json
{
  "name": "João Silva",
  "email": "joao@email.com",
  "phone": "(11) 98765-4321",
  "cpf": "123.456.789-00",
  "birth_date": "1990-01-15",
  "address": {
    "street": "Rua das Flores",
    "number": "123",
    "city": "São Paulo",
    "state": "SP",
    "zip_code": "01234-567"
  }
}
```

### Atualizar Cliente

```http
PUT /customers/{id}
Authorization: Bearer {access_token}
```

### Deletar Cliente

```http
DELETE /customers/{id}
Authorization: Bearer {access_token}
```

---

## 👤 Usuários (Admin)

### Listar Usuários

```http
GET /users
Authorization: Bearer {access_token}
```

**Requer role:** `admin`

### Criar Usuário

```http
POST /users
Authorization: Bearer {access_token}
```

**Request Body:**
```json
{
  "email": "usuario@fitnessstore.com",
  "password": "senha123",
  "full_name": "Nome Completo",
  "role": "employee"
}
```

### Desativar Usuário

```http
POST /users/{id}/deactivate
Authorization: Bearer {access_token}
```

---

## 📊 Códigos de Status

| Código | Descrição |
|--------|-----------|
| 200 | OK - Requisição bem-sucedida |
| 201 | Created - Recurso criado com sucesso |
| 204 | No Content - Sem conteúdo (Delete) |
| 400 | Bad Request - Dados inválidos |
| 401 | Unauthorized - Não autenticado |
| 403 | Forbidden - Sem permissão |
| 404 | Not Found - Recurso não encontrado |
| 422 | Unprocessable Entity - Validação falhou |
| 500 | Internal Server Error - Erro no servidor |

---

## 🔧 Erros Comuns

### Erro de Autenticação

```json
{
  "detail": "Could not validate credentials"
}
```

### Erro de Validação

```json
{
  "detail": [
    {
      "loc": ["body", "email"],
      "msg": "value is not a valid email address",
      "type": "value_error.email"
    }
  ]
}
```

### Recurso Não Encontrado

```json
{
  "detail": "Product not found"
}
```

---

## 🧪 Testando a API

### Usando cURL

```bash
# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@fitnessstore.com", "password": "senha123"}'

# Listar produtos
curl -X GET http://localhost:8000/api/v1/products \
  -H "Authorization: Bearer {seu_token}"
```

### Usando HTTPie

```bash
# Login
http POST localhost:8000/api/v1/auth/login email=admin@fitnessstore.com password=senha123

# Listar produtos
http GET localhost:8000/api/v1/products Authorization:"Bearer {seu_token}"
```

### Swagger UI

Acesse: `http://localhost:8000/docs`

### ReDoc

Acesse: `http://localhost:8000/redoc`

---

## 📝 Notas

- Todos os endpoints (exceto `/auth/login`) requerem autenticação via Bearer Token
- Timestamps estão em formato ISO 8601 (UTC)
- Valores monetários estão em formato decimal (ex: 120.00)
- Soft delete é usado - itens deletados não aparecem nas listagens mas permanecem no banco
- Rate limiting pode ser aplicado em produção
