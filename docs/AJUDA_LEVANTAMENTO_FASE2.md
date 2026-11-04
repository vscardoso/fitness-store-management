# Ajuda, fase 2: levantamento já feito (fornecedores e viagens)

Lido do código em 04/11/2026 para escrever as fichas de `mobile/constants/help/estoque.ts`. Textos entre aspas copiados do código; o teste `test-help-labels.mts` confere de novo ao escrever a ficha. Todas estas telas usam `PageHeader` (o "?" aparece sozinho quando a ficha existir).

Permissões: Fornecedores e Viagens só aparecem no menu para gerente e admin (servidor: `/suppliers*`, `/trips*` e `/supplier-returns` = gerente; excluir fornecedor ou viagem = só admin).

## Fornecedores (`app/suppliers/`, abas em `components/suppliers/SuppliersTabs.tsx`)

Abas: "Fornecedores", "Ranking", "Custos", "Reposição", "Devoluções".

- **`/suppliers` (lista, `index.tsx`):**
  - Busca "Buscar fornecedor..." (nome, CPF/CNPJ ou telefone).
  - Cadastrar:
    1. "+" no celular ou "Novo fornecedor" no computador abre a folha "Selecionar Fornecedor" (`components/suppliers/SupplierPickerSheet.tsx`).
    2. Tocar em "+ Cadastrar novo fornecedor" e preencher "Nome *", "CPF ou CNPJ (opcional)" e "Telefone (opcional)".
    3. Tocar em "Salvar fornecedor"; o app abre a ficha do fornecedor.
  - No computador a lista vira grade de cartões.
- **`/suppliers/[id]` (ficha):**
  - Cartão "Contato".
  - Cartão "Produtos comprados", com "Último preço", "Compras" e "Última compra" de cada produto.
  - Botões "Excluir fornecedor" e "Editar". Os históricos de compra continuam.
- **`/suppliers/ranking`:**
  - Período: "30 dias", "90 dias", "6 meses" (padrão) e "Tudo".
  - Nota de 0 a 100: 60% giro (vendido ÷ comprado) e 40% margem.
  - Selos: "Ótimo" (70 ou mais), "Bom" (45 ou mais), "Atenção" e "Poucos dados".
    - "Poucos dados" no código = menos de 5 unidades COMPRADAS, não vendidas.
  - Métricas: "Giro", "Margem", "Lucro" e "Parado" (valor que sobrou no estoque).
  - Usa o preço pago, já com os descontos do fornecedor.
- **`/suppliers/costs`:**
  - Compara o preço pago pelo mesmo produto em fornecedores diferentes; o mais barato aparece em verde, com "economiza R$ (N%)".
  - A caixa "Aumentos de custo" aparece quando o preço subiu 10% ou mais desde a compra anterior.
  - Vazio: "Nada para comparar ainda" (precisa do mesmo produto comprado de 2 ou mais fornecedores).
- **`/suppliers/restock` (reposição):**
  - "Cobrir quantos dias de venda?" com "15 dias", "30 dias" (padrão), "60 dias" e "90 dias".
  - Regra: variações com estoque até 2 e venda nos últimos 90 dias. Sugestão = ritmo de venda × dias − estoque, no mínimo 1.
  - Agrupado por fornecedor (o de menor último preço); "Sem fornecedor definido" fica por último.
  - Botão "WhatsApp" quando o fornecedor tem telefone, senão "Compartilhar". A mensagem vai sem preço.
- **`/suppliers/returns` (devoluções ao fornecedor):**
  - "Peças com defeito para enviar", com o botão "Enviar ao fornecedor".
  - "Com o fornecedor, esperando resposta", com "Fornecedor trocou", "Creditou" e "Recusou".
    - "Creditou" pede "Valor creditado pelo fornecedor", que abate o custo da entrada de origem.
  - "Já resolvidas".
  - Peça de condicional que está no estoque: abrir a entrada e usar "Devolver ao fornecedor" no item.

## Viagens (`app/(tabs)/trips.tsx`, `app/trips/add.tsx`, `app/trips/[id].tsx`)

- **`/trips` (lista):**
  - Números "Total", "Concluídas" e "Em andamento"; "CUSTO TOTAL" e "CUSTO MEDIO".
  - Selos: "CONCLUÍDA", "EM ANDAMENTO" e "PLANEJADA".
  - "+" no celular ou "Nova viagem" no computador.
- **`/trips/add`:**
  - "Código da Viagem *" (mínimo 5 letras; o app confere se já existe), "Data da Viagem *", "Destino *", horários e "Data de Retorno".
  - Custos: "Combustível (R$)", "Alimentação (R$)", "Pedágios (R$)", "Hospedagem (R$)" e "Outros Custos (R$)".
  - Botão "Salvar Viagem".
  - Os custos da viagem são divididos entre as entradas ligadas a ela, proporcional ao valor da mercadoria, e viram custo extra por peça.
