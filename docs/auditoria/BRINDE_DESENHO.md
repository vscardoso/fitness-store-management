# Fluxo de brinde: desenho (08/11/2026)

Só desenho. Nenhum código do app foi alterado. Hoje a venda de total zero é recusada ("Venda sem valor. Para dar um brinde, o fluxo próprio ainda está em construção", `sale_service.py:240`), então a loja não consegue dar uma peça de graça de forma registrada.

Base lida: CLAUDE.md, `BACKLOG_FASE1.md`, `stock_ledger.py` (livro de movimentos do estoque por lote), `money_ledger.py` (conta única de receita, custo e lucro).

---

## (a) O que é brinde na loja

Peça que sai do estoque e vai para a cliente (ou outra pessoa) sem cobrança. Três situações reais:

| Tipo | Exemplo | Quem recebe |
|---|---|---|
| Junto com uma venda | Cliente compra um conjunto de R$ 200 e ganha uma faixa de cabelo de R$ 10 (custo R$ 4) | Cliente cadastrada |
| Cortesia | Cliente fiel faz aniversário e ganha uma regata (custo R$ 25) | Cliente cadastrada |
| Divulgação | Influenciadora ganha um conjunto (custo R$ 60) para postar | Pessoa de fora, sem cadastro de cliente |

O que NÃO é brinde (já tem fluxo próprio): desconto (a cliente paga menos), peça trocada, peça em condicional, perda/avaria/furto (Conferência), devolução ao fornecedor.

A peça deu prejuízo de custo, mas não entrou dinheiro. O sistema precisa mostrar isso como um gasto da loja, nunca como venda.

---

## (b) Regras propostas e o que o dono precisa decidir

Para cada decisão: exemplo em reais, opções e a minha recomendação. Em todos os exemplos: conjunto vendido por R$ 200 (custo R$ 80), brinde = faixa (custo R$ 4) e regata (custo R$ 25), mês com vendas de R$ 10.000 e custo das peças vendidas de R$ 4.000.

### D1. O custo do brinde é "gasto de marketing" ou "perda"?
Isso decide em qual linha do Resultado do Mês a peça aparece.
- **Opção A, Marketing/Brinde (recomendada):** linha própria "Brindes". Regata de R$ 25 e influenciadora de R$ 60 aparecem como R$ 85 de brinde. O dono enxerga o que gasta para atrair cliente e não mistura com furto ou peça estragada.
- **Opção B, Perda:** entra junto de perdas e avarias. Mistura "dei de propósito" com "perdi sem querer"; o dono não consegue avaliar se brinde compensa.
- **Opção C, duas linhas escolhidas pelo tipo:** brinde com venda e cortesia = marketing; divulgação = marketing; nenhuma vai para perda. (Na prática igual à A; só vale se o dono quiser separar "brinde de cliente" de "divulgação" em duas linhas.)

### D2. Como entra no Resultado do Mês?
- Receita do brinde = R$ 0.
- O custo da peça (já com frete/desconto do lote, o "custo posto") vira despesa "Brindes" no dia em que foi dado.
- Exemplo: mês tinha lucro de R$ 6.000 (10.000 - 4.000). Brindes de R$ 89 (faixa 4 + regata 25 + influenciadora 60). Lucro do mês = R$ 5.911.
- **Opção A (recomendada):** custo do brinde entra como despesa, e NÃO no "custo das peças vendidas". Assim a margem das vendas (60%) não cai por causa de brinde, e o brinde aparece sozinho.
- **Opção B:** entra no custo das peças vendidas. A margem cai de 60% para 59,1% e o dono não vê por quê.

### D3. Brinde dá pontos de fidelidade?
- Exemplo: regata de preço R$ 60 dada à cliente. Com a regra de 1 ponto a cada R$ 10: valeria 6 pontos, valor de R$ 0,60 de cashback.
- **Opção A (recomendada): não dá pontos.** Ela não pagou nada; pontos são por dinheiro gasto. Evita brinde virar moeda.
- **Opção B:** dá pontos pelo preço de tabela. Cria "dinheiro" sem entrada real de caixa; não recomendo.
- A venda principal (o conjunto de R$ 200) continua dando 20 pontos normalmente; só o brinde fica de fora.
- Também não entra no "total gasto" nem no "nº de compras" da cliente.

