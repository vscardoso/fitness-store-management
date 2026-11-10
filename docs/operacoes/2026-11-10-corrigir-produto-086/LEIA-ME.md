# Corrigir o produto #086 "Agasalho Com Dedinho" (loja 2), 10/11/2026

- **Problema**: o produto ficou sem nenhuma variação ativa, mas com 1 peça em estoque. A busca por código (86) não achava, a peça não tinha cor, tamanho nem código #086-x e não dava para imprimir etiqueta.
- **Como aconteceu (horário de Brasília)**: 15:54 foi criada a variação Preto G (#086-2, R$ 55,00, fornecedor Só para você Nakamura) na entrada ESTOQUE-ANTINGO; 16:46:05 contagem 0 na Conferência; 16:46:10 baixa por "ajuste"; 16:46:22 a variação foi EXCLUÍDA; 16:46:59 o produto foi lançado na entrada COMPRAS-SÃO-PAULO-09 (1 peça, R$ 55,00, mesmo fornecedor) SEM variação, porque o servidor aceita item sem variação quando o produto não tem variação ativa.
- **Como a variação certa foi escolhida**: o item sem variação tem o mesmo custo (55,00), o mesmo fornecedor e o mesmo preço de venda (149,90) da variação Preto G excluída 40 segundos antes.
- **Correção** (`corrigir_086.sql`, uma transação que se cancela se a contagem não for 1 variação e 1 item): reativa a variação 29373 e liga o item de entrada 30780 a ela. Conferido depois: #086-2 Preto G ativa, estoque do produto 1 = soma do FIFO 1.
- **Desfazer**: `desfazer_086.sql`.
- **Ainda aberto**: o produto #116 "Bermuda Ciclista Fitness com Bolsos Laterais" também está ativo sem variação ativa (sem peça em estoque). Prevenção no código: ver CLAUDE.md.

## Limpeza do histórico solto (a pedido do Victor, mesmo dia)

Dados confirmados por ele: Preto, G, custo R$ 55,00, venda R$ 149,90, fornecedor "Só para você", 10/11. Ficou só a peça certa (item 30780, entrada COMPRAS-SÃO-PAULO-09).
- **Jogado fora (exclusão lógica, 0 vendas do produto)**: os itens de entrada 301 (Amarelo Manteiga G, R$ 70) e 30761 (duplicata Preto G, R$ 55) da ESTOQUE-ANTINGO, já zerados; as 2 baixas por ajuste (08/11 e 10/11); o vínculo com o fornecedor 5 (só existia pela compra do Amarelo); o vínculo com o fornecedor 6 passou de 2 compras para 1; o total da ESTOQUE-ANTINGO foi refeito (R$ 13.360,70 para R$ 13.235,70, igual à soma dos itens ativos).
- **Mantido**: a variação 305 (Amarelo Manteiga, desativada, guarda o número #086-1); a etiqueta pendente na fila (linha 229), passada da entrada antiga para a 382; as contagens da Conferência (histórico de contagem, não de estoque).
- **Não mexido**: a data da entrada COMPRAS-SÃO-PAULO-09 (09/11, vale para os 50 itens dela).
- Scripts: `limpar_historico_086.sql` e `desfazer_historico_086.sql`.
- **Prevenção (código)**: entrada recusa item sem variação quando o produto perdeu todas as variações (`_refuse_item_without_variant`, `tests/test_entrada_sem_variacao.py`).
