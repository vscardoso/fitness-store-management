# Tarefas Pendentes - Fitness Store Management

**Última atualização:** 2026-02-12

---

## 🏷️ Sistema de Código de Barras (PRIORIDADE ALTA)

### Visão Geral
Implementar sistema completo de código de barras para identificação de produtos (roupas fitness). O fluxo será:

1. **Gerar código** → 2. **Imprimir etiqueta** → 3. **Colar na roupa** → 4. **Escanear no app**

### Opções de Código de Barras

| Tipo | Vantagens | Desvantagens |
|------|-----------|--------------|
| **EAN-13** | Padrão internacional, compatível com leitores | Apenas números, 13 dígitos |
| **Code128** | Alfanumérico, compacto | Menos universal |
| **QR Code** | Muita informação, fácil escanear com celular | Maior, pode não caber em etiquetas pequenas |
| **Code39** | Simples, alfanumérico | Mais largo |

**Recomendação:** EAN-13 ou Code128 para etiquetas de roupa (compacto e universal)

### Tarefas de Implementação

#### Backend
- [ ] Criar endpoint `POST /api/v1/products/{id}/barcode` - Gerar código de barras único
- [ ] Criar endpoint `GET /api/v1/products/barcode/{code}` - Buscar produto por código
- [ ] Criar endpoint `POST /api/v1/products/barcode/batch` - Gerar códigos em lote
- [ ] Adicionar campo `barcode` no modelo Product (já existe, verificar se está sendo usado)
- [ ] Implementar geração automática de código único (prefixo da loja + sequencial)
- [ ] Validar unicidade do código de barras por tenant

#### Mobile - Geração e Impressão
- [ ] Tela de geração de código de barras (`/products/[id]/barcode`)
- [ ] Visualização do código de barras gerado (imagem)
- [ ] Botão "Imprimir Etiqueta" - integração com impressora Bluetooth
- [ ] Geração em lote para múltiplos produtos
- [ ] Template de etiqueta configurável (tamanho, informações)

#### Mobile - Scanner
- [ ] Componente `BarcodeScanner` usando `expo-barcode-scanner`
- [ ] Integrar scanner na tela de PDV (venda rápida)
- [ ] Integrar scanner na tela de cadastro de produto
- [ ] Integrar scanner na tela de entrada de estoque
- [ ] Feedback sonoro/vibração ao escanear
- [ ] Modo "escaneamento contínuo" para múltiplos produtos

#### Impressão de Etiquetas
- [ ] Pesquisar impressoras térmicas Bluetooth compatíveis (ex: Zebra, Brother)
- [ ] Biblioteca: `react-native-thermal-receipt-printer` ou similar
- [ ] Configurar tamanho de etiqueta (30x20mm, 40x30mm, etc.)
- [ ] Template de etiqueta com: código de barras, nome, preço, tamanho

### Formato Sugerido do Código
```
[PREFIXO_LOJA][ANO][SEQUENCIAL]
Exemplo: WA2401001 = Loja WA, 2024, produto 001
```

---

## 🔧 Correções e Melhorias Pendentes

### Backend
- [ ] Implementar tela de perfil do usuário (endpoint já existe?)
- [ ] Implementar tela de categorias (CRUD completo)
- [ ] Revisar soft delete em todas as entidades
- [ ] Adicionar logs de auditoria para ações críticas

### Mobile - Telas Faltando
- [ ] `/profile` - Tela de perfil do usuário (editar dados, trocar senha)
- [ ] `/categories` - Gerenciamento de categorias
- [ ] `/settings` - Configurações do app (notificações, tema, etc.)

### Mobile - Melhorias UX
- [ ] Skeleton loading em listas (produtos, clientes, vendas)
- [ ] Pull-to-refresh em todas as listas
- [ ] Mensagens de erro mais amigáveis
- [ ] Confirmação antes de ações destrutivas
- [ ] Modo offline básico (cache de produtos)

---

## 📊 Relatórios e Dashboard

- [ ] Gráfico de vendas por período (dia/semana/mês)
- [ ] Relatório de produtos mais vendidos (já existe, revisar)
- [ ] Relatório de clientes mais ativos
- [ ] Relatório de estoque crítico
- [ ] Exportar relatórios em PDF
- [ ] Exportar relatórios em Excel/CSV

---

## 🔔 Notificações

- [ ] Push notification para estoque baixo
- [ ] Push notification para vendas do dia
- [ ] Notificação de aniversário de clientes
- [ ] Alertas de metas atingidas

---

## 👥 Sistema de Equipe (Recém Implementado)

- [x] Backend: CRUD de membros da equipe
- [x] Backend: Alterar role, resetar senha, ativar/desativar
- [x] Mobile: Tela de listagem de equipe
- [x] Mobile: Tela de adicionar membro
- [x] Mobile: Tela de detalhes/edição do membro
- [x] Mobile: Link no menu (apenas ADMIN)
- [ ] Testar fluxo completo de criação de usuário
- [ ] Testar login com novo usuário criado
- [ ] Verificar se novo usuário vê dados da mesma loja

---

## 🎓 Tutorial Interativo (Implementado)

- [x] TutorialContext e Provider
- [x] TutorialTooltip e TutorialSpotlight
- [x] HelpButton nas telas principais
- [x] WelcomeTutorialModal
- [x] Tela de Ajuda (/help)
- [ ] Refinar posicionamento dos tooltips
- [ ] Adicionar mais tutoriais para telas secundárias
- [ ] Testar em diferentes tamanhos de tela

---

## 🚀 Deploy e Publicação

### Backend
- [ ] Configurar variáveis de ambiente para produção
- [ ] Migrar banco para PostgreSQL (produção)
- [ ] Configurar HTTPS
- [ ] Deploy em servidor (Railway, Render, AWS, etc.)

### Mobile
- [ ] Configurar eas.json para builds de produção
- [ ] Criar conta na Google Play Store
- [ ] Criar conta na Apple App Store
- [ ] Gerar builds de produção
- [ ] Submeter para revisão

---

## 📋 Backlog Futuro

- [ ] Integração com WhatsApp (enviar recibo)
- [ ] Integração com PIX (QR Code de pagamento)
- [ ] Sistema de promoções e cupons
- [ ] Programa de fidelidade avançado
- [ ] Multi-loja (gerenciar várias lojas)
- [ ] Dashboard web para gerentes
- [ ] App para clientes (catálogo, pedidos)

---

## 🐛 Bugs Conhecidos

- [ ] Verificar se tooltip do tutorial posiciona corretamente em todas as telas
- [ ] Testar navegação `/team` em dispositivo físico
- [ ] Verificar performance com muitos produtos (>1000)

---

## Próximos Passos Recomendados

1. **Sistema de Código de Barras** - Essencial para operação da loja
2. **Testar Sistema de Equipe** - Validar multi-usuário funcionando
3. **Tela de Perfil** - Usuários precisam editar seus dados
4. **Deploy Backend** - Preparar para produção

---

## Notas Técnicas

### Bibliotecas Recomendadas para Código de Barras

**Geração (Backend Python):**
```bash
pip install python-barcode Pillow
```

**Scanner (Mobile):**
```bash
npx expo install expo-barcode-scanner expo-camera
```

**Impressão (Mobile):**
```bash
npm install react-native-thermal-receipt-printer-image-qr
# ou
npm install react-native-esc-pos-printer
```

### Impressoras Térmicas Recomendadas
- Mini impressora Bluetooth 58mm (etiquetas pequenas)
- Zebra ZD410 (profissional)
- Brother QL-800 (etiquetas)