### D4. Pode brinde sem cliente cadastrada?
- Exemplo: influenciadora que não está no cadastro.
- **Opção A (recomendada):** cliente é opcional; se não houver, o motivo é obrigatório e a loja escreve o nome ("Influenciadora Maria, @maria"). Fica rastreável.
- **Opção B:** exigir sempre cliente cadastrada: mais rastreável, mas trava a divulgação (obriga cadastrar quem não é cliente, e isso mistura com o CRM e a LGPD).
- **Opção C:** nunca exigir nada (sem cliente e sem motivo): proibido por mim; é por aí que estoque some sem explicação.

### D5. Limite por papel e por mês?
Quem pode dar brinde e até quanto. Sugestão com exemplos:

| Papel | Pode dar brinde? | Limite sugerido |
|---|---|---|
| Admin (dono) | Sim | Sem limite |
| Gerente | Sim | Até R$ 150 de custo por brinde e R$ 500 de custo por mês |
| Vendedor | Só junto de uma venda do próprio atendimento | Até R$ 30 de custo por brinde; R$ 100 por mês por pessoa |
| Caixa | Não | - |

- Estourou o limite: o sistema recusa com frase ("Passou do limite de brinde deste mês. Peça para a dona liberar."), e o admin pode liberar.
- Os valores acima são sugestão: o dono escolhe os números; cada loja guarda os seus (configuração por loja, como o prazo de troca).
- **Opção simples:** sem limites em R$, só papéis (admin e gerente sim; vendedor e caixa não). Menos controle, menos configuração.

### D6. Exige motivo?
- **Opção A (recomendada): motivo sempre obrigatório**, escolhido numa lista + texto livre opcional: "Junto com a venda", "Cortesia / aniversário", "Divulgação / influenciadora", "Outro" (texto obrigatório). Mínimo de 3 letras, igual à devolução.
- **Opção B:** motivo só acima de um valor (ex.: custo > R$ 30). Brinde pequeno sai rápido, mas depois não dá para saber por que a faixa de R$ 4 saiu.

### D7 (adicional). Brinde acompanhando a venda pode ser parte da mesma venda?
- **Opção A (recomendada):** registro separado, ligado à venda (campo "junto da venda #N"). A venda continua com seu total real e o brinde tem seu próprio comprovante e estorno; não mexe em ticket médio nem em quantidade de vendas.
- **Opção B:** linha de R$ 0 dentro da própria venda. Mais natural no balcão, mas contamina o ticket médio (venda de R$ 200 com 2 peças passa a "R$ 100 por peça") e os relatórios de peças vendidas. O desenho abaixo usa a opção A; a tela pode oferecer o brinde dentro do checkout e gravar como registro separado (o dono vê uma coisa só).

### D8 (adicional). Brinde de peça sem estoque ou de peça de vitrine?
Regra proposta: brinde só sai de peça COM estoque (nunca deixa o estoque negativo). Peça de vitrine/mostruário sem lote não entra neste fluxo (é ajuste de estoque).

---

## (c) Efeitos no sistema

### Estoque (FIFO e livro)
- O brinde baixa o estoque pelo mesmo FIFO da venda (peça mais antiga primeiro), com as fontes guardadas (`entry_item_id`, quantidade, custo de cada camada), para a devolução voltar à camada certa.
- `stock_ledger.REASONS` ganha o motivo novo `"brinde"` ("Brinde dado à cliente") e `"brinde_volta"` ("Brinde devolvido ao estoque"). Todo `UPDATE` de `quantity_remaining` do brinde roda dentro de `with stock_reason("brinde", user_id=..., ref="gift:ID")`; sem isso o modo estrito dos testes falha (regra do livro).
- `"brinde"` NÃO entra em `REMOVAL_REASONS` (que é "saiu sem venda e sem motivo claro": baixa, ajuste, exclusão). Brinde tem tela própria e dono: aparece em coluna separada.
- Trava de corrida: `lock_stock` por variação (mesma ordem das vendas), senão dois brindes simultâneos levariam a última peça.
- Conferência: a baixa pelo brinde é uma saída com motivo; a Conferência de Estoque já reconcilia saldo com o livro, então não gera "falta" misteriosa.

### Dinheiro
- Receita do brinde = R$ 0. Nada em `payments`, nada no caixa da gaveta, nada no Financeiro (saldos de gaveta/banco/maquininha não mudam), nada em fiado.
- O custo posto (`unit_cost + extra_unit_cost`, o mesmo que o FIFO grava na venda) vira despesa "Brindes" do dia, SEM sair de nenhuma conta (não é pagamento; o dinheiro já saiu quando a loja comprou a peça).
- `money_ledger.period_totals`: brinde NÃO entra em `gross_sales`, `sales_count`, `pieces_sold` nem `cost_sold` (decisão D2). Entra num campo novo `gift_cost` (e `gift_count`, `gift_pieces`), exibido no Resultado do Mês como linha "Brindes". Regra que o auditor vai conferir: `lucro do mês = receita - custo das vendidas - despesas - brindes`.
- Dia do Brasil (`br_day`), igual ao resto, para a despesa cair no mesmo dia do brinde.

