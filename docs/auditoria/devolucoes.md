# Auditoria: devolução, troca e estorno (08/11/2026)

Testes: `backend/tests/audit/devolucoes/test_devolucoes_audit.py` (27 testes: 25 passam, 2 falham e provam bugs reais).
Esperado calculado no próprio teste (contas em Decimal), comparado com a API, o estoque por variação, `sale_sources.quantity_returned` e `period_totals`.

## (a) Cenários cobertos

| Cenário | Resultado |
|---|---|
| 3 devoluções parciais até zerar (2+1+2 de 5): status, estoque, receita/custo líquidos no livro, fontes FIFO, histórico, elegibilidade | OK |
| Devolução com venda que consumiu 2 lotes (custo 40 e 60): volta à última camada, custo devolvido certo | OK |
| Defeito (`restock=false`): estoque não volta, fonte não devolve, custo fica como prejuízo | OK |
| Troca por peça mais cara (diferença paga, receita 530, custo 200, só 1 venda conta) | OK |
| Troca por peça mais barata (loja reembolsa; net -30) | OK |
| Troca com `replacement_unit_price`, troca total vira `refunded` | OK |
| Troca por variação inexistente (400), forma de acerto inválida (422) | OK |
| Dois itens trocados pela mesma peça nova com 1 em estoque (recusa, sem gravar) | OK |
| Erros: quantidade acima, item inexistente, qtd 0/negativa, lista vazia, sem motivo, motivo curto, venda inexistente, sem login | OK (4xx com frase, nunca 500) |
| Item de outra venda no corpo; item repetido no corpo (com restock) | OK (400) |
| Venda de outra loja (devolver, elegibilidade, histórico) | OK, negado |
| Cancelar venda com devolução parcial / total (400); devolver venda cancelada (400); estoque não volta 2 vezes | OK |
| Estorno `is_correction`: caixa/vendedor/gerente 403, admin ok em loja só-troca; gerente e vendedor devolvem no prazo | OK |
| Prazo (6d20h dentro; prazo 0 recusa) | OK |
| Total gasto da cliente líquido, inclusive após troca | OK |
| Pontos: devolução tira proporcional; troca dá pontos da peça nova; compra paga com pontos devolve os pontos usados | OK |
| Fiado: devolução abate parcelas; cancelar fiado com devolução recusa | OK |
| Desconto na venda: 2 peças com R$ 50 de desconto (75 + 75) | OK |
| Duas peças de variações diferentes devolvidas juntas, estoque por variação | OK |

## (b) BUGS confirmados

### 1. Mesmo item repetido no corpo da devolução com defeito devolve mais que o vendido (GRAVE, dinheiro)
- Passos: vender 5 peças a R$ 100. `POST /returns/{sale}` com `items` = `[{sale_item_id: X, quantity: 3, restock:false}, {sale_item_id: X, quantity: 3, restock:false}]`.
- Esperado: 400 (6 > 5). Obtido: 201, reembolso de R$ 600 numa venda de R$ 500; receita do mês fica -R$ 100 (negativa), status vira `refunded`.
- Causa: `process_return` valida cada linha contra `available` sem somar as linhas anteriores do mesmo `sale_item_id`. Com restock a trava das fontes FIFO ("fontes esgotadas") acaba recusando, mas com mensagem enganosa e só por acaso; com `restock=false` nada segura.
- Prova: `test_item_repetido_com_defeito_nao_pode_passar_do_vendido`. (Com restock, `test_mesmo_item_repetido_no_corpo...` passa por acidente.) Quem consegue chamar: qualquer papel acima de caixa, via API; o app web dificilmente envia duplicado, mas a API aceita.

### 2. Arredondamento do desconto: devoluções peça a peça somam mais que o pago (MÉDIO, centavos)
- Passos: 3 peças de R$ 100 com desconto de R$ 10 na venda (cliente paga R$ 290,00). Devolver 1 peça, 3 vezes.
- Esperado: soma dos estornos = R$ 290,00. Obtido: R$ 290,01 (cada devolução = 96,67; o desconto proporcional de cada peça é arredondado e nunca compensado na última).
- Efeito: a loja devolve 1 centavo a mais que recebeu; receita líquida fica -0,01 e o livro do dia fica negativo. Piora com mais peças/descontos (n peças = até n/2 centavos).
- Prova: `test_devolucao_arredondamento_com_desconto_nunca_passa_do_que_foi_pago`.
- Correção sugerida: ao devolver a última peça do item (ou o restante), estornar `subtotal do item - desconto - já estornado`.

## (c) Melhorias (sem teste falhando)
- Item repetido com restock: a recusa vem como "A venda não tem mais peças para devolver ao estoque (fontes esgotadas)", mensagem técnica. Somar quantidades por `sale_item_id` antes de validar daria a frase certa ("excede o disponível").
- `process_return` e `check_eligibility` capturam `Exception` e devolvem 500 com `str(e)` (texto técnico vaza); hoje só ValueError é tratado como 400.
- `[Inventory Sync]` falhas no `rebuild_product_from_fifo` depois do commit só vão para `print`: o estoque pode ficar divergente sem alerta/registro em `error_logs`.
- `max_refund_amount` e `total_refund` saem como string no JSON (misturam float e string entre rotas: elegibilidade traz `"200.0"`, histórico traz strings); padronizar.
- Devolução de venda que tem `sale_item.sale_sources` vazio (antiga) bloqueia a devolução inteira depois de já ter mexido em pontos/total gasto na mesma transação; tudo é desfeito pelo rollback, ok, mas o erro só aparece no fim.

## (d) Não deu para cobrir
- Concorrência real (duas devoluções simultâneas da mesma venda): exige Postgres (`tests/pg`); SQLite não tem `pg_advisory_xact_lock`.
- Estorno com pagamento misto na venda original (PIX + dinheiro) e `refund_method` (`cash`, `store_credit`) no caixa: o campo é gravado mas não altera nenhum saldo, e o teste do caixa pertence a outra auditoria.
- Rota `POST /returns/reconcile-status` (já documentada como inalcançável).
- Push de devolução e comprovante após devolução (outra área).
- Devolução de venda de troca (a venda "Troca da venda X" pode ser devolvida de novo? não testado).
- Venda com desconto por forma de pagamento (`payment_discount`) além do desconto manual.
