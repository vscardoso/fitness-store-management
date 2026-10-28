# Subtarefas: etiqueta e impressão (2026-10-28)

Como comandar (nuvem ou celular): "Execute a subtarefa E3 de docs/SUBTAREFAS_ETIQUETA.md". Cada uma tem o que fazer e o que prova que acabou.
Regras: ler `CLAUDE.md` (seção "Código curto e etiqueta do verso da tag"), testar de ponta a ponta antes de dizer que funciona, commit em português e `git push`.

## Decisões do Victor (valem para todas)
- A tag já vem **pré-impressa com a logo WA**. O sistema imprime só o **adesivo do verso**, que o Victor cola. **Por enquanto vai imprimir numa gráfica; ainda não tem impressora.**
- O adesivo leva só o que a cliente pode ver: nome, cor, tamanho, preço, código curto e QR. Sem custo, SKU, fornecedor, entrada ou data.
- Ele quer a opção **6x5** (a etiqueta que tem hoje). A medida exata NÃO está anotada em nenhum lugar (o código tem 50x60 mm, escolhido sem confirmar). Ver E6.

## Achados da inspeção (28/10/2026)
1. Botão "Imprimir Etiqueta" da tela do produto abre `ElginPrintSheet` (folha antiga: QR só com SKU, sem preço nem código curto, exige impressora cadastrada, mostra "FRENTE pré-impresso"). Não é o layout combinado.
2. Há quatro telas de etiqueta sobrepostas: `ElginPrintSheet`, `app/products/qrcode/[id].tsx` (tela "Etiqueta" com 10/14/21/33/65 por folha), `app/products/label/index.tsx` ("Estúdio de Etiquetas") e `app/products/label/[id].tsx` (esta tem o cartão novo do adesivo, escondido no meio). As três antigas imprimem layout antigo com SKU.
3. **O leitor de QR da tela de vendas (`components/sale/QRCodeScanner.tsx`) NÃO lê o QR do adesivo novo** (`PV#101-1`): trata como SKU e responde "Produto não encontrado". `parseShortCode` não é usado em lugar nenhum do app. O servidor já resolve (`GET /product-variants/short-code/{code}`).
4. O PDF só existe em 50x60 e a folha A4 é fixa em 3x4 = 12.
5. Pesquisa feita: apps de etiqueta (LabelRight, Solvi, Label Printer) oferecem modelos de tamanho nomeados em vez de digitar medida, posição inicial na folha já usada e **prévia que é o próprio PDF em tamanho real**.

## Subtarefas
| # | O que | Pronto quando | Estado |
|---|---|---|---|
| E1 | Servidor: tamanho configurável do adesivo (`width_mm`, `height_mm`; 60x50 e 50x60), grade A4 calculada pelo tamanho (60x50 cabe 15 por folha, 50x60 cabe 12), `start_position` até o máximo da grade, desenho conferido nos dois sentidos | PDF dos dois tamanhos renderizado e conferido a olho, QR lido do PDF, testes `tests/test_labels_pdf.py` | em andamento |
| E2 | Leitor de QR da venda entender `PV#101-1`, `#101-1` e o código antigo (`PV#0123`): resolver pelo servidor e cair no mesmo caminho do SKU | Escanear o QR do PDF no navegador/PDV abre a peça certa; código inexistente mostra erro legível | a fazer |
| E3 | **Tela única de etiquetas**, redesenhada: 1) escolher as peças e quantidades (por entrada, por produto, ou lote), 2) escolher o modelo (6x5, 5x6, folha A4 12/15, 1 por página para a gráfica), 3) prévia = o PDF real, 4) botão "Baixar PDF" e "Compartilhar". Mesma tela para produto, estúdio em lote e entrada. Visual conforme `frontend-design` | Fluxo completo no navegador com screenshot; some a dependência de impressora cadastrada | a fazer |
| E4 | Produto: trocar "Imprimir Etiqueta" (Elgin) e "QR Code / PDF" pelo fluxo novo; tirar `ElginPrintSheet` da tela; esconder Impressoras e Fila de impressão enquanto não houver impressora | Nenhum caminho do app abre o layout antigo; typecheck do mobile em 0 | a fazer |
| E5 | PDF para a gráfica: uma etiqueta por página no tamanho exato, vetorial, sem marcas de corte nem margem, fonte embutida, nome do arquivo com tamanho e quantidade; teste de que cada página tem exatamente o tamanho | Arquivo que a gráfica abre e imprime sem ajuste | a fazer |
| E6 | **Perguntar ao Victor** a medida exata do adesivo (largura x altura, com a tag em pé), se a tag tem furo e onde, e se a gráfica quer sangria. Gravar no `CLAUDE.md` | Medida registrada; presets de E1/E3 corrigidos | aberta (aguardando resposta) |
| E7 | Botão "Imprimir etiquetas" na entrada de estoque (`entries/[id].tsx`, uma por peça recebida; servidor já pronto em `POST /labels/pdf/entry/{id}`) | Entrada com 23 peças gera 23 etiquetas certas | a fazer |
| E8 | Numerar produção (`scripts/short_codes_backfill.py`, simular antes, `--apply` só com ok do Victor) | Todas as peças com SKU têm código | aguardando ok |
| E9 | Impressão de teste em papel conferida com régua (tamanho, QR lido com celular), e compartilhar PDF no iPhone | Foto da etiqueta medida | depende de E1 e de papel |
| E10 | ZPL e impressora Elgin L42 Pro (quando comprar): fila, agente local ou impressão pelo navegador (ver `docs/PROXIMOS_PASSOS.md` 1.3 e 1.6) | Etiqueta sai da impressora | futuro |
| E11 | Conferência de estoque lendo o QR (usa a correção de E2) e logo na etiqueta se um dia imprimir tudo | Contagem por scan soma 1 por leitura | futuro |
