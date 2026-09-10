---
description: Orquestração multi-camada — ADD-FIELD, NEW-FEATURE, MODIFY-FLOW, FIX, REFACTOR
---

# 🔄 FULL-STACK — Orquestração Multi-Camada

Mudança pedida: **$ARGUMENTS**

Leia `AGENT_ORCHESTRATION.md` (processo completo por tipo de mudança) antes de começar.
Este comando é o roteiro condensado.

## 1. Classifique a mudança

| Tipo | Quando |
|---|---|
| `ADD-FIELD` | Adicionar campo a um model existente |
| `NEW-FEATURE` | Funcionalidade nova de ponta a ponta |
| `MODIFY-FLOW` | Mudar validação, etapa ou comportamento existente |
| `FIX-INCONSISTENCY` | Dado dessincronizado, status errado, cache velho |
| `REFACTOR` | Reorganizar sem mudar comportamento |

Se for ambíguo, pergunte antes de escrever código.

## 2. Ordem de execução (não pule etapas)

```
Backend                              Frontend
───────────────────────────────      ──────────────────────────────
1. Model      app/models/            5. Type       mobile/types/
2. Schema     app/schemas/           6. Service    mobile/services/
3. Migration  python migrate.py      7. Component  mobile/components/
4. Service    app/services/          8. Screen     mobile/app/
   Endpoint   app/api/v1/endpoints/  9. invalidateQueries()
   + include_router em router.py
```

Se a mudança tocar o catálogo público, a 10ª etapa é `web/` (`/public/*` +
`web/services/api.ts` + componente).

## 3. Checklist por camada

**Backend**
- [ ] Model estende `BaseModel` (ganha `id`, `created_at`, `updated_at`, `is_active`, `tenant_id`)
- [ ] Schema de request e de response atualizados
- [ ] `python migrate.py "descrição"` rodado e aplicado
- [ ] Lógica no **Service**, acesso a dados no **Repository**, API só orquestra
- [ ] `tenant_id` propagado em toda leitura/escrita
- [ ] Soft delete (`is_active = False`), nunca `DELETE`
- [ ] `response_model` bate exatamente com o retorno (senão → 500 `ResponseValidationError`)
- [ ] Estoque só muda via `StockEntry` / `EntryItem` (FIFO)
- [ ] `python -m py_compile` + `pytest`

**Frontend (mobile)**
- [ ] Type em `mobile/types/`
- [ ] Função no service do domínio (`mobile/services/`)
- [ ] `useQuery` / `useMutation` — server state **nunca** em Zustand
- [ ] `invalidateQueries` em **todas** as keys afetadas após a mutation
- [ ] Componentes de `components/ui/` reaproveitados
- [ ] Cores por token (`useThemeColors`), sem hex hardcoded
- [ ] Sem `Divider`, sem botão `position: absolute`
- [ ] Textos em português

**Web (se aplicável)**
- [ ] Endpoint em `public_catalog.py` sem vazar custo/quantidade
- [ ] `web/services/api.ts` atualizado
- [ ] Mobile-first 375px, tokens do `tailwind.config.ts`, ícones Lucide

## 4. Red flags — pare se vir isso

- Query SQL dentro de endpoint (pule para o Repository)
- Regra de negócio no Repository
- `Inventory.quantity` sendo escrito direto
- Produto criado com estoque e sem `StockEntry`
- `tenant_id` faltando em create manual
- Mutation sem `invalidateQueries`
- Cache do React Query mutado na mão
- `= 1` / `= 0` em BOOLEAN de SQL raw no PostgreSQL

## 5. Entrega

Resuma: arquivos por camada, migration gerada, o que foi validado (compile/testes/build) e o que
ficou de fora.
