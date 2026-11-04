# Plano: Ajuda do Provador (celular e web)

Pedido do Victor (04/11/2026): ajuda concisa que explique cada tela em detalhes, no celular e no app web (notebook).

## Como está hoje

- `app/(tabs)/help.tsx` (Central de Ajuda): lista 9 tutoriais guiados (`constants/tutorials.ts`), barra de progresso com troféu e "Resetar tutoriais".
- O botão "?" (`components/tutorial/HelpButton.tsx`) só existe na Início.
- Os passos têm `targetRef` (destacar um elemento), mas nenhuma tela registra esses alvos: o destaque não aponta para nada.
- Os 9 tutoriais cobrem Início, PDV, Produtos, Novo/Editar/Detalhe do produto, Clientes, Estoque e Condicionais. Ficam de fora Caixa, Financeiro, Entradas, Importar estoque, Fornecedores, Relatórios, Conferência, Etiquetas, WhatsApp, Equipe e configurações.

## O que vamos fazer

### 1. Conteúdo: uma ficha por tela, num lugar só

`mobile/constants/help/` com um arquivo por grupo do menu (vender, estoque, clientes, whatsapp, dinheiro, relatorios, loja). Cada tela tem uma ficha:

| Campo | O que leva | Tamanho |
|---|---|---|
| `title` | nome da tela igual ao do menu | |
| `purpose` | para que serve | 1 frase |
| `steps` | como fazer a tarefa principal, com o nome exato dos botões | até 6 passos |
| `parts` | o que cada parte da tela mostra (cartões, filtros, números) | até 6 itens |
| `goodToKnow` | o que o app faz sozinho e as regras que pegam de surpresa | até 4 itens |
| `web` / `mobile` | diferenças do notebook ou do celular | opcional, 1 a 3 itens |
| `roles` | quem vê a tela (caixa, vendedor, gerente, admin) | |
| `related` | telas ligadas, viram links | até 3 |

Regras de texto: frases curtas, palavras da lojista (nada de CMV, ROI, FIFO, tenant), nomes de botão iguais aos da tela, sem travessão. Exemplo de "Bom saber" no Financeiro: "O saldo de cada conta é calculado pelas vendas, devoluções, caixa, transferências e contas pagas. Você não digita saldo depois da implantação."

### 2. Botão "?" em todas as telas

- O `PageHeader` acha a ficha pela rota atual (mapa rota → ficha) e mostra o "?" sozinho. Não precisa mexer tela por tela; tela sem ficha não mostra o botão.
- **Celular:** o "?" abre a ficha numa folha de baixo (`BottomSheet`), com rolagem. A tela continua atrás.
- **Web/notebook (1024 px ou mais):** abre um painel à direita, ao lado da tela, que fica aberto enquanto a pessoa usa a tela (dá para seguir os passos lendo). Tecla F1 abre e fecha.
- **Web no celular:** igual ao celular.
- Respeita papel e funcionalidades desligadas (`FEATURES`): vendedor não vê ajuda de tela de gerente; Lookbook, Wishlist, maquininhas e PIX integrado não aparecem enquanto estiverem desligados.

### 3. Central de Ajuda nova

Substitui a tela atual:
- Campo de busca (por título, passos e "bom saber", sem acento, pelo início da palavra como na Conferência).
- **Primeiros passos** para loja nova, em ordem: identidade da loja, equipe, importar estoque, implantar o financeiro, abrir o caixa, primeira venda, catálogo do WhatsApp. Cada item abre a ficha e leva à tela.
- Lista agrupada como a barra lateral (Vender, Estoque, Clientes, WhatsApp, Dinheiro, Relatórios, Loja). Toque abre a ficha; dentro dela, "Abrir esta tela".
- **Celular:** uma coluna, grupos que abrem e fecham. **Notebook:** lista à esquerda e a ficha à direita, sem trocar de página.
- Sai: troféu, progresso e "Resetar tutoriais".

### 4. Tutoriais guiados antigos

Saem `constants/tutorials.ts`, `TutorialContext`, `TutorialOverlay/Spotlight/Tooltip` e o `HelpButton` antigo: o destaque nunca funcionou e o conteúdo fica duplicado. O modal de boas-vindas vira um convite para "Primeiros passos".

## Telas cobertas (76 fichas)

**Vender (11):** Início, Ponto de venda, Finalizar venda (checkout), Venda concluída, Vendas, Detalhe da venda, Condicionais (lista, novo envio, detalhe), Caixa, Histórico do caixa.

**Estoque (31):** Produtos, Novo produto (assistente), Detalhe do produto, Editar produto, Fotos das variações, Produtos incompletos, Consultar peça, Scanner IA, Etiquetas (estúdio e da peça), Entradas, Nova entrada, Detalhe da entrada, Conferir recebimento, Importar estoque, Categorias, Inventário, Prejuízos (lista, registrar, detalhe), Fornecedores (lista, detalhe), Ranking, Custos, Reposição, Devolução ao fornecedor, Viagens (lista, nova, detalhe).

