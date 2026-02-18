# Work In Progress (WIP)

## Status Atual: Sistema de Etiquetas com QR Code

### Resumo

Implementação de sistema de etiquetas com QR Code para produtos, permitindo:
- Gerar etiquetas impressas com QR Code
- Escanear etiquetas na tela de vendas para adicionar produtos ao carrinho
- Compartilhar/imprimir etiquetas

---

## Funcionalidades Implementadas

### 1. Componente de Etiqueta (`mobile/components/labels/ProductLabel.tsx`)

Componente visual da etiqueta com:
- QR Code contendo JSON: `{"id": 123, "sku": "ABC-001", "type": "product"}`
- Nome do produto
- Preço (opcional)
- SKU (opcional)
- 3 tamanhos: pequena (150px), média (200px), grande (280px)

### 2. Tela de Geração de Etiqueta (`mobile/app/products/label/[id].tsx`)

Permite:
- Visualizar preview da etiqueta
- Escolher tamanho (P/M/G)
- Escolher quantidade (1-50)
- Mostrar/ocultar preço e SKU
- Compartilhar como imagem (PNG)
- Imprimir (via compartilhamento)

**Acesso:** Tela de detalhes do produto -> Card "Etiqueta do Produto" -> Botão "Gerar Etiqueta"

### 3. Scanner de QR Code (`mobile/components/sale/QRCodeScanner.tsx`)

Scanner fullscreen para vendas:
- Abre câmera com área de scan destacada
- Lê QR Code da etiqueta
- Busca produto pelo ID ou SKU
- Mostra modal de confirmação com quantidade
- Adiciona ao carrinho automaticamente

**Acesso:** Tela de vendas -> Botão "Escanear" (ao lado do botão de buscar produtos)

### 4. Integração na Tela de Vendas (`mobile/app/(tabs)/sale.tsx`)

- Botão de scanner QR Code ao lado do botão de busca
- Handler `handleProductScanned(product, quantity)` recebe produto e quantidade
- Feedback de sucesso ao adicionar

---

## Fluxo Completo

### Gerando Etiqueta:
```
1. Lista de Produtos -> Selecionar produto
2. Tela de Detalhes -> Card "Etiqueta do Produto"
3. Botão "Gerar Etiqueta"
4. Configurar tamanho e quantidade
5. Compartilhar/Imprimir
```

### Usando Etiqueta na Venda:
```
1. Tela de Vendas
2. Botão "Escanear" (ícone QR Code)
3. Aponta câmera para etiqueta
4. Produto identificado automaticamente
5. Escolhe quantidade (1, 2, 3...)
6. Adiciona ao carrinho
7. Pode escanear mais produtos ou finalizar
```

---

## Dependências Necessárias

```bash
cd mobile
npm install react-native-qrcode-svg react-native-svg react-native-view-shot
```

**Já instaladas:**
- `expo-camera` - Para leitura de QR Code
- `expo-sharing` - Para compartilhar imagem da etiqueta

---

## Arquivos Criados/Modificados

### Novos:
| Arquivo | Descrição |
|---------|-----------|
| `mobile/components/labels/ProductLabel.tsx` | Componente visual da etiqueta |
| `mobile/app/products/label/[id].tsx` | Tela de geração de etiqueta |
| `mobile/components/sale/QRCodeScanner.tsx` | Scanner de QR Code para vendas |

### Modificados:
| Arquivo | Mudança |
|---------|---------|
| `mobile/app/(tabs)/sale.tsx` | Adicionado botão de scanner QR e integração |
| `mobile/app/products/[id].tsx` | Adicionado card "Gerar Etiqueta" |

---

## Outras Melhorias Implementadas (Sessão Anterior)

### Geração Automática de SKU
- SKU gerado automaticamente em todos os casos (manual e IA)
- Padrão: `[MARCA]-[NOME]-[COR]-[TAM]-XXX`
- Botão para regenerar SKU no Step 2 do wizard

### Detecção de Duplicados Melhorada
- 5 estratégias de busca em vez de apenas substring no nome
- Busca por: barcode, marca+cor+tamanho, categoria+atributos, similaridade de nome

### Edição de Itens em Entradas
- Botão de editar mais visível com texto "Editar" ou "Protegido"
- Visual claro de itens bloqueados (com vendas)

---

## Próximos Passos

1. [ ] Testar scanner em dispositivo físico
2. [ ] Testar impressão via compartilhamento
3. [ ] Considerar integração com impressoras térmicas (futuro)
4. [ ] Adicionar suporte a código de barras EAN-13 (se necessário)

---

## Notas Técnicas

### Formato do QR Code
```json
{
  "id": 123,
  "sku": "LEG-FIT-001",
  "type": "product"
}
```

O scanner aceita tanto JSON quanto SKU direto (fallback).

### Permissões
O app precisa de permissão de câmera para o scanner funcionar.
O componente `QRCodeScanner` gerencia a solicitação de permissão.

### ViewShot
Usado para capturar a etiqueta como imagem PNG para compartilhar/imprimir.
Qualidade: 100%, formato PNG.
