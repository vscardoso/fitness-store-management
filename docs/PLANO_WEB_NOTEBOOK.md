# Plano: app web para notebook (proposta, 2026-10-28)

Pedido do Victor: muitas lojas usam notebook; o app web precisa funcionar bem em tela grande.

**Estado (2026-10-28): fases 1 e 2 FEITAS** (protótipo aprovado: https://claude.ai/artifact/WDt5KNFsxviFEe9cAbpNfh). Fases 3 a 5 pendentes.
- `hooks/useLayout.ts`: `isDesktop` = app web com 1024 px ou mais (no celular é sempre falso). Todo código do modo notebook passa por ele.
- `components/layout/DesktopShell.tsx` (em `app/_layout.tsx`): barra lateral `DesktopSidebar.tsx` à esquerda quando logado (não nas telas de login, termos e aceite), conteúdo até 1280 px (PDV usa a largura toda), F2 de qualquer tela abre o PDV. No iOS/Android devolve as telas sem nenhuma View a mais. As abas de baixo somem no notebook (`app/(tabs)/_layout.tsx`).
- Barra lateral: mesmos destinos e regras de papel do menu "Mais" (`app/(tabs)/more.tsx`); item novo de menu entra nos DOIS. Grupos Relatórios e Loja começam fechados.
- `PageHeader`: faixa baixa com título à esquerda no notebook (sem o logo do Início, que a barra já mostra). `BottomSheet`: diálogo no meio da tela.
- PDV: `components/sale/DesktopPDV.tsx` (o PDV do celular ficou intacto em `MobileSaleScreen`). Busca sempre aberta filtrando por variação; Enter adiciona o código lido (`PV#001-2`, `#1-2`, `#0123`, SKU) ou a única peça possível; F2 nova venda, F4 cliente, F9 finalizar, `/` busca, Esc limpa. Mesmo carrinho e validações de estoque do celular; "Finalizar" leva ao mesmo `/checkout` (pagamento, troco, PIX e maquininha ficaram lá, não no painel do protótipo). Os atalhos escutam o teclado na fase de CAPTURA: o campo de texto do react-native-web não deixa a tecla subir até a página.
- Servidor: `GET /products/grouped` passou a devolver `short_code` e `display_code` por variação (teste `test_lista_agrupada_traz_o_codigo_da_etiqueta`).
- Verificado: fotos de 26 telas em 390 px e em 1000 px, versão de antes x depois: iguais (as poucas diferenças variam de uma rodada para outra também na versão antiga: animação); roteiro do notebook 26/26 (barra, cabeçalho, PDV pelo teclado e leitor, estoque, cliente, desconto, checkout, diálogo, vendedora sem dinheiro/entradas e sem lucro, janela estreita volta ao celular, sem erro de JS); `tsc` 0. NÃO testado: aparelho físico (o código do notebook não roda lá) e leitor USB de verdade (simulado digitando + Enter).
- Achado, não corrigido (já existia): o Início da vendedora chama painéis só de gerente (`/dashboard/stats`, `/sales/monthly`, `/purchases`, `/inventory/valuation`) e mostra "Permissão negada".

## Como está hoje (fotos em 1366x768, backend local)
O app web é o layout do celular esticado:
- Cabeçalho em degradê de 144 px em toda tela (quase 1/5 da altura do notebook) e barra de abas embaixo (Início, PDV, Menu), feita para o polegar.
- Tudo em uma coluna da largura inteira: a lista de produtos tem o preço colado à esquerda e o estoque a 1.200 px de distância; a venda tem os itens numa faixa de 1.300 px.
- PDV: busca é um botão que abre outra tela; carrinho vazio ocupa a tela; nada responde ao teclado (0 atalhos no código) e o leitor de código de barras USB (que digita como teclado + Enter) não tem onde cair.
- Botão flutuante (+) no canto, menus em folha que sobe de baixo (BottomSheet), "Toque para..." nos textos.
- Números: 99 telas; 75 usam `PageHeader`/`DetailHeader`/`ListHeader`; 14 usam o botão flutuante; 55 usam Modal/BottomSheet. Por isso a maior parte da mudança cabe em poucos componentes compartilhados.

## Decisão de arquitetura (recomendada)
**Mesmo código (React Native Web), com um "modo notebook" a partir de 1024 px.** Não fazer um segundo app (Next.js): 99 telas, regras e serviços duplicados, e cada correção feita duas vezes.
- Abaixo de 768 px nada muda (celular igual ao de hoje; teste de foto em 390 px garante).
- 768 a 1023 px (tablet / notebook pequeno): barra lateral recolhida (só ícones).
- 1024 px ou mais: modo notebook completo.
- Servidor: nenhuma mudança para as fases 1 e 2. Fase 3 pode pedir ordenação/paginação no servidor nas listas (a lista de produtos já é lenta com muitos itens: N+1 anotado em "Desempenho").

## Fases (cada uma publicável sozinha)
**Fase 1. Moldura do notebook (vale para as 99 telas de uma vez)**
- `hooks/useLayout.ts` (`isDesktop`, `isTablet`, largura) como única fonte do ponto de quebra.
- Barra lateral fixa no lugar das abas de baixo, com os grupos do menu "Mais" (Vender, Estoque, Clientes, Dinheiro, Loja), respeitando o papel (caixa/vendedor não veem o que já é escondido hoje), logo e nome da loja no topo, usuário embaixo, selo de alertas.
- `PageHeader` compacto no notebook: 56 a 64 px, sem degradê grande, título à esquerda, ações à direita como botões com texto (o "+" flutuante vira "Novo produto" no cabeçalho).
- Conteúdo centralizado com largura máxima (~1200 px) e respiro lateral.
- `BottomSheet` vira diálogo central (formulários curtos) ou painel lateral à direita (escolher cliente, filtros), sem mudar quem usa.
- Mouse: cursor de mão, realce ao passar o mouse, textos "Toque" viram "Clique" no notebook.

**Fase 2. PDV de balcão (a tela mais usada no notebook)**
- Tela dividida: à esquerda busca sempre aberta com resultados e variações (cor x tamanho clicáveis); à direita o carrinho fixo com cliente, desconto, total e "Finalizar".
- Teclado: busca com foco ao abrir, leitor USB (código + Enter adiciona a peça, inclusive o QR `PV#101-1`), setas e Enter na lista, `F2` nova venda, `F4` cliente, `F9` finalizar, `Esc` fecha, `+`/`-` na quantidade.
- Pagamento no mesmo painel (dinheiro com troco calculado, PIX, cartão, misto), sem trocar de tela.

**Fase 3. Listas em tabela e detalhes em duas colunas**
- Produtos, vendas, clientes, entradas, condicionais e fornecedores como tabela: colunas (código, nome, cor/tamanho, preço, estoque, situação), ordenar clicando no título, filtros numa barra, 50 por página, clique na linha abre o detalhe.
- Detalhe ao lado da lista (lista à esquerda, ficha à direita) em produtos, vendas e clientes, para não perder o lugar.
- Detalhes em duas colunas: venda (itens | pagamento, rentabilidade, devoluções), produto (grade de variações e estoque | preço, fornecedores, fotos), cliente (dados | compras).

**Fase 4. Telas de trabalho pesado**
- Nova entrada com grade digitável (cor x tamanho, Tab entre as quantidades, custo por linha), o maior ganho de tempo para quem cadastra compra no notebook.
- Início com painel em grade (vendas do dia, mês, lucro, alertas, gráfico largo).
- Relatórios com gráficos largos e tabela ao lado; conferência de estoque em tabela.

**Fase 5. Acabamento**
- Imprimir pelo navegador (recibo da venda, lista de conferência, adesivos já saem em PDF).
- Atalhos mostrados no próprio botão (`Finalizar F9`) e uma ajuda "Atalhos do teclado".
- Testes: fotos de todas as telas em 1366, 1920 e 390 px (o celular tem que ficar igual), PDV inteiro só pelo teclado, sem erro de JS.

## Ordem sugerida e tamanho
1. Fase 1 + Fase 2 primeiro (moldura + PDV): é o que a lojista do notebook sente no primeiro dia. Tamanho: médio (componentes compartilhados + uma tela nova de PDV).
2. Fase 3 (tabelas): grande, mas tela por tela, pode ir aos poucos começando por Produtos e Vendas.
3. Fases 4 e 5 conforme o uso real.

## Perguntas para o Victor
- As lojas usam leitor de código de barras USB no notebook? (define a prioridade do atalho Enter no PDV)
- Quais telas a W.A usa no notebook hoje? (sugestão: PDV, entradas, produtos)
- Notebook mais comum: 1366x768 ou Full HD? (ajusta a densidade das tabelas)
