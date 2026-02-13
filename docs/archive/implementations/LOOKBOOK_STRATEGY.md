# 💎 ESTRATÉGIA: LOOKBOOK PERSONALIZADO + WISHLIST INTELIGENTE

**Data:** 24/01/2026
**Versão:** 1.0
**Status:** Planejamento

---

## 🎯 VISÃO GERAL

### Conceito Central
Sistema que permite cliente **MONTAR LOOKS** com peças da loja, **SALVAR** o que quer, e recebe **ALERTA AUTOMÁTICO** quando a peça chegar em estoque.

**Think:** Pinterest + Zara App + Personal Stylist em um só.

### Problema que Resolve
- ❌ Cliente vê peça no Instagram → "Quero em P rosa!" → Vendedora: "Não tenho P" → Cliente: "Me avisa quando chegar" → **Vendedora ESQUECE** → Cliente compra em outro lugar 💔
- ❌ Cliente não sabe o que combina → Compra 1 peça só → Ticket baixo
- ❌ Loja não sabe o que repor → Compra no achismo → Encalha estoque errado

### Solução
- ✅ Sistema sugere combinações de looks automaticamente
- ✅ Alerta automático quando peça da wishlist chegar
- ✅ Vendedora vê demanda real ANTES de comprar
- ✅ Ticket médio aumenta (de 1 peça → look completo)

---

## 📊 ROI ESTIMADO

### Cenário Atual (Sem Sistema)
- 100 clientes/mês
- Ticket médio: **R$ 120** (1 peça)
- Taxa de conversão wishlist: **20%** (vendedora esquece)
- **Receita: R$ 12.000/mês**

### Com Sistema
- 100 clientes/mês
- Ticket médio: **R$ 280** (look completo - 2,3 peças)
- Taxa de conversão wishlist: **65%** (alerta automático)
- **Receita: R$ 28.000/mês**

### Resultado
**GANHO: +R$ 16.000/mês = +R$ 192.000/ano** 🚀

**Aumento de ticket médio: +133%**

---

## 🎨 FUNCIONALIDADES PRINCIPAIS

### 1. Look Builder (Cliente Monta o Look)

**Interface:**
```
👗 MONTE SEU LOOK

[FOTO: Top cropped preto]
Top Cropped Premium - P, M, G
R$ 89,90

COMBINA COM:
┌─────────────────────┐
│ [FOTO] Legging      │
│ High Waist          │
│ R$ 149,90           │
│ [ADICIONAR AO LOOK] │
└─────────────────────┘

SEU LOOK:
• Top Cropped Premium (P) - R$ 89,90
• Legging High Waist (P) - R$ 149,90
─────────────────────────
TOTAL: R$ 239,80

⚠️ Legging P - SEM ESTOQUE
[SALVAR NA WISHLIST] [PEDIR CONDICIONAL]
```

**Regras de Negócio:**
- Sistema sugere até 6 peças que combinam (baseado em tags: cor, estilo, categoria)
- Cliente pode montar quantos looks quiser
- Looks salvos ficam no perfil do cliente
- Desconto automático de 10% em looks com 3+ peças

### 2. Wishlist com Alertas Automáticos

**Fluxo:**

1. **Cliente salva look:**
```
💾 LOOK SALVO

"Meu Look Treino Perfeito"
• Top Cropped Premium (P) ✅ Em estoque
• Legging High Waist (P) ⏳ Aguardando

📱 Vamos te avisar quando a Legging P chegar!
```

2. **Quando a legging chega em estoque:**
```
📱 NOTIFICAÇÃO PUSH:
"Boa notícia! 🎉

A Legging High Waist P chegou!

Seu look completo está disponível:
[FOTO DO LOOK]

Total: R$ 239,80
Desconto de conjunto: -R$ 24 (10%)
VOCÊ PAGA: R$ 215,80

[COMPRAR AGORA] [PEDIR CONDICIONAL]"
```

**Regras de Negócio:**
- Alerta enviado via push notification + WhatsApp (opcional)
- Peça fica reservada por 24h após alerta
- Desconto aplicado automaticamente
- Cliente pode escolher: Comprar direto OU Pedir condicional

### 3. Dashboard de Demanda (Vendedora)

**Interface:**
```
🎯 DEMANDA DO DIA

LOOKS ESPERANDO ESTOQUE:

Legging High Waist P (Rosa)
├─ 8 clientes aguardando 🔥
├─ Look mais comum:
│  └─ Top Cropped + Legging = R$ 239
└─ [FAZER PEDIDO] [VER CLIENTES]

Top Sport Bra M (Preto)
├─ 3 clientes aguardando
└─ [AVISAR CHEGADA PREVISTA]

Conjunto Premium G
├─ 2 clientes aguardando
├─ Valor total: R$ 598
└─ [OFERECER SUBSTITUTO]
```

**Dados Exibidos:**
- Produtos mais desejados (em wishlist)
- Quantidade de clientes aguardando
- Valor potencial de vendas
- Looks mais montados
- Sugestões de reposição baseadas em demanda real

### 4. Sugestões Inteligentes

**Baseado em Compras Anteriores:**
```
OLÁ MARIA! 👋

Você comprou:
• Legging High Waist Preta (P)

COMBINE COM:
┌──────────────────────────┐
│ [FOTO] Top Sport Bra    │
│ Cor: Rosa (combina!)     │
│ R$ 79,90                 │
│ [VER LOOK COMPLETO]      │
└──────────────────────────┘

LOOKS QUE OUTRAS CLIENTES MONTARAM:
1. Legging Preta + Top Rosa + Jaqueta
2. Legging Preta + Cropped Branco
```

**Algoritmo de Sugestão:**
1. **Histórico do cliente** (já comprou legging preta P)
2. **Cor complementar** (rosa combina com preto)
3. **Tamanho correto** (P - já sabemos)
4. **Popularidade** (outros clientes montaram esse look)
5. **Estoque disponível** (só sugerir o que tem)

### 5. Try Before You Buy Turbinado

**Condicional de Look Completo:**
```
FLUXO:

1. Cliente monta look no app
2. Clica "Pedir Condicional do Look"
3. Loja separa as 3-4 peças
4. Cliente experimenta em casa
5. Fica com o que serviu
6. Compra é automática

RESULTADO:
- Taxa de conversão: 80%+ (já viu que combina)
- Menos devolução (testou em casa)
- Experiência VIP total
```

**Vantagem vs Condicional Tradicional:**
- Cliente não precisa escolher peça por peça
- Sistema já sugere look completo
- Maior probabilidade de comprar múltiplas peças
- Experiência mais "personal shopper"

---

## 🎁 FUNCIONALIDADES COMPLEMENTARES (FASE 2)

### 1. Coleções Temáticas
```
🌸 COLEÇÃO PRIMAVERA 2026

[LOOKS PRONTOS]
• Look Pastel (3 peças) - R$ 349
• Look Neon (2 peças) - R$ 229
• Look Black (4 peças) - R$ 459

[MONTE O SEU]
```

### 2. Programa VIP por Looks
```
🏆 STATUS VIP

Você montou 5 looks este mês!

BENEFÍCIOS:
• Ver lançamentos 48h antes
• Desconto de 15% em looks completos
• Condicional sem limite de peças
```

### 3. Gamificação Social
```
👗 SEU CLOSET VIRTUAL

Peças que você tem:
• 3 Leggings
• 2 Tops
• 1 Jaqueta

LOOKS POSSÍVEIS: 12
[VER COMBINAÇÕES]

COMPARTILHE SEU LOOK:
[Instagram] [WhatsApp]
```

### 4. WhatsApp Bot Integrado
```
Cliente: "Tem legging preta P?"
Bot: "Tenho! R$ 149,90"
Cliente: "Quero"
Bot: "Combina com:
1. Top Rosa (R$ 79)
2. Top Branco (R$ 69)
Quer adicionar?"
Cliente: "Top rosa"
Bot: "Look completo: R$ 228,90
Desconto de 10%: R$ 206
[PEDIR CONDICIONAL] [COMPRAR]"
```

---

## 🔧 ARQUITETURA TÉCNICA

### Backend (FastAPI)

#### Novos Models

