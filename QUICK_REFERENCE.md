# 🚀 Guia Rápido - Comandos de Orquestração

## 📌 Como Usar Este Sistema

### 1. Copie o Comando Base
```
🔄 FULL-STACK [TIPO]: [descrição da mudança]
```

### 2. Escolha o Tipo Correto

| Tipo | Quando Usar | Exemplo |
|------|-------------|---------|
| **ADD-FIELD** | Adicionar campo a entidade existente | `🔄 FULL-STACK ADD-FIELD: Adicionar campo "neighborhood" ao Customer` |
| **NEW-FEATURE** | Criar nova funcionalidade completa | `🔄 FULL-STACK NEW-FEATURE: Sistema de envios condicionais` |
| **MODIFY-FLOW** | Alterar fluxo/comportamento existente | `🔄 FULL-STACK MODIFY-FLOW: Permitir edição de envios enviados` |
| **FIX-INCONSISTENCY** | Corrigir dados/status inconsistentes | `🔄 FULL-STACK FIX-INCONSISTENCY: Status não atualiza após ação` |
| **REFACTOR** | Melhorar código sem mudar funcionalidade | `🔄 FULL-STACK REFACTOR: Otimizar queries de listagem` |

### 3. Cole no Chat e Aguarde

Claude vai:
1. ✅ Ler AGENT_ORCHESTRATION.md
2. ✅ Identificar camadas afetadas
3. ✅ Chamar agentes na ordem correta
4. ✅ Validar cada etapa
5. ✅ Reportar status completo

---

## ⚡ Comandos Prontos para Copiar

### Adicionar Campos

```bash
# Adicionar campo de texto simples
🔄 FULL-STACK ADD-FIELD: Adicionar campo "complemento" ao endereço do Cliente

# Adicionar campo com relação
🔄 FULL-STACK ADD-FIELD: Adicionar campo "categoria_id" ao Produto

# Adicionar campo calculado
🔄 FULL-STACK ADD-FIELD: Adicionar campo "idade" calculado a partir de birth_date
```

### Criar Features

```bash
# Feature completa
🔄 FULL-STACK NEW-FEATURE: Sistema de cupons de desconto

# Sub-módulo de feature
🔄 FULL-STACK NEW-FEATURE: Relatório de vendas por período

# Integração externa
🔄 FULL-STACK NEW-FEATURE: Integração com WhatsApp Business API
```

### Modificar Fluxos

```bash
# Alterar validação
🔄 FULL-STACK MODIFY-FLOW: Permitir venda sem estoque (sob pedido)

# Adicionar etapa
🔄 FULL-STACK MODIFY-FLOW: Adicionar confirmação antes de deletar produto

# Mudar comportamento
🔄 FULL-STACK MODIFY-FLOW: Atualizar estoque em tempo real durante venda
```

### Corrigir Inconsistências

```bash
# Dados dessincronizados
🔄 FULL-STACK FIX-INCONSISTENCY: Campo "neighborhood" não aparece nos forms

# Status incorreto
🔄 FULL-STACK FIX-INCONSISTENCY: Status permanece "PENDING" após enviar

# Cache desatualizado
🔄 FULL-STACK FIX-INCONSISTENCY: Lista não atualiza após criar item
```

---

## 🎯 Atalhos para Situações Comuns

### "Falta um campo no formulário"
```bash
🔄 FULL-STACK ADD-FIELD: Adicionar campo "[nome_campo]" ao [Entidade]
```

### "Preciso de uma nova tela/funcionalidade"
```bash
🔄 FULL-STACK NEW-FEATURE: [Descrição da funcionalidade]
```

### "O status/dado não está atualizando"
```bash
🔄 FULL-STACK FIX-INCONSISTENCY: [Descrição do problema]
```

### "Os botões estão feios/fora do padrão"
```bash
🔄 FULL-STACK MODIFY-FLOW: Melhorar UX da tela [nome da tela]
```

### "Quero mudar como algo funciona"
```bash
🔄 FULL-STACK MODIFY-FLOW: [Descrição da mudança desejada]
```

---

## 🔍 Checklist Antes de Marcar como Pronto

Copie e cole no chat após o agente terminar:

```markdown
## ✅ Validação Final

### Backend
- [ ] Migration executada com sucesso?
- [ ] Endpoint responde corretamente no Swagger?
- [ ] Dados salvam no banco?

### Frontend
- [ ] Tela renderiza sem erros?
- [ ] Dados aparecem corretamente?
- [ ] Formulário salva com sucesso?
- [ ] Lista atualiza após criar/editar?

### UX
- [ ] Visual está consistente com outras telas?
- [ ] Loading aparece durante requests?
- [ ] Mensagens de erro são claras?
- [ ] Navegação funciona?

### Teste E2E
- [ ] Testei criar → visualizar → editar → deletar?
- [ ] Testei em dispositivo real (não só emulador)?
- [ ] Testei casos extremos (campos vazios, dados inválidos)?
```

