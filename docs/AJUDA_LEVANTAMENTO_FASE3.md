# Levantamento da fase 3 da ajuda (Dinheiro e Relatórios), 04/11/2026

Fichas em `mobile/constants/help/dinheiro.ts` (8) e `relatorios.ts` (9, com Estoque atual em PDF, tela que entrou em paralelo). Abaixo, o que a leitura das telas achou.

## Corrigido nesta fase

1. **Despesa lançada depois das 21h ficava com a data do dia seguinte.** A data era gravada com `toISOString()`, que usa o horário UTC. Agora usa `dateToIso` (`utils/dateBr.ts`) na criação, na edição e no período do relatório de vendas.
2. **Despesas e Descontos não mostravam o erro do servidor.** As telas liam `err.response`, que o interceptor não entrega. Agora usam `parseApiError`.
3. **Erros escondidos no financeiro.** Apagar transferência, trocar o banco do PIX, cancelar e desfazer pagamento falhavam em silêncio. Agora mostram aviso.
4. **"Excluir Despesa" aparecia para o gerente**, mas só o admin exclui. Agora o botão só aparece para o admin.
5. **Recorrência prometia o que não faz.** O texto "Marca automaticamente todo mês" virou "Marca como gasto fixo do mês. O app não lança o próximo sozinho."
6. **Despesas:**
   - "Ver Resultado P&L" virou "Ver resultado do mês".
   - A data aparecia como AAAA/MM/DD e agora sai em DD/MM/AAAA.
   - A contagem do cartão agora bate com o total ("N despesas da loja").
   - Saiu a frase "despesas operacionais / lucro líquido real".
7. **Resultado do mês:**
   - A dica de vendas agora diz que as devoluções são descontadas.
   - A dica de gastos diz que as peças perdidas entram.
   - O voltar leva para Despesas.
8. **Transferir:** "Maquininha a receber" não aparece mais como destino.
9. **Descontos de pagamento:**
   - Desligar ou remover um desconto perdia aquela forma de pagamento de vez, porque `is_active` é a exclusão lógica e a chave única impedia criar outro. Agora, criar de novo reaproveita o desconto removido (`payment_discount_service.py`, teste `tests/test_fase3_dinheiro_relatorios.py`).
   - Na tela saíram a chave "Desconto ativo" e os filtros e contadores de inativos, que nunca funcionaram.
   - Entrou o botão "Remover desconto" dentro da edição. Antes só dava para remover segurando o cartão, o que não funcionava no computador.
   - O percentual sai no formato brasileiro (7%, 7,5%) e aceita vírgula.
   - Os rótulos deixaram de ser todos em maiúsculas.
   - A mensagem de desconto repetido agora é em português.
10. **Atalhos da Início:** "Relatórios" e "Entradas" não aparecem mais para caixa e vendedor, que recebiam erro.
11. **Histórico:**
    - Tocar num condicional abria página inexistente (`/conditionals`).
    - O status da venda e o tipo da entrada saíam crus em inglês ("completed", "local"), e toda venda ficava laranja.
    - A hora vinha 3 horas adiantada.
    - Corrigido em `endpoints/reports.py` (`_enum_key`, `to_brazil_tz`), com teste.
12. **Mais vendidos:** "Este mes" ganhou acento, "Share" virou "Parte da receita", "Insights" virou "Destaques" e "SKU" virou "Cód.". Saiu o ícone do cabeçalho que não fazia nada, também no Histórico.
13. **Relatório de vendas:**
    - O PDF montado no celular saía com "#{index + 1}" literal, CSS quebrado e cabeçalho fora da página.
    - "Top Produtos" virou "Mais vendidos" e "SKU" virou "Código".
14. **Lucro por lote:** "Sobrou" virou "Lucro até agora". A explicação agora diz que a tela mostra as 30 compras mais recentes.
15. **Conferências salvas:** a dica citava o botão "Salvar conferência", que se chama "Salvar".
16. **Tela órfã removida:** `app/(tabs)/reports.tsx` era um perfil antigo sem acesso. O voltar de Mais vendidos e de Histórico caía nele e agora vai para Mais.
17. **Botão "+" no celular** (`components/FAB.tsx`) ganhou nome para leitor de tela, como já tinha no computador.

## Ainda aberto (precisa de decisão)

1. **Vendas do mês (`/reports/sales-period`) conta diferente das outras telas.**
   - A "Receita Líquida" desconta duas vezes a venda cancelada e a devolvida.
   - A venda pendente conta como venda.
   - Só pega as 100 vendas mais recentes do mês (`endpoints/sales.py:867` a `898`).
   - Recomendação: usar a mesma conta do Relatório de vendas (`money_ledger`). A ficha manda usar o Relatório de vendas para o número oficial.
2. **Mais vendidos conta só venda concluída.** A venda com devolução parcial sai inteira e a devolução não é abatida. Os números divergem do Relatório de vendas (`endpoints/sales.py:998`).
3. **Histórico:**
   - O filtro de data usa o dia em UTC (`func.date(created_at)`), então uma venda depois das 21h pode cair no dia seguinte.
   - O cartão "Vendido" soma as vendas canceladas.
   - Carrega no máximo 100 itens, sem "carregar mais".
4. **Despesas:** o app não pede mais de 100 despesas por período (padrão do servidor). Uma loja com mais que isso vê a lista e o total cortados.
5. **Recorrência de despesa** não gera nada, só marca. Se a ideia é lançar sozinha todo mês, falta o agendador.
6. **Trocar o banco do PIX** muda para trás onde caiu todo o PIX desde a implantação, porque a conta não grava em qual banco caiu cada venda.
7. **Lucro por lote:** só 30 lotes, sem "mostrar mais".
8. **Exportar CSV do Relatório de vendas:** a função existe (`handleExportCSV`), mas não tem botão.
9. **Conferência:**
   - O resumo mistura unidades: "conferem" conta cores e tamanhos, "faltam" e "sobram" contam peças.
   - O número "Sistema" da conferência salva é o do último salvamento, não o do começo.
10. **Conferência salva (`/reports/stock-counts/[id]`):** não testada no navegador, porque a base de teste não tem conferência salva. O mapeamento da rota é conferido pelo teste de cobertura.