**1. Look (Conjunto de Produtos)**
```python
class Look(BaseModel):
    id: int
    tenant_id: int
    name: str  # "Meu Look Treino Perfeito"
    customer_id: int | None  # NULL = look da loja, INT = look do cliente
    is_public: bool  # Se outros podem ver
    discount_percentage: float  # 10% para 3+ peças
    created_at: datetime

    # Relationships
    items: List[LookItem]
```

**2. LookItem (Produtos do Look)**
```python
class LookItem(BaseModel):
    id: int
    look_id: int
    product_id: int
    size: str  # P, M, G, GG
    color: str | None
    position: int  # Ordem de exibição

    # Relationships
    product: Product
```

**3. Wishlist (Lista de Desejos)**
```python
class Wishlist(BaseModel):
    id: int
    tenant_id: int
    customer_id: int
    product_id: int
    size: str
    color: str | None
    look_id: int | None  # Se faz parte de um look
    notified: bool  # Se já enviou alerta
    created_at: datetime

    # Relationships
    product: Product
    customer: Customer
    look: Look | None
```

**4. ProductTag (Tags para Sugestões)**
```python
class ProductTag(BaseModel):
    id: int
    product_id: int
    tag_type: str  # 'color', 'style', 'occasion', 'season'
    tag_value: str  # 'preto', 'athleisure', 'treino', 'verao'

    # Relationships
    product: Product
```

#### Novos Services

**1. LookService**
```python
class LookService:
    async def create_look(db, tenant_id, customer_id, look_data)
    async def suggest_combinations(db, product_id, customer_id)
    async def get_customer_looks(db, customer_id)
    async def get_public_looks(db, tenant_id, limit=10)
    async def calculate_look_total(db, look_id)
```

**2. WishlistService**
```python
class WishlistService:
    async def add_to_wishlist(db, customer_id, product_id, size)
    async def remove_from_wishlist(db, wishlist_id)
    async def get_customer_wishlist(db, customer_id)
    async def check_and_notify_availability(db, product_id, size)
    async def get_demand_report(db, tenant_id)  # Para dashboard vendedora
```

**3. SuggestionService**
```python
class SuggestionService:
    async def suggest_complementary_products(db, product_id, customer_id)
    async def suggest_looks_based_on_purchase(db, customer_id)
    async def get_trending_looks(db, tenant_id)
    async def calculate_similarity_score(product_a, product_b)
```

#### Novos Endpoints

**`/api/v1/looks`**
```python
GET /looks  # Looks públicos da loja
GET /looks/my  # Looks do cliente
POST /looks  # Criar look
PUT /looks/{id}  # Editar look
DELETE /looks/{id}  # Deletar look
GET /looks/{id}/suggestions  # Sugestões de peças para completar
POST /looks/{id}/request-conditional  # Pedir condicional do look inteiro
```

**`/api/v1/wishlist`**
```python
GET /wishlist  # Wishlist do cliente
POST /wishlist  # Adicionar à wishlist
DELETE /wishlist/{id}  # Remover da wishlist
GET /wishlist/demand  # Demanda agregada (vendedora)
```

**`/api/v1/suggestions`**
```python
GET /suggestions/products/{product_id}  # Peças que combinam
GET /suggestions/looks  # Looks sugeridos para o cliente
GET /suggestions/trending  # Looks em alta
```

#### Background Jobs

**1. Wishlist Notification Worker**
```python
# Cron job que roda a cada 1 hora
async def check_wishlist_availability():
    # Buscar wishlists pendentes
    pending_wishlists = await get_pending_wishlists()

    for wishlist in pending_wishlists:
        # Verificar se produto está em estoque
        in_stock = await check_stock(wishlist.product_id, wishlist.size)

        if in_stock and not wishlist.notified:
            # Enviar notificação push + WhatsApp
            await send_push_notification(wishlist.customer_id, wishlist.product_id)
            await send_whatsapp_message(wishlist.customer_id, wishlist.product_id)

            # Marcar como notificado
            wishlist.notified = True
            await db.commit()
```

### Frontend (React Native)

#### Novas Telas

**1. `/looks/builder`** - Montar Look
```typescript
<LookBuilderScreen>
  <ProductGrid>  // Produtos disponíveis
  <LookPreview>  // Preview do look montado
  <ActionButtons>
    <SaveLookButton />
    <RequestConditionalButton />
    <BuyNowButton />
  </ActionButtons>
</LookBuilderScreen>
```

**2. `/looks/my-looks`** - Meus Looks
```typescript
<MyLooksScreen>
  <LookCard
    name="Look Treino Perfeito"
    items={[product1, product2]}
    total={239.80}
    availability="2/2 disponíveis"
  />
</MyLooksScreen>
```

**3. `/wishlist`** - Wishlist
```typescript
<WishlistScreen>
  <WishlistItem
    product="Legging High Waist P"
    status="Aguardando estoque"
    estimatedArrival="3 dias"
  />
  <AlertSettings />  // WhatsApp, Push, Email
</WishlistScreen>
```

**4. `/looks/gallery`** - Galeria de Looks (Públicos)
```typescript
<LookGalleryScreen>
  <FilterBar>  // Ocasião, Estilo, Cor
  <LookGrid>
    <LookCard
      image={lookPhoto}
      likes={23}
      saves={8}
      onPress={() => viewLookDetails()}
    />
  </LookGrid>
</LookGalleryScreen>
```

**5. `/dashboard/demand`** - Dashboard Vendedora
```typescript
<DemandDashboardScreen>
  <DemandCard
    product="Legging High Waist P"
    waitingCustomers={8}
    potentialRevenue={1188}
  />
  <ActionButton text="Fazer Pedido" />
</DemandDashboardScreen>
```

#### Novos Componentes

```typescript
// Look Builder
<ProductCombinationSuggester />
<LookTotalCalculator />
<DiscountIndicator />

// Wishlist
<AvailabilityAlert />
<NotificationSettings />

// Social
<LookShareButton />
<LookLikeButton />
```

#### Novos Services

```typescript
// mobile/services/lookService.ts
export const createLook = (lookData) => api.post('/looks', lookData)
export const getMyLooks = () => api.get('/looks/my')
export const getSuggestions = (productId) => api.get(`/suggestions/products/${productId}`)

// mobile/services/wishlistService.ts
export const addToWishlist = (data) => api.post('/wishlist', data)
export const getWishlist = () => api.get('/wishlist')
export const getDemandReport = () => api.get('/wishlist/demand')
```

---

## 📅 ROADMAP DE IMPLEMENTAÇÃO

### FASE 1: MVP (2-3 semanas)

**Semana 1 - Backend**
- [ ] Models: Look, LookItem, Wishlist, ProductTag
- [ ] Services: LookService, WishlistService
- [ ] Endpoints básicos: `/looks`, `/wishlist`
- [ ] Background job: Wishlist notification worker

**Semana 2 - Frontend**
- [ ] Tela: Look Builder (montar look)
- [ ] Tela: Minha Wishlist
- [ ] Componente: Sugestões de combinações
- [ ] Notificações push

**Semana 3 - Integração & Testes**
- [ ] Fluxo completo: Montar look → Salvar → Receber alerta
- [ ] Testes de notificação
- [ ] Ajustes de UX
- [ ] Dashboard vendedora (básico)

### FASE 2: Melhorias (1-2 semanas)

- [ ] SuggestionService com IA básica
- [ ] Looks públicos / galeria
- [ ] Gamificação (VIP por looks)
- [ ] WhatsApp bot
- [ ] Coleções temáticas

### FASE 3: Advanced (futuro)

- [ ] Recomendação com ML (TensorFlow)
- [ ] Virtual try-on (AR)
- [ ] Integração Instagram Shopping
- [ ] Analytics avançado de demanda

---

## 🎯 MÉTRICAS DE SUCESSO

### KPIs Principais

**1. Ticket Médio**
- Meta: Aumentar de R$ 120 → R$ 280 (+133%)
- Como medir: `AVG(sale.total_amount)`

**2. Taxa de Conversão Wishlist**
- Meta: Aumentar de 20% → 65%
- Como medir: `(wishlists_converted / total_wishlists) * 100`

**3. Looks Criados por Cliente**
- Meta: 2+ looks por cliente/mês
- Como medir: `COUNT(looks) / COUNT(DISTINCT customer_id)`

**4. Taxa de Multi-Peças**
- Meta: 60% das vendas com 2+ peças
- Como medir: `(sales_with_2plus_items / total_sales) * 100`