**Clientes (4):** Clientes, Nova cliente, Ficha da cliente (com Privacidade), Editar cliente.

**WhatsApp (8):** Conversas, Conversa, Perfil, Horário e ausência, Saudação automática, Catálogo do WhatsApp, Respostas rápidas, Etiquetas.

**Dinheiro (7):** Contas e saldos, Implantar a loja, Contas a pagar, Resultado do mês, Despesas, Nova/editar despesa, Descontos por forma de pagamento.

**Relatórios (8):** Relatórios (menu), Vendas, Vendas por período, Mais vendidos, Lucro por lote, Histórico, Conferência de estoque, Conferências salvas.

**Loja (7):** Mais (menu), Identidade da loja, Equipe (lista e pessoa), Prazo de troca e devolução, Notificações, Central de Ajuda.

Ficam sem ficha (lista fixa no teste): login, cadastro, esqueci a senha, apresentação, termos, privacidade, aceite dos termos, vitrine pública (`produtos/[id]`), rota pega-tudo, telas de desenvolvimento, redirecionamentos (`products/qrcode`, `products/add`) e as telas de funcionalidades desligadas (Lookbook, Wishlist, PDV integrado, terminais, Chave PIX, impressoras, fila de etiquetas). Quando uma funcionalidade for ligada, ganha ficha junto. A conferir na fase 1 se ainda são usadas: `batches`, `catalog`, `(tabs)/management`, `(tabs)/team` e `(tabs)/payment-discounts` (duplicadas ou antigas); a que não tiver uso sai do app.

## Garantia de que a ajuda não fica velha

- `scripts/test-help-coverage.mts` (entra no `npm test`): toda rota de `app/` tem ficha ou está na lista de exclusão. Tela nova sem ajuda quebra o teste.
- `scripts/test-help-labels.mts`: todo texto entre aspas nas fichas (nome de botão) existe no código da tela. Botão renomeado sem atualizar a ajuda quebra o teste.
- Limites de tamanho (passos, itens, palavras) conferidos no mesmo teste.
- Playwright em build local, 390 px e 1440 px: abrir o "?" em todas as telas com ficha, conferir título certo, painel/folha abre e fecha, F1 no notebook, busca da Central, "Abrir esta tela", vendedor sem ficha de gerente, zero erro de JS.

## Fases

| Fase | Entrega |
|---|---|
| 1 (FEITA 04/11) | Estrutura (fichas tipadas, mapa de rotas, "?" no `PageHeader`, folha no celular, painel no notebook, F1), Central nova com busca, testes de cobertura e de botões, fichas de **Vender** |
| 2 | Fichas de **Estoque** e **Clientes** |
| 3 | Fichas de **Dinheiro** e **Relatórios** |
| 4 | Fichas de **WhatsApp** e **Loja**, Primeiros passos, boas-vindas novo |
| 5 | Remoção dos tutoriais antigos, Playwright em todas as telas (390 e 1440), publicação |

Cada fase é publicada sozinha (app web e OTA), com typecheck em 0 e testes passando. As fichas são escritas lendo o código de cada tela, não de memória.

## Andamento

- **Fase 1 (04/11/2026, feita):** fichas em `mobile/constants/help/` (`types.ts`, `vender.ts`, `index.ts`, `coverage.ts` com as rotas excluídas, escondidas e pendentes), rotas em `utils/helpRoutes.ts`, estado em `store/helpStore.ts`, folha e painel em `components/help/HelpHost.tsx` (`HelpIconButton` para telas com cabeçalho próprio, como o PDV do notebook), corpo da ficha em `components/help/HelpContent.tsx`, "?" automático no `PageHeader` (`showHelp={false}` esconde), F1 no `DesktopShell`, Central nova em `app/(tabs)/help.tsx`. Fichas de Vender: Início, Ponto de venda, Finalizar venda, Venda concluída, Vendas, Detalhe da venda, Condicionais, Novo envio, Envio condicional, Caixa, Histórico do caixa. Testes `npm test` (cobertura e nomes de botão) e Playwright em 390 e 1440 px (42 verificações, vendedora sem a ficha de gerente). Saíram telas mortas: `(tabs)/management`, `(tabs)/payment-discounts` (cópia da de `settings`) e `batches`. Os "?" de tutorial antigo do Início, PDV e Condicionais saíram; os de Produtos, Estoque e Detalhe do produto ficam até a fase 2.
- Para a próxima fase: tirar as rotas do grupo de `HELP_PENDING` ao escrever as fichas; telas sem `PageHeader` (assistente de produto, scanner, equipe) precisam do `HelpIconButton` no cabeçalho delas. Ainda existem duas telas de Equipe (`(tabs)/team` e `team`) na mesma rota: conferir qual abre na fase 4.