### Relatórios
| Relatório | O que muda |
|---|---|
| Início / Vendas do mês / Mais vendidos | Nada: brinde não é venda. |
| Resultado do Mês | Nova linha "Brindes (custo das peças dadas)". |
| Lucro por lote (`/stock-entries/{id}/analytics`) | Lote mostra "Dadas de brinde: N peças, R$ X" e entra na conta fechada `recebidas = vendidas + em estoque + brindes + baixadas`; o custo do brinde reduz o lucro do lote (peça saiu, nada entrou). Sem isso o lote fica com "peças sumidas". |
| Saúde do Estoque | `sell_through`: brinde não conta como vendida; conta numa coluna `gifts` (não vai em `other_out`, para não parecer perda). Não é "parada" (saiu do estoque). |
| Rastreio do estoque por lote | Linha "Brinde" com quem deu, quando, para quem (livro `entry_item_events`, `reason="brinde"`). |
| Saídas sem venda | Lista continua só com baixa/ajuste/exclusão; brinde tem relatório próprio "Brindes dados" (data, peça, cor/tamanho, quem deu, para quem, motivo, custo). |
| Relatório mensal e PDF | Linha de brindes e total no mês. |

---

## (d) Desenho de API e de tela

### Tabela nova `gifts` (migração aditiva)
`id`, `tenant_id`, `gift_number` (BRINDE-AAAAMMDD-xxxx), `status` (`given` | `returned`), `reason_type` (`with_sale`, `courtesy`, `promotion`, `other`), `reason_note`, `customer_id` (opcional), `recipient_name` (opcional se há cliente), `related_sale_id` (opcional), `given_by_id`, `total_cost`, `created_at`, `cancelled_*`.
Itens `gift_items`: `product_id`, `variant_id`, `quantity`, `unit_cost` (custo posto médio das camadas), `sale_sources` (mesmo formato FIFO da venda), `quantity_returned`.
Preço de tabela da peça é guardado só como informação (`list_price`), para o comprovante e relatório "valor de vitrine dado".

### Rotas (`/gifts`)
| Rota | Quem | Faz |
|---|---|---|
| `POST /gifts/` | gerente, vendedor (com limite), admin | Cria: `items[{variant_id, quantity}]`, `reason_type`, `reason_note`, `customer_id?`, `recipient_name?`, `related_sale_id?`. Tudo ou nada; recusa estoque insuficiente (400 "Sem estoque da peça..."), limite estourado (403 com frase), sem motivo (422). |
| `GET /gifts/` e `/{id}` | gerente, admin | Lista com filtros (período, quem deu, cliente) e detalhe com custo. |
| `GET /gifts/{id}/receipt` e `/receipt/pdf` | vendedor para cima | Comprovante "Brinde, sem valor". |
| `POST /gifts/{id}/return` | gerente, admin | Devolve ao estoque (ver f). |
| `POST /gifts/{id}/cancel` | gerente, admin | Cancela (ver f). |
| `GET/PUT /store/gift-settings` | leitura: todos; escrever: admin | Limites e papéis (D5). |

- Matriz de papéis (`core/permissions.py`, `RULES`): rota nova exige regra, senão cai em "gerente" (e o teste "toda rota tem regra" falha). Proposta: criar = vendedor (limite checado dentro) / gerente / admin; caixa nunca; ler custo = gerente. Máscara de custo (`cost_mask`): caixa e vendedor não recebem `total_cost`/`unit_cost` (chave `cost` já cai na regra); o vendedor vê só "peça, quantidade, motivo" e o limite restante em R$ de PREÇO, não de custo (para não vazar custo).
- Auditoria: `AuditLog` `GIFT_CREATED`, `GIFT_RETURNED`, `GIFT_CANCELLED` (quem, quanto custou, motivo).
- Push: avisa admin e gerente ("Brinde de R$ 25 (custo) dado por Joana"), como a devolução.

