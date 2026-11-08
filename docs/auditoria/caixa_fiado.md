# Auditoria: caixa da gaveta e fiado (2026-11-08)

Testes: `backend/tests/audit/caixa_fiado/` (test_audit_caixa.py, test_audit_fiado.py). 22 casos; 20 passam, 2 falham (os 2 bugs abaixo).
Comando: `TEST_DATABASE_URL=sqlite+aiosqlite:///./test_audit_cf.db SECRET_KEY=... DATABASE_URL=sqlite:///./test_audit_cf.db ENVIRONMENT=test python -m pytest tests/audit/caixa_fiado -q --no-cov -p no:cacheprovider`

## (a) Cenarios cobertos
Caixa: livro independente em Decimal passo a passo (abertura 37,15, vendas com centavos 19,99 / 33,33x3 / 0,07x2, PIX fora da gaveta, suprimento 12,34, sangria 0,01) contra /cash/current e o saldo da Gaveta no Financeiro; fechar com diferenca de 1 centavo; sangria igual ao saldo (passa) e 1 centavo a mais (400); sangria nao conta PIX; abrir com caixa aberto (409); fechar fechado (409); movimentar sem caixa (409); corpos invalidos (422); sessao inexistente (404); devolucao em dinheiro parcial, devolucao acima do vendido, venda com devolucao nao cancela, venda sem devolucao cancela e sai do esperado; abrir/fechar 3 vezes seguidas e historico.
Fiado: 1, 2, 3, 5, 7 e 12 parcelas para totais 100,00 / 99,99 / 1234,57 (soma exata, sobra na ultima, nenhuma zerada); intervalos 7, 15 e 30 (fim de mes); erros de criacao (sem cliente, 0 e 13 parcelas, intervalo 10, vencimento passado, cliente inexistente, data lixo) sem vender nem baixar estoque; recebimento parcial/total, ordem das parcelas mais antigas, excesso, receber de parcela especifica; desfazer recebimento em qualquer ordem e duas vezes (404); fiado antigo (validacoes, cancelar, cancelar com recebimento, cancelar duas vezes, cancelada nao recebe, parcela de venda nao cancela); recebimento por forma (cash, pix, bank_transfer, debit, credit) nas contas Gaveta / Nubank / Maquininha, conservacao do total e esperado do caixa; devolucao parcial abatendo as ultimas parcelas, so a parte paga volta em dinheiro; cancelar venda com recebimento (400) e depois de desfazer (200, estoque volta); cliente com varios fiados (ordem global por vencimento, vencidos, outra cliente intacta).

## (b) BUGS confirmados
1. **POST /receivables/receive devolve 500 com `customer_id` ou `receivable_id` nao numerico** (gravidade media).
   Passos: `{"customer_id":"abc","amount":"5","payment_method":"cash"}`; idem `receivable_id:"abc"` e `customer_id:[1]`.
   Esperado: 400 "Escolha a cliente/parcela". Obtido: ValueError/TypeError em `receivable_service.py:220-222` (`int(data["customer_id"])` sem try) vira 500.
   Teste: `test_audit_fiado.py::test_erros_de_recebimento_sem_500`.
2. **Fiado de valor pequeno em muitas parcelas gera parcelas de R$ 0,00** (gravidade baixa).
   Passos: venda de R$ 0,05 no fiado em 12 parcelas. Esperado: recusar (ou reduzir parcelas). Obtido: 11 parcelas de 0,00 e a ultima de 0,05 (`split_amount`).
   Teste: `test_parcelas_somam_o_total_e_sobra_na_ultima[0.05]`.

## (c) Melhorias
- `receive`/`opening` recebem `Dict` livre (Body): trocar por modelo Pydantic evita toda uma classe de 500.
- Validar que o valor da parcela seja >= 0,01 e sugerir numero maximo de parcelas pelo total.
- Caixa conta o dinheiro de fiado pelo `created_at` do recebimento e o Financeiro pelo `received_on`; recebimento com data retroativa pode cair em dias/turnos diferentes nas duas telas (nao testado a fundo).

## (d) Nao coberto
Concorrencia (ja ha testes em tests/pg), fechamento de mes com fiado, troca com diferenca no fiado, receber com `received_on` retroativo e mes fechado, permissao por papel (ja em test_caixa/test_fiado), Postgres real (so SQLite).

## Revalidação (D-03 e D-04)
- Os 2 bugs originais agora passam (id inválido dá 400; R$ 0,05 em 12 parcelas dá 400; parcela única segue). Bordas: R$ 12,00 em 12 = 12 x 1,00 ok; R$ 11,99 em 12, R$ 1,99 em 2 e R$ 0,05 em 2 = 400; R$ 2,00 em 2 ok; recusadas não deixam parcela nem baixam estoque.
- **BUG NOVO (xfail estrito)**: `cash_received_between` agora filtra por dia (`received_on` entre o dia da abertura e o do fechamento). Dois turnos no mesmo dia: o fiado em dinheiro recebido no turno 1 aparece também no esperado do turno 2 (30,00 em dobro: esperado 110 em vez de 80 no 2º turno, mesmo abrindo com os 80 contados). Gravidade: média/alta (esperado errado gera diferença falsa no fechamento do 2º turno). Teste: `test_audit_fiado_d03_d04.py::test_d04_dois_turnos_no_mesmo_dia_nao_contam_o_mesmo_recebimento_duas_vezes`. Causa: sem horário no `received_on`, o filtro por data não separa turnos.
- Recebimento retroativo (ontem e 45 dias atrás) e PIX não entram no turno de hoje; hoje entra.