**5. Redução de Perda de Venda**
- Meta: -50% de "cliente pediu mas não tinha"
- Como medir: Comparar wishlist requests vs conversão

### Dashboard de Analytics

```
📊 LOOKBOOK PERFORMANCE

ESTE MÊS:
• Ticket médio: R$ 285 (+138%) ↑
• Looks criados: 234
• Wishlist conversão: 68% ↑
• Multi-peças: 64% das vendas ↑

TOP LOOKS:
1. Legging + Top + Jaqueta (45 vendas)
2. Conjunto Coral (32 vendas)
3. Look Athleisure (28 vendas)

DEMANDA PENDENTE:
• 12 clientes aguardando Legging P Rosa
• 8 clientes aguardando Top Sport Bra M
• Valor potencial: R$ 2.345
```

---

## ✅ DIFERENCIAIS COMPETITIVOS

### Por Que Isso é ÚNICO?

1. ✅ **Nenhum app de loja fitness tem lookbook builder**
   - Instagram: Só foto estática
   - Concorrentes: Catálogo tradicional
   - Nós: Cliente MONTA o look

2. ✅ **Wishlist com alerta automático**
   - Concorrentes: Cliente pergunta "tem?"
   - Nós: Sistema avisa quando chegar

3. ✅ **Dashboard de demanda real**
   - Concorrentes: Compram no achismo
   - Nós: Dados de o que cliente QUER

4. ✅ **Try before you buy de looks**
   - Concorrentes: Devolução arriscada
   - Nós: Cliente experimenta em casa SEM RISCO

5. ✅ **Experiência premium**
   - Cliente sente: "A loja é só minha"
   - Personal stylist digital
   - Fidelização altíssima

---

## 💡 CASOS DE USO REAIS

### Caso 1: Cliente Nova
```
1. Maria vê legging no Instagram da loja
2. Acessa o app → "Quero esse look"
3. Sistema sugere: Top + Short que combinam
4. Maria monta look completo (R$ 359)
5. Clica "Pedir Condicional"
6. Experimenta em casa → Fica com tudo
7. Taxa de conversão: 90%
```

### Caso 2: Cliente Fiel
```
1. Ana já comprou legging preta P
2. App sugere: "Combine com Top Rosa R$ 79"
3. Ana adiciona à wishlist
4. Top P chega → Notificação automática
5. Ana compra na hora
6. Ticket médio: +R$ 79
```

### Caso 3: Vendedora
```
1. Dashboard mostra: "8 clientes aguardando Legging P Rosa"
2. Vendedora faz pedido de 10 unidades
3. Chegam → Sistema avisa os 8 clientes
4. 7 compram (taxa: 87%)
5. Receita: R$ 1.043
6. ZERO estoque parado
```

---

## 🚨 RISCOS E MITIGAÇÕES

### Risco 1: Complexidade de Implementação
**Mitigação:** Fazer MVP simples primeiro (Fase 1), depois evoluir

### Risco 2: Cliente Não Usar
**Mitigação:** Onboarding ativo, vendedora ensina cliente no WhatsApp

### Risco 3: Sugestões Ruins
**Mitigação:** Começar com tags manuais (vendedora marca), depois IA

### Risco 4: Notificações Spam
**Mitigação:** Cliente escolhe: Push OU WhatsApp OU Email (não todos)

### Risco 5: Performance
**Mitigação:** Cache de sugestões, paginação, background jobs assíncronos

---

## 🌐 ESTRATÉGIA DE DISTRIBUIÇÃO MULTI-CANAL

### Situação Atual do Sistema

**Backend:**
- ✅ FastAPI rodando (API REST acessível via web)
- ✅ Endpoints prontos e funcionais

**Frontend:**
- ❌ React Native + Expo = **MOBILE ONLY**
- ❌ Não roda em navegador web
- ❌ Cliente precisa INSTALAR app (APK/IPA)
- ❌ Barreira de entrada ALTA

**Problema Real:**
```
Vendedora: "Baixa nosso app!"
Cliente: "Ahn? Preciso instalar? Que saco..."
Vendedora: "É rapidinho!"
Cliente: "Depois eu vejo..." → NUNCA instala
```

### Solução: 3 Canais Complementares

```
┌─────────────────────────────────────┐
│ 1. WhatsApp Business (PRINCIPAL)   │ ← Cliente JÁ USA
│    Catálogo, Pedidos, Atendimento  │
├─────────────────────────────────────┤
│ 2. Landing Page Web (LOOKBOOK)     │ ← Ver looks, explorar
│    Galeria, Filtros, Wishlist      │
├─────────────────────────────────────┤
│ 3. App Mobile (VENDEDORA)          │ ← Gestão completa
│    PDV, Estoque, Condicionais      │
└─────────────────────────────────────┘
```

---

## 📱 CANAL 1: WhatsApp Business API (PRIORIDADE MÁXIMA)

### Por Que WhatsApp Primeiro?

- ✅ **97% dos brasileiros** usam WhatsApp
- ✅ **ZERO fricção** - Cliente já tem instalado
- ✅ **Confiança** - Cliente prefere WhatsApp que app desconhecido
- ✅ **Vendedora já usa** - Fluxo natural de atendimento

### Funcionalidades do WhatsApp

#### A. Catálogo Nativo WhatsApp
```
Cliente: "Oi!"
Loja: "Olá! 👋 Veja nosso catálogo:"
[BOTÃO: Ver Produtos]

→ Cliente vê produtos COM PREÇO dentro do WhatsApp
→ Pode adicionar ao carrinho
→ Finaliza pedido diretamente
```

**Vantagens:**
- Cliente não sai do WhatsApp
- Interface familiar
- Checkout rápido

#### B. Chatbot Inteligente

**Fluxo Automático:**
```
Cliente: "Tem legging preta P?"
Bot: "Tenho sim!
Legging High Waist Preta P
R$ 149,90
[FOTO]

Combina com:
1. Top Rosa R$ 79
2. Top Branco R$ 69
Quer adicionar?"

Cliente: "Top rosa"
Bot: "Look completo: R$ 228,90
Desconto de conjunto (10%): R$ 206
[PEDIR CONDICIONAL] [COMPRAR AGORA]"
```

**Funcionalidades do Bot:**
- Consultar disponibilidade de produtos
- Sugerir combinações (lookbook)
- Processar pedidos
- Rastrear entregas
- Escalonar para vendedora humana

#### C. Notificações de Wishlist

**Alerta Automático:**
```
Sistema → WhatsApp:
"Oi Maria! 🎉
A Legging P Rosa que você pediu CHEGOU!
[FOTO]
R$ 149,90
[COMPRAR AGORA]"
```

**Quando enviar:**
- Produto da wishlist volta ao estoque
- Promoção em produto favorito
- Lançamento compatível com histórico
- Lembrete de look salvo (3 dias)

#### D. Menu de Atendimento

**Opções Principais:**
```
Olá! Sou a assistente virtual da [Nome da Loja].
Escolha uma opção:

1️⃣ Ver catálogo completo
2️⃣ Novidades e lançamentos
3️⃣ Meus pedidos
4️⃣ Looks montados por você
5️⃣ Falar com vendedora

Digite o número da opção desejada.
```

### Tecnologias WhatsApp

**Opção 1: Meta Business API (Oficial)**
- **Custo:** R$ 0,05-0,15 por conversa
- **Vantagens:** Oficial, suporte Meta, catálogo nativo
- **Desvantagens:** Processo de aprovação, custos

**Opção 2: Baileys (Open Source)**
- **Custo:** Grátis (self-hosted)
- **Vantagens:** Sem custos, flexível, rápido de implementar
- **Desvantagens:** Não oficial, risco de ban

**Opção 3: Twilio/MessageBird**
- **Custo:** R$ 0,10 por mensagem
- **Vantagens:** Infraestrutura confiável, APIs robustas
- **Desvantagens:** Custo por mensagem

**RECOMENDAÇÃO INICIAL:** Baileys para MVP/testes, migrar para Meta API em produção.

### Arquitetura WhatsApp Integration