### Tela
- Menu Mais > Estoque > "Dar um brinde" (e atalho "Dar brinde" na tela da venda concluída e na ficha da cliente).
- Passos: 1. Escolher a peça (o mesmo seletor `ProductPicker`/leitor de etiqueta do condicional) e quantidade; 2. Para quem (cliente cadastrada, ou "Outra pessoa" + nome); 3. Motivo (lista) e observação; 4. Resumo: "Esta peça vai sair do estoque sem cobrança. Custo para a loja: R$ 25,00" (só admin/gerente veem o custo; vendedor vê o valor de vitrine) e botão "Dar brinde". Erro de limite aparece dentro do formulário com a frase.
- Chave de funcionalidade `brinde` (`constants/features.ts`) nasce falsa até o dono liberar.
- Ficha de ajuda da tela (`constants/help/`), exigida pelo teste de cobertura.
- Texto sem jargão: "brinde", "custo para a loja", nunca "CMV" ou "despesa de marketing" na tela.

### Comprovante
Mesmo gerador do comprovante de venda (`sale_receipt_service`), com a faixa "BRINDE, SEM VALOR" e "Valor de vitrine: R$ 60,00 (cortesia da loja)". Nunca sai custo, fornecedor nem código interno; diz "sem valor fiscal". Pode ser enviado pelo WhatsApp oficial (regra da janela de 24 h igual à do comprovante da venda). Não leva prazo de troca (brinde não troca) a menos que o dono decida o contrário em D9.

### D9 (adicional). Brinde pode ser trocado pela cliente?
Sugestão: não troca nem devolve em dinheiro, só o gerente pode devolver ao estoque (ver f).

---

## (e) Casos de teste de auditoria que valeriam

Premissas: peça A custo posto R$ 25, vitrine R$ 60, 10 em estoque; conjunto C vendido a R$ 200, custo R$ 80. Mês limpo.

| # | Cenário | Esperado em R$ e em peças |
|---|---|---|
| 1 | Brinde de 1 peça A para cliente cadastrada | Estoque A 10 -> 9; receita do mês R$ 0; vendas contadas +0; despesa "Brindes" R$ 25; caixa e contas inalterados; livro `entry_item_events` com `reason="brinde"`, delta -1; pontos da cliente inalterados; total gasto inalterado |
| 2 | Venda do conjunto C (R$ 200) + brinde da peça A ligada à venda | Receita R$ 200, custo vendido R$ 80, brindes R$ 25; lucro do mês = 200 - 80 - 25 = R$ 95; ticket médio = R$ 200 (não R$ 100); 20 pontos pela venda, 0 pelo brinde |
| 3 | Brinde de 2 peças A em duas camadas de custo (1 a R$ 20, 1 a R$ 30) | Custo do brinde R$ 50; cada camada baixa 1; `sale_sources` do item com as 2 camadas |
| 4 | Brinde acima do estoque (11 de 10) | 400 com frase, nada gravado, estoque 10 |
| 5 | Dois brindes simultâneos da última peça (Postgres) | Um passa, outro 400; estoque 0, nunca -1 |
| 6 | Sem motivo / motivo "ab" / `reason_type` inválido | 422 com frase |
| 7 | Sem cliente e sem nome | 422 "informe para quem é o brinde" |
| 8 | Vendedor dá brinde de custo R$ 40 com limite R$ 30 | 403 com frase; nada gravado; com admin = 201 |
| 9 | Vendedor dá 4 brindes de R$ 30 com limite mensal R$ 100 | Os 3 primeiros passam (R$ 90); o 4º recusa (R$ 120 > 100) |
| 10 | Caixa tenta brindar | 403 |
| 11 | Caixa/vendedor leem `GET /gifts` ou detalhe | Vendedor 403 na lista; nenhum custo em respostas de caixa/vendedor (máscara) |
| 12 | Brinde de outra loja (variação de outra loja) | 404/400; loja B não vê brinde da loja A |
| 13 | Brinde devolvido ao estoque (peça em bom estado) | Estoque 10 -> 9 -> 10; despesa "Brindes" do mês volta a R$ 0 (no dia da devolução, não retroativa: ver f); camada FIFO de origem recebe a peça |
| 14 | Brinde cancelado no mesmo dia por engano | Mesmo efeito de 13; status `cancelled`; auditoria; não cancela duas vezes (400) |
| 15 | Devolver 2 vezes / devolver mais que o dado | 400 "já devolvido" / "excede o dado" |
| 16 | Brinde com peça defeituosa devolvida (não volta) | Estoque inalterado; custo continua como brinde/prejuízo; `quantity_defective` na fonte, igual à devolução de venda |
| 17 | Fechamento do mês com brinde | Mês fechado recusa brinde datado nele (409), como lançamento e transferência; aparece em `changed_since_close` se brinde for criado depois |
| 18 | Conta fechada do lote | `recebidas = vendidas + em estoque + brindes + baixadas` para 40 cenários aleatórios (como `test_conta_fiel`) |
| 19 | Saúde do Estoque | Brinde não conta como vendida nem como `other_out`; coluna `gifts` correta |
| 20 | Conta única | Soma de todas as telas (Início, Resultado do Mês, Relatório mensal, PDF) mostra o MESMO valor de brindes: `ESTRESSE_OPS` do `test_estresse_dinheiro` ganha operações de brinde |
| 21 | Comprovante | Tem "BRINDE, SEM VALOR"; não contém custo, fornecedor nem SKU interno (PDF lido com `pdftotext`) |
| 22 | Venda de total zero | Continua recusada com a frase do fluxo próprio (não pode virar brecha para brinde sem registro) |
| 23 | Cliente anonimizada (LGPD) | Brinde continua no relatório, sem nome |
| 24 | Brinde ligado a venda cancelada | A venda cancela (se permitido) e o brinde NÃO muda sozinho; aparece aviso. Decisão D10 |

