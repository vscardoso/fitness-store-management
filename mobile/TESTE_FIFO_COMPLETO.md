# 📱 Guia de Teste: Fluxo FIFO Completo (AI Scanner)

## ✅ O Que Foi Implementado

### 1. AI Scanner com Preços Dinâmicos
- **Antes**: Sempre sugeria R$ 35 (custo) e R$ 70 (venda)
- **Depois**: Analisa produto e sugere preços baseados em:
  - Tipo de produto
  - Marca visível
  - Qualidade percebida
  - Material
  - Fornece justificativa do preço

### 2. Nome Limpo (Sem Cor/Tamanho)
- **Antes**: "Legging Fitness Preta M"
- **Depois**: "Legging Fitness Cintura Alta"
  - Cor: "Preta" (campo separado)
  - Tamanho: "M" (campo separado)

### 3. Tamanho Nullable
- **Antes**: "Desconhecido" quando não identificável
- **Depois**: `null` (campo vazio)

### 4. Pré-preenchimento do Formulário
- **Antes**: Clicar "Editar" abria formulário vazio
- **Depois**: Todos os campos preenchidos com dados da IA

### 5. Fluxo FIFO Obrigatório
- **Antes**: Criar produto → sucesso → (opcional: adicionar estoque)
- **Depois**: Criar produto → entrada de estoque (FIFO) → sucesso explicativo

---

## 🧪 Como Testar no Mobile

### Pré-requisitos
```powershell
# Terminal 1: Backend rodando
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2: Mobile rodando
cd mobile
.\expo-dev.ps1
```

### Teste 1: Análise de Produto com Preço Dinâmico

**Passos:**
1. Abrir app → Login (admin@fitness.com / admin123)
2. Ir para aba **Produtos**
3. Clicar no botão **"Scanner IA"** (ícone de câmera com estrela)
4. Escolher **"Escolher da Galeria"**
5. Selecionar uma foto de produto de fitness (legging, top, whey, etc.)

**Resultado Esperado:**
```
✅ Nome limpo (sem cor/tamanho)
   Ex: "Legging Fitness Cintura Alta"
   
✅ Cor em campo separado
   Ex: "Preta" ou "Azul"
   
✅ Tamanho em campo separado ou vazio
   Ex: "M" ou (vazio se não identificável)
   
✅ Preços dinâmicos
   Ex: R$ 30,00 (custo) / R$ 59,90 (venda)
   
✅ Justificativa visível
   Ex: "Produto sem marca visível, legging básica. Markup 100%"
```

**❌ O QUE ESTÁ ERRADO?**
- Nome com cor: "Legging Preta M"
- Tamanho "Desconhecido" (deve estar vazio)
- Preço sempre 35/70 (deve variar)

---

### Teste 2: Editar Dados Sugeridos

**Passos:**
1. Após análise da IA, clicar **"Editar"**
2. Verificar formulário

**Resultado Esperado:**
```
✅ TODOS os campos preenchidos:
   - Nome: "Legging Fitness..."
   - SKU: Gerado automaticamente
   - Marca: (se identificada)
   - Cor: "Preta" (campo separado)
   - Tamanho: "M" ou vazio (campo separado)
   - Categoria: Selecionada automaticamente
   - Custo: R$ 30,00
   - Venda: R$ 59,90
   - Descrição: Gerada pela IA
```

**❌ O QUE ESTÁ ERRADO?**
- Campos vazios quando deviam estar preenchidos
- Cor/tamanho no campo Nome

---

### Teste 3: Fluxo FIFO Obrigatório

**Passos:**
1. Após análise, clicar **"Criar Produto"**
2. Aguardar criação

**Resultado Esperado:**
```
✅ Tela de entrada de estoque DEVE abrir automaticamente
✅ Formulário deve estar pré-preenchido com:
   - Produto selecionado (o que acabou de criar)
   - Quantidade: 1
   - Tipo de entrada: "local" (padrão)
   
⚠️ IMPORTANTE: Usuário DEVE preencher entrada antes de continuar
```