**Backend:**
```python
# backend/app/webhooks/whatsapp.py
from fastapi import APIRouter, Request

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])

@router.post("/whatsapp")
async def whatsapp_webhook(request: Request, db: AsyncSession):
    """
    Recebe mensagens do WhatsApp e processa.
    """
    data = await request.json()
    message_text = data['message']['text']
    customer_phone = data['from']

    # 1. Identificar intenção
    intent = classify_intent(message_text)

    # 2. Processar baseado na intenção
    if intent == "search_product":
        products = await search_products(db, message_text)
        response = format_product_list(products)

    elif intent == "create_order":
        order = await create_order_from_message(db, customer_phone, data)
        response = format_order_confirmation(order)

    elif intent == "check_stock":
        stock = await check_product_availability(db, message_text)
        response = format_stock_response(stock)

    else:
        response = "Não entendi. Digite 'MENU' para ver opções."

    # 3. Enviar resposta
    await send_whatsapp_message(customer_phone, response)
```

**Serviços:**
```python
# backend/app/services/whatsapp_service.py
class WhatsAppService:
    async def send_message(self, to: str, message: str)
    async def send_product_catalog(self, to: str, products: List[Product])
    async def send_look_suggestion(self, to: str, look: Look)
    async def send_wishlist_alert(self, customer_id: int, product_id: int)
    async def process_order_from_chat(self, phone: str, items: List[dict])
```

---

## 🌍 CANAL 2: Landing Page Web (Next.js)

### Por Que Landing Page?

- ✅ **Link compartilhável** - WhatsApp, Instagram, Google
- ✅ **SEO** - Google indexa, tráfego orgânico
- ✅ **Experiência visual rica** - Lookbook interativo
- ✅ **Sem instalação** - Acesso imediato

### Estrutura da Landing Page

**URL:** `minhaloja.com.br`

#### Páginas Principais

**1. Home Page**
```
┌─────────────────────────────────────┐
│ [LOGO] Minha Loja Fitness           │
│ [🔍 Buscar] [🛒 0] [❤️ Wishlist]    │
├─────────────────────────────────────┤
│ 🔥 LOOKS EM ALTA                    │
│ ┌──────┬──────┬──────┐              │
│ │[IMG] │[IMG] │[IMG] │              │
│ │Look 1│Look 2│Look 3│              │
│ │R$ 349│R$ 289│R$ 459│              │
│ └──────┴──────┴──────┘              │
│                                     │
│ 🆕 NOVIDADES                        │
│ [Grid de produtos - 8 itens]        │
│                                     │
│ 💬 ATENDIMENTO WHATSAPP             │
│ [BOTÃO VERDE FLUTUANTE FIXO]        │
└─────────────────────────────────────┘
```

**2. Página de Produto**
```
┌─────────────────────────────────────┐
│ ← Voltar                            │
├─────────────────────────────────────┤
│ [GALERIA DE FOTOS]                  │
│                                     │
│ Legging High Waist Preta            │
│ R$ 149,90                           │
│ ⭐⭐⭐⭐⭐ (23 avaliações)            │
│                                     │
│ Tamanhos: [P] [M] [G] [GG]          │
│ Cores: [⚫] [🔵] [🟣]                │
│                                     │
│ ❤️ ADICIONAR À WISHLIST             │
│ 🛒 PEDIR VIA WHATSAPP               │
│                                     │
│ COMBINA COM:                        │
│ [Top Rosa] [Jaqueta] [Short]        │
└─────────────────────────────────────┘
```

**3. Lookbook Gallery**
```
┌─────────────────────────────────────┐
│ 👗 MONTE SEU LOOK                   │
├─────────────────────────────────────┤
│ Filtros: [Ocasião ▼] [Cor ▼] [Estilo ▼] │
│                                     │
│ [Grid de Looks - 12 por página]     │
│ ┌────────┐ ┌────────┐ ┌────────┐   │
│ │ [IMG]  │ │ [IMG]  │ │ [IMG]  │   │
│ │ Look 1 │ │ Look 2 │ │ Look 3 │   │
│ │ 3 peças│ │ 2 peças│ │ 4 peças│   │
│ │ R$ 349 │ │ R$ 229 │ │ R$ 489 │   │
│ │ ❤️ 45  │ │ ❤️ 32  │ │ ❤️ 28  │   │
│ └────────┘ └────────┘ └────────┘   │
└─────────────────────────────────────┘
```

**4. Minha Wishlist**
```
┌─────────────────────────────────────┐
│ ❤️ MINHA LISTA DE DESEJOS           │
├─────────────────────────────────────┤
│ ✅ DISPONÍVEIS AGORA (2)            │
│ • Legging High Waist P - R$ 149     │
│   [PEDIR VIA WHATSAPP]              │
│                                     │
│ ⏳ AGUARDANDO ESTOQUE (3)           │
│ • Top Sport Bra M Rosa              │
│   Previsão: 3 dias                  │
│   📱 Vamos te avisar!               │
│                                     │
│ 💬 QUER AJUDA?                      │
│ [FALAR NO WHATSAPP]                 │
└─────────────────────────────────────┘
```

### Fluxo do Cliente

**Cenário 1: Instagram → Site → WhatsApp**
```
1. Cliente vê post no Instagram
2. Clica no link da bio
3. Entra no site
4. Navega produtos/looks
5. Gosta de look → Clica "Pedir via WhatsApp"
6. WhatsApp abre com mensagem pré-preenchida:
   "Olá! Vi o Look Athleisure no site e gostei!"
7. Vendedora atende → Fecha venda
```

**Cenário 2: Google → Site → Wishlist → WhatsApp**
```
1. Cliente busca "legging fitness" no Google
2. Site aparece nos resultados (SEO)
3. Entra no site
4. Adiciona produtos à wishlist
5. Produto chega → Recebe notificação WhatsApp
6. Compra via WhatsApp
```

### Tecnologias Landing Page

**Framework:** Next.js 14 (App Router)
- Server-Side Rendering (SSR)
- Static Site Generation (SSG)
- SEO otimizado
- Performance excelente

**Estilização:** Tailwind CSS
- Componentes rápidos
- Responsivo mobile-first
- Dark mode nativo

**API Integration:** Mesma API FastAPI
- Endpoints já prontos
- Autenticação JWT (opcional para wishlist)
- Real-time stock check

**Hospedagem:** Vercel
- Deploy automático
- CDN global
- SSL grátis
- **PLANO FREE** disponível

**Domínio:** R$ 40/ano (.com.br)

### Código Base Next.js

**Estrutura de Pastas:**
```
web/
├── app/
│   ├── layout.tsx           # Layout principal
│   ├── page.tsx             # Home page
│   ├── produtos/
│   │   └── [id]/page.tsx    # Produto individual
│   ├── looks/
│   │   └── page.tsx         # Galeria de looks
│   └── wishlist/
│       └── page.tsx         # Wishlist
├── components/
│   ├── ProductCard.tsx
│   ├── LookCard.tsx
│   ├── WhatsAppButton.tsx
│   └── WishlistButton.tsx
├── services/
│   └── api.ts               # Cliente API (axios)
└── public/
    └── images/
```

**Exemplo - Home Page:**
```typescript
// app/page.tsx
import { getProducts, getTrendingLooks } from '@/services/api';
import ProductGrid from '@/components/ProductGrid';
import LookGallery from '@/components/LookGallery';
import WhatsAppButton from '@/components/WhatsAppButton';

export default async function HomePage() {
  const products = await getProducts({ limit: 8 });
  const looks = await getTrendingLooks({ limit: 6 });

  return (
    <main>
      <section className="hero">
        <h1>Moda Fitness Feminina</h1>
        <p>Looks exclusivos para você arrasar no treino</p>
      </section>

      <section className="trending-looks">
        <h2>🔥 Looks em Alta</h2>
        <LookGallery looks={looks} />
      </section>

      <section className="new-products">
        <h2>🆕 Novidades</h2>
        <ProductGrid products={products} />
      </section>

      <WhatsAppButton
        number="+5534999999999"
        message="Olá! Vi o site e gostei!"
      />
    </main>
  );
}
```

