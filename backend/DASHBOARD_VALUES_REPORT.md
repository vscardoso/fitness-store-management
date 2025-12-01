# Relatório de Cards do Dashboard (Tenant 2)

Gerado em: 2025-12-01T18:07:41.295395 UTC

## Resumo

- Vendas Hoje: R$ 3.233,80 (9 vendas)
- Vendas Totais: R$ 3.303,70 (10 vendas)
- CMV: R$ 655,00
- Lucro Realizado: R$ 2.648,70 (80.17% margem)
- Estoque (Custo): R$ 2.820,00
- Estoque (Venda): R$ 18.563,30
- Margem Potencial: R$ 15.743,30 (558.27% média)
- Produtos com estoque: 4
- Clientes ativos: 1

## Soma Monetária (auditoria)

Nota: Soma aritmética dos valores em moeda exibidos, sem significado financeiro direto (apenas auditoria visual).
- Total: R$ 46.312,80

## Detalhes e Fórmulas

- Vendas Hoje: soma de `Sale.total_amount` do dia atual.
- Vendas Totais: soma de `Sale.total_amount` de todas as vendas ativas.
- CMV: soma de `SaleItem.quantity × SaleItem.unit_cost`.
- Lucro Realizado: `Vendas Totais - CMV`; Margem: `Lucro / Vendas Totais`.
- Estoque (Custo): soma de `EntryItem.quantity_remaining × EntryItem.unit_cost`.
- Estoque (Venda): soma de `EntryItem.quantity_remaining × Product.price`.
- Margem Potencial: `Estoque (Venda) - Estoque (Custo)`; Margem média: `(Venda - Custo)/Custo`.