**❌ O QUE ESTÁ ERRADO?**
- Mostra "Sucesso" sem pedir entrada de estoque
- Produto criado sem rastreabilidade
- Sistema permite voltar sem criar entrada

---

### Teste 4: Criação de Entrada FIFO

**Passos:**
1. Na tela de entrada (que abriu automaticamente):
2. Preencher campos obrigatórios:
   - **Código da Entrada**: Ex: "ENTRADA-001"
   - **Tipo**: "Compra Local" (já selecionado)
   - **Fornecedor**: Ex: "Fornecedor Teste"
   - **Quantidade**: Ex: 10
   - **Custo Unitário**: Ex: R$ 30,00
   - **Preço de Venda**: Ex: R$ 59,90
3. Clicar **"Salvar Entrada"**

**Resultado Esperado:**
```
✅ Dialog de sucesso com mensagem especial:
   
   🎉 Produto Criado com Sucesso FIFO!
   
   Produto escaneado foi cadastrado e vinculado à entrada!
   
   ✅ Produto criado no catálogo
   ✅ Entrada de estoque vinculada (FIFO)
   ✅ Rastreabilidade completa garantida
   
   📊 Você pode acompanhar:
     • Custo real por venda (FIFO)
     • ROI por entrada/viagem
     • Sell-Through Rate
   
   Cada venda usará o estoque da entrada mais antiga (FIFO)
   
   [Ver Produto] [Escanear Outro]
```

**❌ O QUE ESTÁ ERRADO?**
- Dialog genérico sem mencionar FIFO
- Não explica benefícios de rastreabilidade
- Botões errados ("OK" ao invés de "Ver Produto" / "Escanear Outro")

---

### Teste 5: Navegação Pós-Sucesso

**Passos:**
1. No dialog de sucesso, clicar **"Ver Produto"**

**Resultado Esperado:**
```
✅ Navega para tela de detalhes do produto criado
✅ Mostra informações completas:
   - Nome, SKU, Marca
   - Cor, Tamanho
   - Preços
   - Estoque: 10 unidades
```

---

**Passos (alternativa):**
1. No dialog de sucesso, clicar **"Escanear Outro"**

**Resultado Esperado:**
```
✅ Volta para tela do Scanner IA
✅ Pronto para escanear outro produto
```

---

## 🐛 Problemas Comuns e Soluções

### Problema 1: "Campos vazios ao editar"
**Causa**: `prefillData` não está sendo lido corretamente
**Solução**: Verificar `mobile/app/products/add.tsx`
```typescript
const { prefillData } = useLocalSearchParams();

useEffect(() => {
  if (prefillData && typeof prefillData === 'string') {
    const data = JSON.parse(prefillData);
    // ... preencher campos
  }
}, [prefillData]);
```

---

### Problema 2: "Não redireciona para entrada"
**Causa**: `useAIScanner` não está usando `router.replace`
**Solução**: Verificar `mobile/hooks/useAIScanner.ts`
```typescript
router.replace({
  pathname: '/entries/add',
  params: {
    fromAIScanner: 'true',  // ← OBRIGATÓRIO
    preselectedProductData: JSON.stringify(created),
    // ...
  },
});
```

---

### Problema 3: "Dialog não mostra FIFO"
**Causa**: Tela de entrada não detecta origem do Scanner
**Solução**: Verificar `mobile/app/entries/add.tsx`
```typescript
const [isFromAIScanner, setIsFromAIScanner] = useState(false);

useEffect(() => {
  if (params.fromAIScanner === 'true') {
    setIsFromAIScanner(true);  // ← Ativa mensagem FIFO
  }
}, [params.fromAIScanner]);
```

---

### Problema 4: "Preços sempre 35/70"
**Causa**: Backend não está com prompt atualizado
**Solução**: 
1. Parar backend (Ctrl+C)
2. Verificar `backend/app/services/ai_scan_service.py`
3. Garantir que tem seção "Estimativa de Preço"
4. Reiniciar backend

---