**Exemplo - Componente WhatsApp:**
```typescript
// components/WhatsAppButton.tsx
'use client';

interface Props {
  number: string;
  message?: string;
}

export default function WhatsAppButton({ number, message }: Props) {
  const handleClick = () => {
    const encodedMessage = encodeURIComponent(message || 'Olá!');
    const url = `https://wa.me/${number}?text=${encodedMessage}`;
    window.open(url, '_blank');
  };

  return (
    <button
      onClick={handleClick}
      className="fixed bottom-6 right-6 bg-green-500 hover:bg-green-600
                 text-white rounded-full p-4 shadow-lg z-50"
    >
      <WhatsAppIcon size={32} />
    </button>
  );
}
```

---

## 📱 CANAL 3: App Mobile (React Native) - VENDEDORA

### Mantém Como Está

**Público:** Vendedora, gerente, dono da loja

**Funcionalidades:**
- ✅ PDV completo
- ✅ Gestão de estoque (entrada, saída, FIFO)
- ✅ Condicionais (try before you buy)
- ✅ Relatórios (vendas, caixa, clientes)
- ✅ Dashboard de métricas
- ✅ Lookbook builder (Fase 2)

**Distribuição:**
- Google Play Store (Android)
- Apple App Store (iOS)
- Expo Go (desenvolvimento/testes)

**Por Que Separar Cliente vs Vendedora?**

| Funcionalidade | Cliente (Web/WhatsApp) | Vendedora (App) |
|----------------|------------------------|-----------------|
| Ver catálogo | ✅ | ✅ |
| Fazer pedido | ✅ (via WhatsApp) | ✅ (PDV) |
| Processar pagamento | ❌ | ✅ |
| Gestão de estoque | ❌ | ✅ |
| Relatórios | ❌ | ✅ |
| Condicionais | ❌ (vendedora faz) | ✅ |

**Vantagens:**
- Cliente não precisa instalar app complexo
- Vendedora tem ferramentas profissionais
- Menos confusão de interfaces
- Manutenção separada (diferentes ritmos)

---

## 🏗️ ARQUITETURA COMPLETA MULTI-CANAL

```
                    ┌─────────────────────┐
                    │   BACKEND FastAPI   │
                    │   (API REST única)  │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  WhatsApp     │     │ Landing Page  │     │  App Mobile   │
│  Business API │     │  (Next.js)    │     │ (React Native)│
│               │     │               │     │               │
├───────────────┤     ├───────────────┤     ├───────────────┤
│ • Chatbot     │     │ • Home        │     │ • PDV         │
│ • Catálogo    │     │ • Produtos    │     │ • Estoque     │
│ • Pedidos     │     │ • Looks       │     │ • Relatórios  │
│ • Alertas     │     │ • Wishlist    │     │ • Dashboard   │
│ • Menu        │     │ • SEO         │     │ • Condicionais│
└───────┬───────┘     └───────┬───────┘     └───────┬───────┘
        │                     │                     │
        │                     │                     │
        ▼                     ▼                     ▼
  CLIENTE FINAL         CLIENTE FINAL          VENDEDORA
  (WhatsApp)            (Browser)              (Celular)
  97% alcance           Explorar visual        Gestão completa
```

**Fluxo Integrado:**
```
1. Cliente vê Instagram → Clica link → Landing Page
2. Navega produtos → Adiciona à wishlist
3. Produto chega → Alerta WhatsApp automático
4. Cliente responde WhatsApp → Vendedora atende via App Mobile
5. Vendedora processa venda no PDV → Cliente recebe confirmação WhatsApp
```

---

## 📅 ROADMAP DE IMPLEMENTAÇÃO MULTI-CANAL

### FASE 0: WhatsApp MVP (1 SEMANA) - **IMPLEMENTAR AGORA**

**Objetivo:** Validar conceito com ZERO investimento

**Dia 1-2: WhatsApp Bot Básico**
```python
# backend/app/webhooks/whatsapp.py
@router.post("/whatsapp")
async def whatsapp_webhook(request: Request):
    data = await request.json()
    message = data['message']['text']

    # Menu simples
    if "catalogo" in message.lower():
        send_whatsapp_message(
            to=data['from'],
            message="Veja nosso catálogo: minhaloja.com.br"
        )

    elif "legging" in message.lower():
        products = await search_products("legging")
        send_product_list(to=data['from'], products=products)

    elif "menu" in message.lower():
        send_menu(to=data['from'])
```

**Dia 3-5: Landing Page Simples**
```typescript
// Next.js - 3 páginas básicas
- Home (grid de produtos)
- Produto individual
- Botão WhatsApp flutuante
```

**Dia 6-7: Integração + Testes**
- Fluxo completo: Site → WhatsApp → Venda
- Testes com 5-10 clientes beta

**Resultado:**
- ✅ Cliente navega site
- ✅ Clica WhatsApp
- ✅ Vendedora atende
- ✅ Venda fechada
- ✅ **ZERO fricção**

### FASE 1: WhatsApp Business Completo (2 SEMANAS)

**Semana 1 - Setup Oficial**
- [ ] Registrar WhatsApp Business API (Meta)
- [ ] Configurar webhook no backend
- [ ] Criar endpoints `/webhooks/whatsapp`
- [ ] Testar envio/recebimento de mensagens
- [ ] Catálogo nativo WhatsApp

**Semana 2 - Features**
- [ ] Chatbot com NLP básico (intenções)
- [ ] Integração com pedidos
- [ ] Notificações de wishlist
- [ ] Menu interativo com botões

### FASE 2: Landing Page Completa (2-3 SEMANAS)

**Setup (3 dias)**
- [ ] Criar projeto Next.js 14
- [ ] Conectar com API FastAPI
- [ ] Design system com Tailwind
- [ ] Componentes base (Product, Look, Wishlist)

**Features (1-2 semanas)**
- [ ] Home page com looks em alta
- [ ] Catálogo de produtos (filtros, busca)
- [ ] Página de produto individual
- [ ] Lookbook gallery (grid de looks)
- [ ] Wishlist (salvar favoritos)
- [ ] Integração WhatsApp (botões, links)

**SEO & Deploy (3 dias)**
- [ ] Meta tags otimizadas
- [ ] Sitemap.xml
- [ ] robots.txt
- [ ] Open Graph (compartilhamento social)
- [ ] Deploy na Vercel
- [ ] Domínio customizado

### FASE 3: Lookbook Features (3 SEMANAS)

**Backend (1 semana)**
- [ ] Models: Look, LookItem, Wishlist
- [ ] Services: LookService, WishlistService
- [ ] Endpoints: `/looks`, `/wishlist`
- [ ] Background jobs: Wishlist notifications

**Frontend Web (1 semana)**
- [ ] Look builder interativo
- [ ] Sugestões de combinações
- [ ] Wishlist com alertas
- [ ] Compartilhamento social

**Frontend Mobile (1 semana)**
- [ ] Continuar evoluindo app vendedora
- [ ] Dashboard de demanda
- [ ] Features exclusivas gestão

---

## 💰 CUSTO TOTAL ESTIMADO

### Investimento Inicial

**Infraestrutura:**
- Landing Page (Vercel): **GRÁTIS** (plano free)
- Domínio (.com.br): **R$ 40/ano**
- SSL: **GRÁTIS** (Let's Encrypt via Vercel)
- Backend (atual): **JÁ RODANDO**

**WhatsApp:**
- **Opção 1 (MVP):** Baileys = **GRÁTIS**
- **Opção 2 (Produção):** Meta Business API = **R$ 0,10/conversa**
- Estimativa: 1000 conversas/mês = **R$ 100/mês**

**App Mobile:**
- Google Play: **USD 25** (taxa única)
- Apple Store: **USD 99/ano**
- Expo EAS Build: **GRÁTIS** (free tier)

**TOTAL ANO 1:**
- Setup: R$ 40 (domínio) + R$ 125 (app stores) = **R$ 165**
- Mensal: R$ 100 (WhatsApp) = **R$ 1.200/ano**
- **TOTAL: R$ 1.365/ano** (~R$ 114/mês)

### ROI vs Custo

**Ganho estimado:** +R$ 192.000/ano
**Custo:** R$ 1.365/ano
**ROI:** **14.000%** 🚀

---

## 🎯 MVP RÁPIDO - IMPLEMENTAR ESTA SEMANA

### Objetivo
Validar conceito com investimento mínimo (1 semana de dev)

### Entregáveis

**1. Landing Page Básica (Next.js)**
```
Home:
- Grid de 12 produtos
- Botão WhatsApp flutuante
- Design responsivo

Produto:
- Fotos + descrição
- Botão "Pedir via WhatsApp"
- Produtos relacionados

