# FIFO Invariants

Fonte única de verdade: tabela `entry_items`.

## Invariantes Obrigatórias
1. Estoque oficial por produto (tenant) = soma de `quantity_remaining` dos `entry_items` ativos desse produto e tenant.
2. `quantity_remaining` nunca negativo e sempre `<= quantity_received` (já reforçado por constraints SQL).
3. Consumo em vendas segue ordem cronológica crescente de criação dos `entry_items` (FIFO); nenhum item posterior é consumido enquanto há saldo anterior.
4. Cada unidade vendida deve estar referenciada exatamente uma vez em `sale_sources` (ou estrutura equivalente) apontando o `entry_item` de origem e o custo unitário aplicado.
5. Custo restante esperado = `Σ(quantity_remaining * unit_cost)` para todos os `entry_items` ativos; custo vendido acumulado = `Σ((quantity_received - quantity_remaining) * unit_cost)`.
6. Divergência de custo (custo_recebido_total - custo_vendido_total - custo_restante_calculado) precisa ser 0 (tolerância somente para arredondamento centesimal <= 0.01).
7. Tabela `inventory` é derivada: qualquer diferença entre `inventory.quantity` e soma FIFO deve ser marcada como inconsistência e nunca corrigida manualmente (usar rebuild).
8. Soft delete preserva histórico: `is_active=False` exclui item do cálculo de estoque, mas mantém custo histórico; unidades já vendidas antes do soft delete continuam válidas.
9. Rebuild não altera `entry_items`; apenas sincroniza `inventory` e registra divergências.

## Campos Críticos
- `entry_items.quantity_received`
- `entry_items.quantity_remaining`
- `entry_items.unit_cost`
- `inventory.quantity` (derivado)

## Regras de Consumo (Venda)
- Enquanto `quantity_remaining > 0` em um item mais antigo, não consumir do próximo.
- Parcial permitido: reduzir somente o necessário e continuar para o próximo item se sobrar quantidade a consumir.
- Se faltar quantidade em todos os itens → lança erro de estoque insuficiente antes de criar venda.

## Auditoria
- Script periódico verifica: divergências quantidade, custo, itens esgotados com movimentos restantes, inventário desalinhado.
- Log dedicado `fifo_audit` registra timestamp, produto, tenant e tipo de divergência.

## Rebuild Inventory
- Recalcula `inventory.quantity` = soma FIFO.
- Cria registro se não existir para (produto, tenant).
- Não gera movimentos (rebuild é operação corretiva interna); opcional flag para gerar movimento de ajuste.

## Métricas Derivadas
- `in_stock`: soma FIFO > 0
- `depleted`: soma FIFO == 0 e já houve ao menos um `entry_item` ativo histórico
- `never_stocked`: nenhum `entry_item` histórico para produto/tenant

## Testes Obrigatórios
1. Cenário simples (2 itens, 1 venda parcial) mantém invariantes 1–6.
2. Venda que consome múltiplos itens preserva ordem FIFO.
3. Rebuild alinha inventário sem alterar custos.
4. Soft delete exclui item do estoque sem quebrar custo total.
5. Auditor detecta divergência simulada (forçar `quantity_remaining` negativo).

## Tolerâncias
- Arredondamento de custo: diferenças <= 0.01 são aceitáveis e registradas como aviso.

---
Manter este documento atualizado ao alterar o fluxo de vendas ou entrada de estoque.