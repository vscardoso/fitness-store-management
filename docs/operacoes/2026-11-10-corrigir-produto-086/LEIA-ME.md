# Corrigir o produto #086 "Agasalho Com Dedinho" (loja 2), 10/11/2026

- **Problema**: o produto ficou sem nenhuma variação ativa, mas com 1 peça em estoque. A busca por código (86) não achava, a peça não tinha cor, tamanho nem código #086-x e não dava para imprimir etiqueta.
- **Como aconteceu (horário de Brasília)**: 15:54 foi criada a variação Preto G (#086-2, R$ 55,00, fornecedor Só para você Nakamura) na entrada ESTOQUE-ANTINGO; 16:46:05 contagem 0 na Conferência; 16:46:10 baixa por "ajuste"; 16:46:22 a variação foi EXCLUÍDA; 16:46:59 o produto foi lançado na entrada COMPRAS-SÃO-PAULO-09 (1 peça, R$ 55,00, mesmo fornecedor) SEM variação, porque o servidor aceita item sem variação quando o produto não tem variação ativa.
- **Como a variação certa foi escolhida**: o item sem variação tem o mesmo custo (55,00), o mesmo fornecedor e o mesmo preço de venda (149,90) da variação Preto G excluída 40 segundos antes.
- **Correção** (`corrigir_086.sql`, uma transação que se cancela se a contagem não for 1 variação e 1 item): reativa a variação 29373 e liga o item de entrada 30780 a ela. Conferido depois: #086-2 Preto G ativa, estoque do produto 1 = soma do FIFO 1.
- **Desfazer**: `desfazer_086.sql`.
- **Ainda aberto**: o produto #116 "Bermuda Ciclista Fitness com Bolsos Laterais" também está ativo sem variação ativa (sem peça em estoque). Prevenção no código: ver CLAUDE.md.