Deploy: Vercel (grátis)
URL: minhaloja.vercel.app
```

**2. WhatsApp Bot Simples (Baileys)**
```python
Funcionalidades:
- Receber mensagens
- Responder com link do catálogo
- Menu básico (1-4)
- Escalonar para vendedora

Backend: Endpoint /webhooks/whatsapp
```

**3. Integração Site ↔ WhatsApp**
```
Fluxo:
1. Cliente navega site
2. Clica "Pedir via WhatsApp"
3. WhatsApp abre com mensagem:
   "Olá! Vi o [PRODUTO] no site e gostei!"
4. Vendedora atende
5. Venda fechada
```

### Métricas de Sucesso (Semana 1)

- [ ] 10 clientes testaram o site
- [ ] 5 iniciaram conversa WhatsApp
- [ ] 3 fecharam compra
- [ ] Taxa de conversão: 30%+

**Se funcionar:** Escalar para Fase 1 (WhatsApp oficial + SEO)
**Se não funcionar:** Ajustar e iterar

---

## 📝 PRÓXIMOS PASSOS ATUALIZADOS

### Prioridade IMEDIATA (Esta Semana)

1. ✅ Estratégia completa documentada (Lookbook + Multi-canal)
2. ✅ Branches equalizadas (developer ↔ main)
3. [ ] **MVP Rápido (1 semana):**
   - [ ] Landing Page Next.js básica (3 dias)
   - [ ] WhatsApp Bot com Baileys (2 dias)
   - [ ] Integração Site ↔ WhatsApp (2 dias)
4. [ ] Testar com 10 clientes beta
5. [ ] Validar conversão (meta: 30%+)

### Curto Prazo (2-4 Semanas)

6. [ ] **WhatsApp Business Oficial** (se MVP validar)
   - [ ] Registrar Meta Business API
   - [ ] Catálogo nativo WhatsApp
   - [ ] Chatbot inteligente
7. [ ] **Landing Page Completa**
   - [ ] SEO otimizado
   - [ ] Lookbook gallery
   - [ ] Wishlist funcional
8. [ ] Deploy produção (Vercel + domínio)

### Médio Prazo (1-2 Meses)

9. [ ] **Lookbook Features** (backend + frontend)
   - [ ] Look builder web
   - [ ] Sugestões automáticas
   - [ ] Wishlist com alertas
10. [ ] **App Mobile** (continuar evoluindo)
    - [ ] Dashboard vendedora
    - [ ] Features exclusivas gestão

### Decisão de Go/No-Go

**Checkpoint 1 (Fim da semana 1):**
- Se MVP WhatsApp + Site converter 30%+ → **GO para Fase 1**
- Se não validar → Ajustar e iterar

**Checkpoint 2 (Fim do mês 1):**
- Se sistema completo estável → **Escalar marketing**
- Se problemas técnicos → Corrigir antes de escalar

---

## 🎯 ESTRATÉGIA DE ROLLOUT

### Semana 1: MVP Silencioso
- Testar com 10 clientes próximos
- Ajustar bugs e UX
- NÃO divulgar amplamente

### Semana 2-3: Beta Controlado
- Abrir para 50 clientes
- Coletar feedback
- Iterar rápido

### Semana 4+: Lançamento Público
- Divulgar no Instagram
- Impulsionar posts
- Campanha WhatsApp para base

---

**Documento criado em:** 24/01/2026
**Última atualização:** 24/01/2026 (adicionado estratégia multi-canal + plano de implementação cirúrgico)
**Próxima revisão:** Após MVP (1 semana)

**Versão:** 3.0 - Incluindo WhatsApp, Landing Page, distribuição multi-canal e PLANO DE IMPLEMENTAÇÃO EXECUTÁVEL

---

# 🎯 PLANO DE IMPLEMENTAÇÃO CIRÚRGICO - FASE 0 (1 SEMANA)

**Status:** Pronto para execução
**Data:** 24/01/2026
**Objetivo:** Validar conceito Lookbook com investimento zero

---

## 🏗️ ARQUITETURA DA FASE 0

```
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  Landing Page    │      │  Backend FastAPI │      │  WhatsApp Bot    │
│  (Next.js 14)    │─────▶│  (JÁ EXISTE)     │◀─────│  (Baileys)       │
│                  │ REST  │                  │ POST │                  │
│ web/             │ API   │ /webhooks/       │      │ whatsapp_bot/    │
└──────────────────┘      └──────────────────┘      └──────────────────┘
        │                          │                          │
        ▼                          ▼                          ▼
   CLIENTE WEB              API ENDPOINTS              CLIENTE WHATSAPP
```

**Benefícios:**
- ✅ **Zero mudanças no backend** - API já existe e funciona
- ✅ **Zero fricção para cliente** - Já usa WhatsApp
- ✅ **Validação rápida** - 1 semana para provar conceito
- ✅ **Investimento zero** - Vercel grátis + Baileys open source

---

## 📅 ROADMAP EXECUTÁVEL (7 DIAS)

### **DIA 1-2: Landing Page Next.js** 🚀 PRIORIDADE MÁXIMA

#### Setup Inicial
```powershell
# Criar projeto Next.js
cd c:\Users\Victor\Desktop\fitness-store-management
npx create-next-app@latest web --typescript --tailwind --app

