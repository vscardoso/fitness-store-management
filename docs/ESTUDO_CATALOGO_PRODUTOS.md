# Estudo: catálogo de produtos, reaproveitar produto e código da etiqueta (2026-11-01)

Pergunta do Victor: ao comprar de novo um produto que já existe, o sistema deve reaproveitar o produto e manter o mesmo código (ex.: `#123-1`), como num catálogo de produtos cadastrados. Hoje dá para usar um produto cadastrado numa NOVA entrada, mas dá para incluir um produto já cadastrado numa entrada que JÁ EXISTE?

Método: leitura do código (backend e app) e experimentos reais contra um servidor local descartável (SQLite, scripts do estudo no scratchpad da sessão). O que foi só lido, sem executar, está marcado.

## 1. Resposta curta

- **Sim, dá para incluir um produto já cadastrado numa entrada existente**, e o código se mantém. Testado: a mesma variação entrou em 3 entradas diferentes e continuou `#001-2`. Uma cor/tamanho nova do mesmo produto entrou na entrada existente e ganhou o próximo número da variação (`#001-3`), sem mudar o número do produto.
- **Mas o caminho do app tem furos**: o botão "Produto já cadastrado" da entrada existente ESCONDE parte dos produtos (os "publicados no catálogo"), a lista da NOVA entrada só enxerga os 100 primeiros produtos, e o cadastro manual de um produto repetido gera outro produto com OUTRO código (`#003-1`), sem avisar.
- A ideia de catálogo existe no backend, mas o sinalizador que a representa (`is_catalog`) foi usado para duas coisas diferentes, e isso quebra a regra de reaproveitar.

## 2. Como o código nasce (fato, do código e dos testes)

- Produto tem `products.code_number` (número por loja). Variação tem `product_variants.product_code` e `variant_number` (número dentro do produto). Código exibido: `display_code` = `#<produto>-<variação>`.
- O número do produto nasce quando o produto ganha a primeira variação com SKU. O número da variação sobe 1, 2, 3 e nunca é reaproveitado. As colunas ficam na VARIAÇÃO, então o código impresso na etiqueta acompanha a variação (isso importa para mesclar produtos, seção 6).
- **Regra que o Victor quer, e que já vale**: reaproveitar o produto = mesmo `#`; reaproveitar a variação (mesma cor e tamanho) = mesmo `#-n`; cor/tamanho novo = próximo `#-n`; produto novo de verdade = `#` novo.
- **Onde ela falha**: cadastrar "de novo" pelo assistente cria OUTRO produto e portanto OUTRO número. Provado: produto original `#001-1`, duplicata `#003-1`.

## 3. Mapa dos caminhos para "produto que já existe"

| Caminho no app | O que faz | Resultado do teste |
|---|---|---|
| Assistente > passo 1 > "Produto já cadastrado" | abre a Nova entrada (`entries/add`) | ok, mesmo código |
| Nova entrada > "Adicionar produto" | escolhe produto e variação existente; variação nova também é aceita (`new_variant`) | ok (B, H): mesmo `#001-2`; 2 linhas da mesma variação na mesma entrada também passam (I) |
| Entrada existente > "Produto já cadastrado" (`AddProductToEntryModal`) | `POST /stock-entries/{id}/items` com a variação | ok pela API (C): 2 linhas na mesma entrada com custos 40 e 42, FIFO correto |
| Entrada existente > "Adicionar variação" (`AddVariantModal`) | `POST /stock-entries/{id}/variants`: cria cor/tamanho se faltar | ok (D): `#001-3` Rosa M, número do produto intacto |
| Entrada existente > "Produto novo" | assistente com a entrada pré-escolhida | cria produto NOVO (código novo), como esperado |
| Scanner de IA > "produto similar" > `entries/add-stock` | cria uma NOVA entrada do produto existente | funciona; liga a variação só se o produto tem UMA variação ativa; não oferece entrada existente nem cor nova (lido no código) |
| Scanner de IA: detecção de duplicata | `SimilarProductsModal` (marca, cor, tamanho, categoria, nome) | só existe no scanner; no cadastro manual não há nada |

## 4. Achados (com evidência)