---

## 🆘 Troubleshooting

### "Claude não entendeu o comando"
**Solução:** Seja mais específico:
```bash
# ❌ Muito genérico
Adicionar campo

# ✅ Específico e claro
🔄 FULL-STACK ADD-FIELD: Adicionar campo "celular_alternativo" (string, opcional) ao Customer
```

### "Mudança foi feita mas tem erros"
**Solução:** Use FIX-INCONSISTENCY:
```bash
🔄 FULL-STACK FIX-INCONSISTENCY: [Descreva o erro exato que está aparecendo]
```

### "Não sei qual tipo usar"
**Decisão rápida:**
- Adicionar/remover campo? → **ADD-FIELD**
- Criar algo novo do zero? → **NEW-FEATURE**
- Mudar como algo funciona? → **MODIFY-FLOW**
- Corrigir bug/inconsistência? → **FIX-INCONSISTENCY**
- Melhorar código sem mudar feature? → **REFACTOR**

### "Claude não chamou os agentes corretos"
**Solução:** Force a ordem:
```bash
🔄 FULL-STACK NEW-FEATURE: [descrição]

Ordem de execução:
1. Backend Agent: criar models, schemas, endpoints
2. Frontend Agent: criar telas, services, types
3. UX Agent: revisar e ajustar interface
```

---

## 💡 Dicas Pro

### 1. **Seja Descritivo**
```bash
# ❌ Vago
🔄 FULL-STACK ADD-FIELD: Adicionar campo

# ✅ Claro
🔄 FULL-STACK ADD-FIELD: Adicionar campo "data_nascimento" (date, opcional) ao Customer para calcular idade
```

### 2. **Mencione Validações**
```bash
🔄 FULL-STACK ADD-FIELD: Adicionar campo "email" (string, obrigatório, validar formato) ao Customer
```

### 3. **Especifique Relacionamentos**
```bash
🔄 FULL-STACK ADD-FIELD: Adicionar campo "categoria_id" (FK para Category) ao Product
```

### 4. **Indique Comportamento Esperado**
```bash
🔄 FULL-STACK NEW-FEATURE: Sistema de cupons que aplica desconto % ou valor fixo, valida data de validade
```

### 5. **Peça Revisão UX Explicitamente**
```bash
🔄 FULL-STACK MODIFY-FLOW: Reorganizar botões da tela de envios (revisar UX com mobile-ux-specialist)
```

---

## 📊 Monitoramento de Progresso

Durante a execução, Claude vai mostrar:

```markdown
🔄 **FULL-STACK [TIPO] INICIADO**

## 📋 Plano de Execução
- [✅/⏳/❌] Backend
- [✅/⏳/❌] Frontend
- [✅/⏳/❌] UX

## 🎯 Status Atual
✅ Backend: COMPLETO
⏳ Frontend: EM ANDAMENTO (2/5 arquivos)
⏳ UX: PENDENTE

## 🔍 Próximos Passos
1. Criar service em mobile/services/
2. Implementar telas
3. Revisar UX
```

---

## 🎓 Treinamento para Novas Sessões

Se abrir uma nova sessão do Claude Code, comece com:

```markdown
📚 **CONTEXTO DO PROJETO**

Este projeto usa sistema de orquestração de agentes documentado em:
- AGENT_ORCHESTRATION.md (processo completo)
- QUICK_REFERENCE.md (comandos rápidos)

Ao ver comando `🔄 FULL-STACK`, siga o protocolo definido nesses arquivos.

Agora vou passar minha demanda:
[cole seu comando aqui]
```

---

## 🔗 Links Rápidos

- **Processo Completo:** [AGENT_ORCHESTRATION.md](./AGENT_ORCHESTRATION.md)
- **Arquitetura:** [CLAUDE.md](./CLAUDE.md)
- **Docs API:** http://localhost:8000/docs

---

## 📞 FAQ Rápido

**P: Preciso usar o comando para mudanças pequenas?**
R: Não obrigatório, mas recomendado para garantir zero erros.

**P: Posso misturar tipos de mudança?**
R: Sim, escolha o tipo predominante e descreva todas as mudanças.

**P: Claude ignorou uma camada (backend/frontend/UX)?**
R: Peça explicitamente: "Também precisa atualizar o [camada] para [ação]"

**P: Como sei se está completo?**
R: Quando Claude marcar todas as camadas como ✅ e você validar o checklist final.

**P: Posso pedir para Claude parar e revisar?**
R: Sim! Digite "PAUSE - revisar [camada] antes de continuar"

---

**Lembre-se:** O objetivo é **ZERO RETRABALHO**. Melhor gastar 5 minutos planejando do que 30 minutos corrigindo! 🎯
