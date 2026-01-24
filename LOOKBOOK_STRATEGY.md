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

## 📝 PRÓXIMOS PASSOS

1. ✅ Estratégia documentada
2. [ ] Equalizar branches (developer ↔ main)
3. [ ] Criar feature branch: `feature/lookbook-wishlist`
4. [ ] Implementar Fase 1 (MVP)
5. [ ] Testar com cliente beta
6. [ ] Lançar oficialmente

---

**Documento criado em:** 24/01/2026
**Última atualização:** 24/01/2026
**Próxima revisão:** Após implementação Fase 1