1. **A lista "Produto já cadastrado" da entrada existente esconde produtos.** O modal filtra `!is_catalog`. Experimento: produto criado "sem entrada" (como faz o assistente ao pular a entrada) fica `is_catalog=true` e NÃO aparece; a API aceitaria (teste E). Pior: se a lojista liga "Publicado no catálogo" num produto que já tem estoque (4 peças), ele também some do modal (`is_catalog=true`, estoque 4).
2. **`is_catalog` tem dois significados e é apagado sozinho.** Na tela do produto é a chave "Publicado no catálogo" (decisão da lojista). No servidor, a primeira entrada desliga a chave (`create_entry`, `add_item_to_entry`: "produto já tem entrada, não é catálogo"). Experimento: `(true, 0 peças)` → 1ª entrada → `(false, 4)`. A publicação é retirada sem aviso.
3. **A Nova entrada só lista 100 produtos** (`useProducts({limit: 100})` em `entries/add.tsx`, ordem por id, busca feita só nessa lista na memória). Produto 101 em diante não pode ser escolhido ali. A loja real tinha 65 produtos em 26/10: o teto chega logo. (Lido no código, não executado com mais de 100 produtos.) O modal da entrada existente já resolve melhor (busca no servidor a partir de 200).
4. **Cadastro repetido não avisa e gera código novo** (G). Não há unicidade de nome por loja no banco, e o assistente manual não consulta produtos parecidos. A detecção existe só no scanner de IA (`_find_duplicates`) e usa marca, cor, tamanho, categoria e nome.
5. **Mesma variação duas vezes na mesma entrada vira duas linhas** (C e I). É correto para o custo (FIFO), mas a tela repete a peça e a conferência de recebimento/etiqueta por entrada pode contar separado (não verificado).
6. **Resposta do `POST /{id}/items` devolve `variant_id: null`** embora grave a variação (a lista da entrada mostra `variant_id=2`). Cosmético; o app não depende disso hoje.
7. **`add-stock` (scanner) com produto de várias variações**: o servidor recusa com "informe a variação" (não deixa estoque órfão), mas a tela não oferece escolher, então vira beco sem saída (lido no código).
8. **Fluxo partido**: "produto já cadastrado" e "adicionar cor/tamanho" são dois botões diferentes na entrada existente; o assistente tem um terceiro atalho. A lojista não percebe que é a mesma intenção ("mais deste produto").

## 5. Proposta (catálogo de verdade)

**Princípio:** o catálogo é a lista de produtos da loja, tenha ou não estoque. Toda tela que precisa de "um produto que já existe" usa o MESMO seletor.

1. **Seletor único de produto** (`ProductPicker`): busca no servidor por nome, `#código` e SKU (aceita `#123`, `123`, `PV#123-1`), mostra `#código`, foto, estoque, última compra (custo e fornecedor). Usado em: nova entrada, entrada existente, assistente e scanner. Resolve os achados 1, 3, 7 e 8.
2. **Escolha da variação na mesma tela**: grade das variações do produto (existentes com `#123-n` e estoque) mais "nova cor/tamanho" que cria a variação com o próximo número. Um botão só ("Mais deste produto") no lugar dos dois da entrada existente.
3. **Separar os dois conceitos do `is_catalog`**: manter `is_catalog` só como "publicado na vitrine" (decisão da lojista, nunca mexido pelo sistema) e derivar "já teve entrada" dos `entry_items`. Parar de desligar a publicação sozinho (achado 2). Migração: não muda dados, só o comportamento; revisar as telas que usam o selo "Catálogo"/"Sem estoque".
4. **Aviso de duplicata no cadastro**: endpoint `GET /products/similar` (nome normalizado sem acento/caixa, marca, categoria) reaproveitando a lógica do scanner; no assistente, ao digitar o nome, aparecem os parecidos com "Usar este produto" (vai para o seletor/nova entrada) e "É outro produto" (segue). Aviso, não bloqueio duro, porque há produtos legítimos com o mesmo nome.
5. **Linhas iguais na mesma entrada**: manter (custo FIFO), mas agrupar na exibição por variação com o detalhe dos custos.
6. **Resposta da API** do `POST /{id}/items` com o `variant_id` real.

## 6. Produtos já duplicados na base e etiquetas impressas

- Precisa de consulta no banco real (este ambiente não acessa o VPS). Pedido de leitura para o Claude do PC, loja 2: nomes repetidos entre produtos ativos, por exemplo `select lower(trim(name)) n, count(*), array_agg(id) from products where tenant_id = 2 and is_active group by 1 having count(*) > 1;`.
- **Mesclar** duplicados (mover variações, itens de entrada e vendas para o produto principal) é possível sem mudar etiquetas já impressas, porque `product_code` e `variant_number` ficam gravados NA VARIAÇÃO (a confirmar com teste antes de usar em produção). Regra: nunca renumerar variação que já tem etiqueta; só trocar o `product_id`. Fazer só com ok do Victor, com simulação, backup e uma tela de conferência.