### Problema 5: "Size tem 'Desconhecido'"
**Causa**: Backend retorna string ao invés de null
**Solução**: Verificar prompt em `ai_scan_service.py`
```python
"size": "PP|P|M|G|GG|XGG ou null se não identificável"
```

---

## ✅ Checklist de Validação

Marque cada item após testar:

### AI Scanner
- [ ] Nome sem cor/tamanho
- [ ] Cor em campo separado
- [ ] Tamanho em campo separado ou vazio
- [ ] Preços dinâmicos (não sempre 35/70)
- [ ] Justificativa de preço visível

### Edição
- [ ] Clicar "Editar" preenche o formulário
- [ ] Todos os campos estão corretos
- [ ] Cor e tamanho nos campos corretos

### FIFO Flow
- [ ] Após criar produto, abre tela de entrada
- [ ] Formulário de entrada pré-preenchido
- [ ] Sistema força criação de entrada (não permite pular)

### Entrada FIFO
- [ ] Consegue preencher entrada normalmente
- [ ] Ao salvar, mostra dialog especial
- [ ] Dialog explica FIFO e rastreabilidade
- [ ] Botões corretos: "Ver Produto" e "Escanear Outro"

### Navegação
- [ ] "Ver Produto" vai para detalhes do produto
- [ ] "Escanear Outro" volta para scanner
- [ ] Produto tem estoque correto
- [ ] Rastreabilidade funcionando

---

## 📊 Métricas de Sucesso

**Objetivo: Zero produtos sem entrada de estoque**

Para verificar:
```sql
-- Verificar produtos sem entrada
SELECT p.id, p.name, i.quantity
FROM products p
LEFT JOIN inventory i ON i.product_id = p.id
LEFT JOIN entry_items ei ON ei.product_id = p.id
WHERE ei.id IS NULL
AND p.is_active = true;

-- ✅ Resultado esperado: 0 linhas
```

**Objetivo: 100% dos produtos têm rastreabilidade**

Para verificar:
```sql
-- Produtos com rastreabilidade completa
SELECT 
  p.name,
  se.entry_code,
  se.entry_type,
  ei.quantity_received,
  ei.quantity_remaining
FROM products p
JOIN entry_items ei ON ei.product_id = p.id
JOIN stock_entries se ON se.id = ei.entry_id
WHERE p.is_active = true;

-- ✅ Deve mostrar TODOS os produtos criados via Scanner
```

---

## 🎯 Resumo: O Que Mudou

| Aspecto | Antes | Depois |
|---------|-------|--------|
| **Preços** | Fixos (35/70) | Dinâmicos (baseados em análise) |
| **Nome** | Com cor/tamanho | Limpo (sem cor/tamanho) |
| **Size vazio** | "Desconhecido" | `null` (vazio) |
| **Editar** | Formulário vazio | Pré-preenchido |
| **Fluxo** | Criar → Sucesso | Criar → Entrada → Sucesso |
| **FIFO** | Opcional | Obrigatório |
| **Rastreabilidade** | Parcial | 100% |

---

## 📞 Suporte

**Se algo não funcionar:**
1. ✅ Verificar backend rodando: `http://localhost:8000/docs`
2. ✅ Verificar logs do mobile: Terminal Expo
3. ✅ Consultar arquivos modificados:
   - `backend/app/services/ai_scan_service.py`
   - `mobile/hooks/useAIScanner.ts`
   - `mobile/app/products/add.tsx`
   - `mobile/app/products/scan.tsx`
   - `mobile/app/entries/add.tsx`

**Teste backend direto:**
```powershell
# Login
$response = curl.exe -X POST "http://localhost:8000/api/v1/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@fitness.com","password":"admin123"}'
$token = ($response | ConvertFrom-Json).access_token

# Testar scan
curl.exe -X POST "http://localhost:8000/api/v1/ai/scan-product?suggest_price=true" -H "Authorization: Bearer $token" -F "image=@test_image.jpg"
```

---

**✅ Pronto para testar! Qualquer problema, consulte este guia.**
