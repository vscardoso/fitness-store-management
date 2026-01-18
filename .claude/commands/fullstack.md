# Full-Stack Orchestrated Command

Execute mudanças coordenadas entre Backend, Frontend e UX com zero erros.

## Como Usar

Digite no chat:
```
🔄 FULL-STACK [TIPO]: [descrição]
```

## Processo Automático

Quando você usar este comando, Claude vai:

1. **Ler documentação:**
   - AGENT_ORCHESTRATION.md (processo completo)
   - QUICK_REFERENCE.md (referência rápida)
   - CLAUDE.md (arquitetura do projeto)

2. **Identificar escopo:**
   - Qual tipo de mudança (ADD-FIELD, NEW-FEATURE, etc)
   - Quais camadas são afetadas (backend, frontend, UX)
   - Quais arquivos precisam ser modificados

3. **Executar em ordem:**
   - ✅ **Backend primeiro** (models → schemas → repository → service → endpoint → migration)
   - ✅ **Frontend depois** (types → services → components → screens → integration)
   - ✅ **UX por último** (review → ajustes → refinamento → validação)

4. **Validar cada etapa:**
   - Backend: Migration executada, endpoints testados
   - Frontend: Tipos sincronizados, telas renderizando
   - UX: Visual consistente, feedback adequado

5. **Reportar status:**
   ```
   🔄 FULL-STACK [TIPO] - STATUS
   ✅ Backend: COMPLETO
   ✅ Frontend: COMPLETO
   ✅ UX: COMPLETO

   📝 Resumo das mudanças:
   - Backend: 5 arquivos modificados
   - Frontend: 8 arquivos modificados
   - Migration: 001_add_field_x.py

   ✅ PRONTO PARA TESTE
   ```

## Tipos Disponíveis

### ADD-FIELD
Adicionar campo a entidade existente.

**Exemplo:**
```
🔄 FULL-STACK ADD-FIELD: Adicionar campo "neighborhood" (string, opcional) ao Customer
```

**O que será feito:**
- Backend: Adicionar a model, schemas, migration
- Frontend: Adicionar a tipos, formulários (criar/editar)
- UX: Posicionar campo adequadamente, integrar com CEP

---

### NEW-FEATURE
Criar funcionalidade completa do zero.

**Exemplo:**
```
🔄 FULL-STACK NEW-FEATURE: Sistema de cupons de desconto (código, valor/%, validade, uso único)
```

**O que será feito:**
- Backend: Models completos, service layer, endpoints CRUD
- Frontend: Telas de listagem, criar, editar, aplicar cupom
- UX: Fluxo de aplicação, validações visuais, feedback

---

### MODIFY-FLOW
Alterar comportamento/fluxo existente.

**Exemplo:**
```
🔄 FULL-STACK MODIFY-FLOW: Permitir edição de envios após marcar como enviado
```

**O que será feito:**
- Backend: Ajustar validações no service, permitir update
- Frontend: Habilitar botão de editar, ajustar formulário
- UX: Adicionar confirmação, feedback claro

---

### FIX-INCONSISTENCY
Corrigir dados/fluxo inconsistente.

**Exemplo:**
```
🔄 FULL-STACK FIX-INCONSISTENCY: Status de envio não atualiza na lista após ação
```

**O que será feito:**
- Backend: Verificar endpoint, validar resposta
- Frontend: Corrigir invalidação de cache, atualizar queries
- UX: Garantir feedback visual imediato

---

### REFACTOR
Melhorar código sem mudar funcionalidade.

**Exemplo:**
```
🔄 FULL-STACK REFACTOR: Otimizar queries de produtos (N+1 problem)
```

**O que será feito:**
- Backend: Otimizar queries, adicionar eager loading
- Frontend: Ajustar types se necessário
- UX: Verificar que tudo continua funcionando

---

## Checklist de Validação

Após Claude concluir, valide:

### ✅ Backend
- [ ] Migration executada: `alembic upgrade head`
- [ ] Swagger docs atualizado: http://localhost:8000/docs
- [ ] Endpoint testado com sucesso
- [ ] Dados salvam no banco corretamente

### ✅ Frontend
- [ ] App compila sem erros TypeScript
- [ ] Tela renderiza corretamente
- [ ] Formulário salva com sucesso
- [ ] Lista atualiza automaticamente

### ✅ UX
- [ ] Visual consistente com outras telas
- [ ] Loading aparece durante requisições
- [ ] Erros mostram mensagens claras
- [ ] Navegação funciona corretamente

### ✅ E2E
- [ ] Fluxo completo testado (criar → ver → editar → deletar)
- [ ] Testado em dispositivo real
- [ ] Edge cases validados

---

## Exemplos Práticos

### Exemplo 1: Adicionar Campo
```
🔄 FULL-STACK ADD-FIELD: Adicionar campo "observações" (text, opcional) ao Product
```

**Resultado esperado:**
- Backend: Campo `observations` no model, schemas atualizado, migration criada
- Frontend: TextInput multiline nos formulários, exibição em detalhes
- UX: Campo posicionado ao final, placeholder adequado

---

### Exemplo 2: Nova Feature
```
🔄 FULL-STACK NEW-FEATURE: Sistema de agendamento de entregas
```

**Resultado esperado:**
- Backend: Models (Delivery, DeliverySchedule), service completo, endpoints CRUD
- Frontend: Telas (listar, agendar, detalhes), calendário, notificações
- UX: Fluxo intuitivo, feedback visual, estados vazios

---

### Exemplo 3: Corrigir Bug
```
🔄 FULL-STACK FIX-INCONSISTENCY: Quantidade em estoque mostra valor errado após venda
```

**Resultado esperado:**
- Backend: Corrigir cálculo no repository/service
- Frontend: Atualizar query, invalidar cache corretamente
- UX: Garantir atualização visual imediata

---

## Dicas

1. **Seja específico:** Descreva exatamente o que precisa
2. **Mencione validações:** Se houver regras especiais
3. **Indique relacionamentos:** Se envolve múltiplas entidades
4. **Especifique tipos:** String, int, date, FK, etc
5. **Descreva comportamento:** O que deve acontecer

---

## Troubleshooting

### "Claude não seguiu o protocolo"
**Solução:** Repita o comando adicionando:
```
🔄 FULL-STACK [TIPO]: [descrição]

IMPORTANTE: Seguir protocolo em AGENT_ORCHESTRATION.md
Ordem: Backend → Frontend → UX
```

### "Faltou uma camada"
**Solução:** Peça explicitamente:
```
Faltou atualizar o [camada]. Por favor, complete seguindo a checklist de [TIPO].
```

### "Deu erro durante a execução"
**Solução:** Use FIX-INCONSISTENCY:
```
🔄 FULL-STACK FIX-INCONSISTENCY: [Cole o erro aqui]
```

---

## Referências

- **Processo Completo:** AGENT_ORCHESTRATION.md
- **Comandos Rápidos:** QUICK_REFERENCE.md
- **Arquitetura:** CLAUDE.md

**Meta: ZERO RETRABALHO 🎯**