- **`/trips/[id]`:**
  - Botões "Iniciar" (quando planejada), "Concluir" e "Excluir" (só sem entradas e sem vendas).
  - Cartões "INFORMAÇÕES DA VIAGEM", "CUSTOS DA VIAGEM" e "DESEMPENHO DA VIAGEM" ("Investido", "Receita Gerada", "Sell-through" e "Lucro").

## Problemas achados no levantamento

Corrigidos em 04/11/2026: 1 (tela `app/suppliers/edit/[id].tsx` criada), 2, 3 e 7. Continuam abertos: 4, 5, 6, 8, 9 e os da lista seguinte.

1. **Editar fornecedor quebra.** "Editar" e o lápis em `app/suppliers/[id].tsx` levam a `/suppliers/edit/{id}`, mas essa tela não existe ("página não encontrada"). Criar a tela de edição (o servidor tem `PUT /suppliers/{id}`; conferir) ou tirar o botão.
2. **"Ver Viagens" leva a Entradas.** No diálogo de sucesso de Nova Viagem (`app/trips/add.tsx`, perto da linha 674), o botão vai para `/(tabs)/entries` e não para `/trips`.
3. **Jargão na tela.** `app/trips/[id].tsx` diz "Custos incluídos no CMV das vendas realizadas.", e o projeto proíbe jargão na tela. Trocar por "Os custos da viagem entram no custo das peças vendidas."
4. **"Lucro" com o número errado?** O "Lucro" de "DESEMPENHO DA VIAGEM" mostra o campo `roi` em %. Conferir se o rótulo está certo.
5. **Botão de excluir para quem não pode.** A lixeira de cliente aparece para todos, mas o servidor exige gerente. "Excluir fornecedor" e "Excluir" viagem aparecem para gerente, mas só admin pode.
6. **Tipo de cliente nunca muda.** REGULAR/VIP/PREMIUM não aparece em nenhuma tela, e a subida automática (`update_purchase_stats` em `backend/app/models/customer.py`) não é chamada por nenhum código. Decisão do Victor: ligar ou remover.
7. **Textos sem acento.** "CUSTO MEDIO" em `app/(tabs)/trips.tsx`, a seção "Endereco (Opcional)" e as validações em `app/customers/add.tsx`.
8. **Possível bug no checkout (achado na fase 1).** Se a loja tiver uma maquininha cadastrada no servidor, um pagamento único em crédito, débito ou PIX pode ir para "Enviar para Maquininha" em vez do registro manual, mesmo com `maquininhas` desligado (`app/checkout.tsx`, `loadTerminals`). Não testado.
9. **Atalhos do Início para quem não pode (achado na fase 1).** "Entradas" e "Relatórios" aparecem para caixa e vendedor, que devem receber recusa ao abrir.

## Outros achados (produtos, entradas, categorias, inventário, prejuízos), abertos

10. **Busca do celular não acha pelo código.** Em Produtos, a busca diz "Buscar por nome, SKU ou marca..." mas só procura nome e marca.
11. **Excluir sem permissão.** "Excluir Entrada" aparece para gerente, mas só admin exclui. O "+", o lápis e a lixeira de Categorias aparecem para todos; o servidor exige gerente para criar e editar e admin para excluir.
12. **Motivo do erro perdido em Categorias.** As telas leem `err.response.data.detail`; o interceptor entrega `error.message`, então o motivo real (por exemplo, subcategoria ativa) vira a frase genérica. Não testado.
13. **Custo "(opcional)" que não é.** Em Adicionar estoque (`app/entries/add-stock.tsx`) o custo é marcado como opcional, mas o servidor recusa custo zero. Produto com várias variações provavelmente é recusado ali (vai sem variação).
14. **Rótulos do Inventário que não batem com a regra.**
    - "Estoque Baixo (<3)" e "menos de 3 unidades": a regra é "até o mínimo do produto".
    - "Lucro do mês" mostra o período escolhido.
    - "Entradas por Mês" usa só as 10 últimas entradas.
15. **Prejuízo avulso.**
    - Data em AAAA-MM-DD e custo com ponto.
    - Não baixa o estoque (a ficha explica).
    - O detalhe pode mostrar o custo errado (o texto gravado traz "R$").
16. **Fornecedor por item na Nova entrada.** A troca só existe em produto sem variação, embora a dica diga para trocar "na lista de itens".
17. **Lista de Categorias.** Mostra só as categorias principais; subcategoria não abre pela lista.
18. **Scanner IA.** "Criar Produto" cria o produto antes da entrada (o assistente grava tudo junto); sem categoria sugerida usa a categoria 1.
