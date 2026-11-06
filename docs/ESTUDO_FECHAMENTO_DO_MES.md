# Estudo: fechamento do mês e fiado (2026-11-06)

Origem: planilha mensal da dona da W.A (aba "Outubro", print de 06/11/2026) e a pergunta do Victor se "Caixa da gaveta" e "Contas e saldos" fazem sentido como dois menus.

## 1. O que a planilha faz hoje

Três blocos, de cima para baixo:

1. **Estoque a preço de venda**: por produto, quantidade, preço, total, vendido e o que sobra. Totais: venda 65.589,00, vendido 27.011,10, estoque 38.577,90. O Provador já tem isso (estoque e vendas), só não mostra nesse formato.
2. **Quanto deveria ter** (fluxo de caixa do mês):
   - começa com o saldo do banco (7.535,00) e o dinheiro (1.680,00);
   - soma o que clientes pagaram do fiado (nomes com ✅);
   - tira as saídas: compras de mercadoria, impostos (municipal, federal), faturas de cartão de crédito (de pessoas diferentes), contas fixas (aluguel, água, energia, Algar), propaganda, blogueira, costureira, café, carro, **retirada das sócias** (4.000,00), "despesa caixa", desconto;
   - resultado: **11.747,51** ("Total vendas").
3. **Quanto tem** (conferência):
   - banco 6.675,00, dinheiro guardado 700,00, empréstimo a receber 200,00;
   - **clientes que devem**: 10 lançamentos, 4.211,05, vários com data de parcela (06/11, 13/11, 20/11, "2x 214,85");
   - resultado: **11.786,05** ("Total caixa"); diferença 38,54 ("Quebra de caixa").

Leitura: é um **fechamento de caixa mensal** (regime de caixa), não um resultado contábil. O que ela precisa ver é "o dinheiro bate?" e "quem me deve".

Dúvidas para a dona (não travam o desenho):
- ~~o verde no bloco 3~~: respondido em 06/11/2026, verde = **valor a receber** (fiado em aberto, lançar com "Lançar fiado antigo").
- o que é o amarelo 10.162,25 (não sai de nenhuma soma óbvia)?
- fiado tem entrada? as parcelas são semanais (13/11 e 20/11 sugerem que sim)? cobra juros ou multa? (assumido: não)

## 2. O que o Provador tem e o que falta

| Na planilha | No Provador | Situação |
|---|---|---|
| Estoque a preço de venda | Estoque e Relatório de vendas | existe |
| Saldo do banco e da gaveta | Financeiro > Contas e saldos (saldo calculado desde a implantação) | existe |
| Vendas do mês | `money_ledger.period_totals` | existe |
| Despesas (contas fixas, compras, propaganda) | Despesas e Despesas a pagar | existe |
| **Clientes que devem (fiado, parcelas)** | nada | **falta (fase 1)** |
| Retirada das sócias, empréstimo | só como despesa (distorce o Resultado do mês) | **falta (fase 2)** |
| Fatura do cartão de crédito da loja | despesa | decidir (fase 2) |
| Fechamento: deveria ter x tem x quebra | nada (o caixa da gaveta fecha por turno, não o mês) | **falta (fase 3)** |

## 3. Menus

"Caixa da gaveta" e "Contas e saldos" repetem: Contas e saldos já mostra o cartão do caixa no topo. Proposta:
- admin e gerente: um item só, **Fechamento do mês** (absorve Contas e saldos; o caixa da gaveta vira um cartão dentro dele);
- caixa e vendedor: continuam vendo só **Caixa da gaveta** (é o que usam no turno).
- grupo Dinheiro da barra lateral fica: Fechamento do mês, Fiado (a receber), Resultado do mês, Despesas.

## 4. Fase 1: fiado (contas a receber)

Regras:
- **Forma de pagamento nova "Fiado"** no checkout e no condicional: exige cliente cadastrada; parcelas (1 a 12), primeiro vencimento e intervalo (semanal, quinzenal, mensal; padrão mensal); pode ter entrada em outra forma (pagamento misto, como hoje).
- Cada parcela vira um **recebível** (`receivables`): cliente, venda, número da parcela, valor, vencimento, valor recebido, situação (em aberto, parcial, paga, cancelada). Valores das parcelas: divisão em centavos com a sobra na última.
- **Receber**: valor (parcial permitido), data, conta onde entrou (gaveta, banco). Grava `receivable_payments`; o Financeiro soma na conta escolhida; se for na gaveta com caixa aberto, entra no esperado do caixa. Desfazer recebimento (como desfazer pagamento das despesas).
- **Receita**: a venda fiado conta na receita no dia da venda (igual hoje; o Resultado do mês é por competência). O **dinheiro** só entra nas contas quando recebe (o fechamento é por caixa). A tela deixa isso escrito em linguagem simples.
- **Devolução** de venda fiado: abate primeiro do que ela ainda deve (parcelas em aberto, da última para a primeira); só o que passar volta como dinheiro/crédito pela regra atual.
- **Cancelar venda** fiado: cancela as parcelas em aberto; com recebimento já feito, recusa (usar devolução), igual à regra de hoje para venda com devolução.
- **Saldo de abertura**: lançar fiado antigo sem venda (implantação): cliente, valor, vencimento, observação. É o que permite trazer os 4.211,05 de hoje.
- Ficha da cliente: "Deve R$ X", parcelas, atrasadas em destaque, botão Receber. Total gasto da cliente continua pela venda (não muda).
- Tela **Fiado** (a receber): total em aberto, vencidas, a vencer nesta semana, lista por cliente; filtro por situação; botão Receber.
- Permissões: vender fiado = vendedor para cima; receber = caixa para cima (é dinheiro entrando); lançar saldo antigo, cancelar parcela e desfazer recebimento = gerente/admin.
- Fase 1b (depois): limite de fiado por cliente, lembrete pelo WhatsApp no vencimento (modelo aprovado pela Meta).

## 5. Fase 2: saídas que não são despesa

Tipo de saída "Retirada de sócio", "Empréstimo dado", "Empréstimo recebido de volta": tira/põe dinheiro da conta e aparece no fechamento, mas **não entra no Resultado do mês**. Fatura do cartão de crédito da loja: se as compras do cartão já foram lançadas como despesa, pagar a fatura é só saída de caixa; se não, é despesa. Decidir com a dona qual é o caso dela.

## 6. Fase 3: tela Fechamento do mês

Mesma ordem da planilha:
1. **Começo do mês**: banco, gaveta (vem do fechamento anterior ou da implantação).
2. **Entrou**: vendas por forma (dinheiro, PIX, cartão), recebimentos de fiado, outras entradas.
3. **Saiu**: despesas agrupadas por categoria, compras de mercadoria, retiradas de sócio, empréstimos.
4. **Deveria ter** = 1 + 2 - 3 (por conta).
5. **Tem**: saldo do extrato (digitado), dinheiro contado (digitado), maquininha a receber, fiado em aberto (automático, com vencimentos), empréstimos a receber.
6. **Diferença** (quebra de caixa), com campo de observação.
7. Bloco de estoque: a preço de venda e de custo, vendido no mês.

"Fechar o mês" guarda a fotografia (`month_closings`) e o saldo contado vira o começo do mês seguinte. Mês fechado não muda; lançamento retroativo num mês fechado mostra aviso.

## 7. Ordem

1. Fiado: servidor (modelos, migração, venda, devolução, cancelamento, Financeiro, caixa), testes; depois checkout, ficha da cliente, tela Fiado, saldo de abertura.
2. Saídas que não são despesa.
3. Fechamento do mês + reorganização dos menus.