## 7. Plano e ordem sugerida

1. **Correções rápidas (baixo risco)**: remover o filtro `!is_catalog` do modal da entrada existente; trocar o limite 100 da Nova entrada por busca no servidor; parar de desligar `is_catalog` na primeira entrada (e ajustar os testes que dependem disso). Testes: API (produto catálogo entra em entrada existente; `is_catalog` não muda) e navegador (cada caminho do mapa da seção 3).
2. **Seletor único + grade de variações** nas quatro telas.
3. **Aviso de duplicata** no assistente (`/products/similar`).
4. **Mesclar produtos** (ferramenta de admin, simulação primeiro), só depois de olhar a base real.

## 8. Decisões que dependem do Victor

1. Publicar na vitrine (`is_catalog`) fica como chave só da lojista e o sistema para de mexer? (recomendado: sim)
2. Duplicata no cadastro: aviso com confirmação (recomendado) ou bloqueio?
3. Mesclar os duplicados que já existem: quer ver a lista antes de decidir?
4. Mesma variação repetida na mesma entrada: manter as linhas separadas (custos diferentes) ou pedir para somar quando o custo for igual?

## 9. O que NÃO foi verificado

- Nenhum caminho foi clicado no navegador ou no celular; o mapa da seção 3 vem do código e das chamadas da API (as telas chamam essas mesmas rotas).
- O limite de 100 produtos (achado 3), o `add-stock` com várias variações (7) e o impacto das linhas repetidas na conferência (5) foram só lidos no código.
- Os números reais da base de produção (quantos duplicados, quantos produtos `is_catalog=true` com estoque).

## 10. Estado (2026-11-01): correções rápidas feitas

Decisão do Victor: `is_catalog` é o interruptor "aparece no site" para quando o site estiver ligado ao app; só a lojista mexe. Não há tabela de catálogo nova: o catálogo é a própria tabela de produtos (se um dia o site precisar de dados de vitrine, entra uma tabela ligada ao produto, não um catálogo paralelo).

- **Servidor**: receber estoque (`create_entry`, `add_item_to_entry`) não mexe mais em `is_catalog`. Quem usava a chave como "já teve estoque" foi ajustado: excluir a única entrada de um produto continua desativando o produto (agora sempre, sem depender da chave); a reposição de fornecedor não filtra mais por ela (já exige venda no período); o preço médio de produtos parecidos do scanner passou a exigir entrada real (`EntryItem`) em vez da chave. Os 8 filtros `is_catalog == False` do `ProductRepository` (busca, categoria, marca, tamanho, cor, gênero, ativos e estoque baixo) saíram: produto publicado passa a ser achado em todos. Os 3 testes marcados "BUG REAL" (xfail estrito) agora passam e perderam a marca.
- **App**: "Produto já cadastrado" da entrada existente lista todos os produtos (sem o filtro `!is_catalog`); a Nova entrada busca no servidor quando a loja tem 100 ou mais produtos e avisa que a lista mostra só os 100 primeiros; texto do interruptor na tela do produto fala em site ligado ao app.
- **Mesma peça repetida na mesma entrada** (decisão de quem lança): na entrada existente, se a variação já tem linha NESTA entrada, o app avisa e pergunta "Somar na linha que já existe" (só com o mesmo custo, fornecedor e preço cheio, e se a linha não vendeu nada) ou "Criar uma linha separada". Em outra entrada nunca avisa. Na Nova entrada, a variação repetida aparece num aviso "Já estão nesta entrada".
- **Testes**: `tests/test_publicado_no_site.py` (4; 3 falham com o código antigo), os 3 ex-xfail, reposição, permissões e entradas: 174 passam. No navegador (backend local com 106 produtos): produto publicado aparece na lista da entrada existente, aviso e soma (5 + 3 = 8 numa linha), soma bloqueada com custo diferente e linha separada, nenhum aviso em outra entrada, produto 105 achado pela busca, publicação intacta depois de 3 entradas: 12/12, sem erro de JS. `tsc` em 0.
- **Ainda não feito** (itens 2, 4 e 5 do plano): seletor único de produto com grade de variações, aviso de produto parecido no cadastro (`/products/similar`), ferramenta de mesclar duplicados. O valor padrão de `is_catalog` em produto novo NÃO foi mudado (o assistente "sem entrada" cria publicado; os outros caminhos criam não publicado): decisão A ou B ainda pendente.
- **Não verificado**: iPhone e celular; a base real (quantos produtos publicados já perderam a publicação sozinhos: esses continuam como estão, a lista para a lojista decidir ainda precisa ser levantada no banco de produção).