### D10 (adicional). Venda cancelada que tinha brinde junto
Opção A (recomendada): o brinde fica como está (a peça já saiu); o sistema avisa "esta venda tinha um brinde, ele continua dado". Opção B: cancelar a venda sugere devolver o brinde. Por segurança o sistema nunca cancela o brinde sozinho.

---

## (f) Devolução e cancelamento de brinde

Dois conceitos para não confundir:
- **Cancelar** (engano de lançamento): o brinde foi lançado errado (peça errada, cliente errada). Só admin e gerente, no mesmo mês, com motivo. A peça volta ao estoque nas MESMAS camadas FIFO (`quantity_returned` na fonte, motivo de estoque `brinde_volta`), a despesa de brinde sai do mês (como se nunca tivesse existido), registro `GIFT_CANCELLED`. Mês já fechado: recusa (409), pede reabrir o fechamento (admin).
- **Devolver** (a cliente trouxe a peça de volta): só o gerente/admin. Peça em bom estado volta ao estoque; a despesa de brinde é estornada NO DIA da devolução (igual a devolução de venda: abate no dia em que acontece; o dia pode ficar com brinde negativo). Peça com defeito/usada: não volta (`restock=false`), marca `quantity_defective` na fonte e o custo continua como brinde.
- Brinde nunca gera dinheiro de volta (não há o que reembolsar): proibido `refund_method` em dinheiro; a loja não paga nada à cliente.
- Brinde nunca é trocado por outra peça no fluxo de troca (a "troca" de brinde seria brinde novo, com registro novo).
- Devolução parcial (quantidade 2, devolve 1): mesma lógica de quantidades já devolvidas por linha, valores em custo proporcional com fechamento do centavo na última (mesma regra D-01 da devolução de venda: a soma nunca passa do custo dado).
- Pontos: brinde não dá pontos (D3), então não há estorno de pontos.
- Brinde ligado a uma venda: devolver a venda (ou parte) NÃO mexe no brinde (D10).

---

## Resumo das decisões do dono

1. Custo do brinde: marketing (recomendado), perda, ou duas linhas? (D1/D2)
2. Brinde dá pontos de fidelidade? (recomendado: não) (D3)
3. Pode brinde sem cliente cadastrada? (recomendado: sim, com nome e motivo) (D4/D6)
4. Quem pode dar brinde e até quanto (por brinde e por mês)? Tabela sugerida em D5.
5. Brinde junto da venda é registro separado (recomendado) ou linha de R$ 0 na própria venda? (D7)

Menores: D8 (só peça com estoque), D9 (brinde não troca), D10 (venda cancelada não mexe no brinde).

## Ordem sugerida de construção
1. Modelo `gifts`/`gift_items` + migração aditiva; motivos `brinde` e `brinde_volta` no `stock_ledger`.
2. Serviço (FIFO, trava, limites) + `money_ledger` (campo `gift_cost`) + Resultado do Mês.
3. Rotas + matriz de papéis + máscara de custo + auditoria.
4. Relatórios (lote, Saúde do Estoque, rastreio, "Brindes dados").
5. Comprovante, tela, ajuda, chave `brinde`.
6. Testes de auditoria da tabela (e), incluindo concorrência em Postgres.