# Opções durante setup:
- TypeScript: Yes
- ESLint: Yes
- Tailwind CSS: Yes
- App Router: Yes
- Import alias: @/* (default)
```

#### Arquivos a Criar

**1. `web/services/api.ts`** - Cliente API (reaproveitar do mobile)
```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1',
  timeout: 10000,
});

export const getProducts = async (params?: { limit?: number; offset?: number; search?: string }) => {
  const response = await api.get('/products', { params });
  return response.data;
};

export const getProduct = async (id: number) => {
  const response = await api.get(`/products/${id}`);
  return response.data;
};

export default api;
```

**2. `web/components/ProductCard.tsx`** - Card de produto
```typescript
import Image from 'next/image';
import Link from 'next/link';

interface Product {
  id: number;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
}

export default function ProductCard({ product }: { product: Product }) {
  return (
    <Link href={`/produtos/${product.id}`}>
      <div className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
        <div className="aspect-square relative mb-4">
          <Image
            src={product.image_url || '/placeholder.png'}
            alt={product.name}
            fill
            className="object-cover rounded"
          />
        </div>
        <h3 className="font-semibold text-lg mb-2">{product.name}</h3>
        {product.description && (
          <p className="text-gray-600 text-sm mb-2 line-clamp-2">
            {product.description}
          </p>
        )}
        <p className="text-xl font-bold text-primary">
          R$ {product.price.toFixed(2)}
        </p>
      </div>
    </Link>
  );
}
```

**3. `web/components/ProductGrid.tsx`** - Grid de produtos
```typescript
import ProductCard from './ProductCard';

interface Product {
  id: number;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
}

export default function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
```

**4. `web/components/WhatsAppButton.tsx`** - Botão flutuante
```typescript
'use client';

import { MessageCircle } from 'lucide-react';

interface Props {
  phone: string;
  message?: string;
}

export default function WhatsAppButton({ phone, message }: Props) {
  const handleClick = () => {
    const text = encodeURIComponent(message || 'Olá! Vi o site e gostei!');
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };

  return (
    <button
      onClick={handleClick}
      className="fixed bottom-6 right-6 bg-green-500 hover:bg-green-600 
                 text-white rounded-full p-4 shadow-lg z-50 
                 transition-all hover:scale-110"
      aria-label="Contato via WhatsApp"
    >
      <MessageCircle size={28} />
    </button>
  );
}
```

**5. `web/app/page.tsx`** - Home page
```typescript
import { getProducts } from '@/services/api';
import ProductGrid from '@/components/ProductGrid';
import WhatsAppButton from '@/components/WhatsAppButton';

export default async function HomePage() {
  const products = await getProducts({ limit: 12 });

  return (
    <main className="container mx-auto px-4 py-8">
      <header className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">
          🏋️‍♀️ Moda Fitness Feminina
        </h1>
        <p className="text-xl text-gray-600">
          Looks exclusivos para você arrasar no treino
        </p>
      </header>

      <section>
        <h2 className="text-2xl font-semibold mb-6">🔥 Produtos em Destaque</h2>
        <ProductGrid products={products} />
      </section>

      <WhatsAppButton 
        phone="5534999999999" 
        message="Olá! Vi o site e gostei!"
      />
    </main>
  );
}
```

**6. `web/app/produtos/[id]/page.tsx`** - Página do produto
```typescript
import { getProduct, getProducts } from '@/services/api';
import Image from 'next/image';
import WhatsAppButton from '@/components/WhatsAppButton';

export default async function ProductPage({ params }: { params: { id: string } }) {
  const product = await getProduct(parseInt(params.id));

  const whatsappMessage = `Olá! Vi o produto "${product.name}" no site e gostei! Link: ${process.env.NEXT_PUBLIC_SITE_URL}/produtos/${product.id}`;

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="grid md:grid-cols-2 gap-8">
        <div className="aspect-square relative">
          <Image
            src={product.image_url || '/placeholder.png'}
            alt={product.name}
            fill
            className="object-cover rounded-lg"
          />
        </div>

        <div>
          <h1 className="text-3xl font-bold mb-4">{product.name}</h1>
          
          {product.description && (
            <p className="text-gray-600 mb-6">{product.description}</p>
          )}

          <p className="text-4xl font-bold text-primary mb-8">
            R$ {product.price.toFixed(2)}
          </p>

          <button
            onClick={() => {
              const text = encodeURIComponent(whatsappMessage);
              window.open(`https://wa.me/5534999999999?text=${text}`, '_blank');
            }}
            className="w-full bg-green-500 hover:bg-green-600 text-white 
                       py-4 rounded-lg font-semibold text-lg 
                       transition-colors flex items-center justify-center gap-2"
          >
            <MessageCircle size={24} />
            Pedir via WhatsApp
          </button>
        </div>
      </div>

      <WhatsAppButton phone="5534999999999" message={whatsappMessage} />
    </main>
  );
}
```

**7. `web/.env.local`** - Variáveis de ambiente
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_WHATSAPP_NUMBER=5534999999999
```

#### Comandos de Desenvolvimento
```powershell
cd web
npm run dev  # Abre em http://localhost:3000
```

---

### **DIA 3-4: WhatsApp Bot (Baileys)**

#### Setup Backend Webhook

**1. `backend/app/webhooks/__init__.py`**
```python
# Empty file to make it a package
```

**2. `backend/app/webhooks/whatsapp.py`**
```python
"""
Webhook para receber mensagens do WhatsApp Bot.
"""
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


class WhatsAppMessage(BaseModel):
    from_number: str
    message: str
    timestamp: Optional[str] = None


class WhatsAppResponse(BaseModel):
    to: str
    message: str


@router.post("/whatsapp")
async def whatsapp_webhook(payload: WhatsAppMessage):
    """
    Recebe mensagens do WhatsApp Bot e processa.
    
    Fluxo:
    1. Bot recebe mensagem do cliente
    2. Bot envia para este webhook
    3. Webhook processa (busca produto, menu, etc)
    4. Retorna resposta
    5. Bot envia resposta para cliente
    """
    message_text = payload.message.lower().strip()
    
    # Menu principal
    if any(word in message_text for word in ['menu', 'oi', 'olá', 'ola']):
        response = """
Olá! 👋 Bem-vindo à nossa loja!

Digite:
1️⃣ - Ver catálogo completo
2️⃣ - Novidades
3️⃣ - Falar com vendedora

Ou digite o nome do produto que procura!
        """
    
    # Catálogo
    elif message_text in ['1', 'catalogo', 'catálogo', 'produtos']:
        site_url = "https://minhaloja.vercel.app"  # Atualizar após deploy
        response = f"🛍️ Veja nosso catálogo completo:\n{site_url}"
    
    # Novidades
    elif message_text in ['2', 'novidades', 'novo']:
        response = "🆕 Chegou Legging High Waist em 3 cores novas! Quer saber mais?"
    
    # Vendedora
    elif message_text in ['3', 'vendedora', 'atendimento']:
        response = "📱 Aguarde, vou chamar nossa vendedora para te atender!"
    
    # Busca de produto (básico)
    elif any(word in message_text for word in ['legging', 'top', 'conjunto']):
        response = f"Encontrei produtos relacionados a '{message_text}'! 🔍\n\nVeja no site: https://minhaloja.vercel.app"
    
    # Default
    else:
        response = "Não entendi 😅 Digite MENU para ver as opções!"
    
    return WhatsAppResponse(to=payload.from_number, message=response)


@router.get("/whatsapp/health")
async def webhook_health():
    """Health check do webhook."""
    return {"status": "ok", "service": "whatsapp_webhook"}
```

**3. Registrar webhook no main.py**
```python
# backend/app/main.py (adicionar)
from app.webhooks import whatsapp

# Incluir router
app.include_router(whatsapp.router)
```

#### Setup WhatsApp Bot (Baileys)

**1. `backend/whatsapp_bot/package.json`**
```json
{
  "name": "whatsapp-bot",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "@whiskeysockets/baileys": "^6.6.0",
    "qrcode-terminal": "^0.12.0",
    "axios": "^1.6.0",
    "dotenv": "^16.3.1"
  }
}
```

**2. `backend/whatsapp_bot/.env`**
```env
WEBHOOK_URL=http://localhost:8000/webhooks/whatsapp
```

**3. `backend/whatsapp_bot/index.js`**
```javascript
import { makeWASocket, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const WEBHOOK_URL = process.env.WEBHOOK_URL;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('📱 Escaneie o QR Code com seu WhatsApp:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('❌ Conexão fechada. Reconectando...', shouldReconnect);
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('✅ Conectado ao WhatsApp!');
    }
  });

  // Receber mensagens
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];

    if (!msg.message || msg.key.fromMe) return; // Ignorar mensagens próprias

    const from = msg.key.remoteJid;
    const messageText = msg.message.conversation || 
                       msg.message.extendedTextMessage?.text || 
                       '';

    console.log(`📩 Mensagem de ${from}: ${messageText}`);

    try {
      // Enviar para webhook
      const response = await axios.post(WEBHOOK_URL, {
        from_number: from,
        message: messageText,
        timestamp: new Date().toISOString(),
      });

      // Enviar resposta
      const replyText = response.data.message;
      await sock.sendMessage(from, { text: replyText });
      console.log(`✅ Resposta enviada: ${replyText}`);

    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error.message);
      await sock.sendMessage(from, { 
        text: 'Desculpe, ocorreu um erro. Digite MENU para tentar novamente.' 
      });
    }
  });
}

// Iniciar bot
connectToWhatsApp().catch(console.error);
```

#### Comandos para Rodar

```powershell
# Terminal 1 - Backend (webhook)
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload

# Terminal 2 - WhatsApp Bot
cd backend\whatsapp_bot
npm install
npm start
# Escanear QR Code com WhatsApp
```

---

### **DIA 5: Integração Site ↔ WhatsApp**

#### Melhorias nos Componentes

**Mensagem Dinâmica por Produto:**
```typescript
// web/app/produtos/[id]/page.tsx (já incluído acima)
const whatsappMessage = `Olá! Vi o produto "${product.name}" no site e gostei!`;
```

**Botão Flutuante Contextual:**
```typescript
// web/components/WhatsAppButton.tsx
// Adaptar mensagem baseado na página atual
```

#### Testes de Integração

**Fluxo Completo:**
1. Cliente acessa site → `localhost:3000`
2. Navega produtos → Clica em produto
3. Clica "Pedir via WhatsApp"
4. WhatsApp abre com mensagem pré-preenchida
5. Cliente envia mensagem
6. Bot recebe → Webhook processa → Bot responde
7. Vendedora atende (se necessário)

---

### **DIA 6-7: Deploy + Testes com Clientes**

#### Deploy Landing Page (Vercel)

**Comandos:**
```powershell
cd web

# Instalar Vercel CLI
npm i -g vercel

# Deploy
vercel

# Configurar variáveis de ambiente no dashboard:
# NEXT_PUBLIC_API_URL = https://seu-backend.com/api/v1
# NEXT_PUBLIC_WHATSAPP_NUMBER = 5534999999999
```

**Resultado:**
- URL: `https://minhaloja.vercel.app`
- SSL: Automático (HTTPS)
- CDN: Global

#### Testes com Clientes Beta (5-10 pessoas)

**Checklist de Testes:**
- [ ] Site carrega em mobile
- [ ] Site carrega em desktop
- [ ] Produtos aparecem corretamente
- [ ] Imagens carregam
- [ ] Botão WhatsApp funciona
- [ ] Mensagem pré-preenchida está correta
- [ ] Bot responde mensagens
- [ ] Menu funciona
- [ ] Vendedora consegue atender

**Métricas de Sucesso:**
- [ ] 5+ clientes testaram
- [ ] 3+ conversões (vendas)
- [ ] Taxa de conversão: **60%+**
- [ ] Feedback positivo

---

## 📂 ESTRUTURA FINAL DE ARQUIVOS

```
fitness-store-management/
│
├── backend/                        # Backend FastAPI (JÁ EXISTE)
│   ├── app/
│   │   ├── api/
│   │   ├── models/
│   │   ├── services/
│   │   └── webhooks/              # ⚡ NOVO
│   │       ├── __init__.py
│   │       └── whatsapp.py        # Webhook endpoint
│   │
│   └── whatsapp_bot/              # ⚡ NOVO
│       ├── index.js               # Baileys script
│       ├── package.json
│       ├── .env
│       └── auth_info_baileys/     # Dados de autenticação (auto-gerado)
│
├── mobile/                         # App React Native (JÁ EXISTE)
│
└── web/                           # ⚡ NOVO PROJETO
    ├── app/
    │   ├── page.tsx               # Home
    │   ├── produtos/
    │   │   └── [id]/
    │   │       └── page.tsx       # Produto individual
    │   ├── layout.tsx
    │   └── globals.css
    │
    ├── components/
    │   ├── WhatsAppButton.tsx     # Botão flutuante
    │   ├── ProductCard.tsx        # Card produto
    │   └── ProductGrid.tsx        # Grid produtos
    │
    ├── services/
    │   └── api.ts                 # Cliente Axios
    │
    ├── public/
    │   └── placeholder.png        # Imagem padrão
    │
    ├── .env.local                 # Variáveis ambiente
    ├── next.config.js
    ├── tailwind.config.ts
    ├── tsconfig.json
    └── package.json
```

---

## ✅ CRITÉRIOS DE VALIDAÇÃO (CHECKPOINT SEMANA 1)

### Técnicos
- [ ] Site no ar: `https://minhaloja.vercel.app`
- [ ] Backend webhook funcionando: `POST /webhooks/whatsapp`
- [ ] WhatsApp Bot conectado e respondendo
- [ ] Integração completa: Site → WhatsApp → Webhook → Resposta

### Negócio
- [ ] 10 produtos visíveis no catálogo
- [ ] 5+ clientes testaram o fluxo completo
- [ ] 3+ vendas realizadas (taxa 60%+)
- [ ] Tempo médio de resposta < 2 minutos
- [ ] Feedback positivo dos clientes

### Decisão Go/No-Go

**SE VALIDAR (>60% conversão):**
→ Partir para **FASE 1** (WhatsApp Business oficial + Lookbook models + SEO)

**SE NÃO VALIDAR (<60% conversão):**
→ Analisar gargalos:
- Problema no fluxo? Ajustar UX
- Mensagens confusas? Melhorar bot
- Produtos pouco atrativos? Revisar catálogo
→ Iterar e testar novamente (1-2 dias)

---

## 💰 INVESTIMENTO TOTAL (FASE 0)

### Infraestrutura
- **Landing Page (Vercel):** GRÁTIS (plano free até 100GB bandwidth/mês)
- **Backend:** JÁ RODANDO (sem custos adicionais)
- **WhatsApp Bot (Baileys):** GRÁTIS (open source, self-hosted)
- **Domínio:** R$ 40/ano (opcional para MVP, pode usar `.vercel.app`)

### Desenvolvimento
- **Tempo:** 1 semana (40 horas)
- **Custo:** R$ 0 (você mesmo desenvolve)

### TOTAL MVP: **R$ 0-40** (dependendo se comprar domínio)

---

## 🚀 PRÓXIMO PASSO IMEDIATO

Execute AGORA:

```powershell
cd c:\Users\Victor\Desktop\fitness-store-management
npx create-next-app@latest web --typescript --tailwind --app
```

**Após setup:**
1. Criar arquivos listados na seção DIA 1-2
2. Testar localmente: `npm run dev`
3. Verificar integração com backend `http://localhost:8000`
4. Partir para WhatsApp Bot (DIA 3-4)

---

## 📊 MÉTRICAS A ACOMPANHAR (DASHBOARD)

**Durante MVP (Semana 1):**
- Visitas ao site (Google Analytics)
- Cliques no botão WhatsApp (event tracking)
- Conversas iniciadas (contador bot)
- Mensagens processadas (webhook logs)
- Vendas fechadas (manual)
- Taxa de conversão: `(vendas / visitas) * 100`

**Meta FASE 0:**
- 50+ visitas ao site
- 20+ cliques WhatsApp (40% CTR)
- 10+ conversas iniciadas (50% engagement)
- 6+ vendas (60% conversão) ✅

---

## 🔧 TROUBLESHOOTING COMUM

### Problema 1: Next.js não compila
**Solução:** Verificar versões Node.js (18+) e npm (9+)

### Problema 2: API não retorna produtos
**Solução:** 
```powershell
# Verificar se backend está rodando
curl http://localhost:8000/api/v1/products
```

### Problema 3: WhatsApp Bot desconecta
**Solução:** Manter terminal aberto, verificar internet, re-escanear QR Code

### Problema 4: Webhook não recebe mensagens
**Solução:** 
- Verificar URL webhook no `.env`
- Testar manualmente: `curl -X POST http://localhost:8000/webhooks/whatsapp`
- Ver logs do backend

### Problema 5: Vercel deploy falha
**Solução:**
- Verificar `.env.local` está no `.gitignore`
- Configurar variáveis no dashboard Vercel
- Ver logs: `vercel logs`

---

## 📚 REFERÊNCIAS TÉCNICAS

### Documentação
- Next.js 14: https://nextjs.org/docs
- Baileys: https://github.com/WhiskeySockets/Baileys
- Vercel: https://vercel.com/docs
- FastAPI Webhooks: https://fastapi.tiangolo.com/

### Exemplos de Código
- Next.js Commerce: https://vercel.com/templates/next.js/nextjs-commerce
- WhatsApp Bot Examples: https://github.com/WhiskeySockets/Baileys/tree/master/Example

---

## 🎯 EVOLUÇÃO PÓS-MVP (FASE 1+)

**Se MVP validar, próximos passos:**

### FASE 1: Landing Page Avançada (1 semana)
- SEO completo (meta tags, sitemap, structured data)
- Lookbook gallery (grid de looks)
- Wishlist (salvar favoritos)
- Filtros e busca avançada
- Blog de conteúdo (atração orgânica)

### FASE 2: WhatsApp Business Oficial (1 semana)
- Migrar de Baileys → Meta Business API
- Catálogo nativo WhatsApp
- Chatbot com NLP (intents, entities)
- Analytics oficial (Facebook Business)
- Pagamentos via WhatsApp Pay

### FASE 3: Lookbook Backend + Features (2 semanas)
- Models: Look, LookItem, Wishlist, ProductTag
- Services: LookService, WishlistService, SuggestionService
- Endpoints: `/looks`, `/wishlist`, `/suggestions`
- Background jobs: Notificações automáticas
- Dashboard vendedora: Demanda agregada

### FASE 4: App Mobile Cliente (2-3 semanas)
- Versão mobile nativa do site (Expo)
- Push notifications
- Lookbook builder interativo
- Try before you buy (condicional de looks)

---

## 🏁 CONCLUSÃO

Este plano de implementação é **100% executável** e **cirúrgico** - sem retrabalho, sem voltar atrás.

**Vantagens:**
✅ Validação rápida (1 semana)
✅ Investimento zero (R$ 0-40)
✅ Sem alterar backend (API já pronta)
✅ Cliente já usa WhatsApp (zero fricção)
✅ Escalável (facil evoluir para Fase 1+)

**Próximo comando:**
```powershell
npx create-next-app@latest web --typescript --tailwind --app
```

**Sucesso está a 1 semana de distância!** 🚀

---

**Versão do Plano:** 1.0
**Data de Criação:** 24/01/2026
**Status:** Pronto para execução imediata

