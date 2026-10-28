# Plano: bipar o QR do adesivo (conferência, venda e consulta)

Data: 28/10/2026. Pedido do Victor: bipar o QR na conferência de estoque, na venda e na consulta; o campo "Contado" usa setas de + e -; toda conferência precisa ficar salva no app com data (Q1).
Como comandar: "Execute a subtarefa Q3 de docs/PLANO_LEITOR_QR.md". Regras de sempre: testar de ponta a ponta antes de dizer que funciona, commit em português e `git push`.

## O que já existe (não refazer)
- O adesivo leva o QR `PV#101-1` e o código `#101-1` (produto 101, variação 1). O código antigo `PV#0123` também acha a peça.
- Servidor: `GET /product-variants/short-code/{code}` aceita os três formatos e só enxerga a loja de quem pergunta. Já conferido pela API.
- App: `utils/shortCode.ts` (`isLabelCode`), `getVariantByLabelCode`, `components/sale/QRCodeScanner.tsx` (câmera na venda, entende `PV#`) e `BarcodeScanner.tsx`. A regra de segurança do app web já libera o leitor de QR por câmera.
- Conferência de estoque: a contagem fica no aparelho (por variação) e a lista traz o código `#101-1` de cada linha.
- Os 209 códigos da loja real já estão numerados em produção. A loja de teste (loja 1) não.

## O que NÃO foi testado até hoje
Câmera lendo um adesivo de verdade no iPhone, leitor USB ou Bluetooth, luz ruim e QR pequeno. Nada abaixo vale como pronto sem esse teste.

## Decisões que faltam do Victor (marque a sua escolha)
1. Qual leitor a loja vai usar: câmera do celular, leitor USB/Bluetooth (age como teclado e digita o código com Enter), ou os dois? O plano cobre os dois.
2. Na conferência, cada leitura soma 1 na contagem da peça. Quando passar do que o sistema tem, só mostrar "sobra" (proposta) ou avisar na hora?
3. Código que não é da loja ou peça fora da lista filtrada: mostrar aviso vermelho e continuar (proposta).
4. Som e vibração a cada leitura: ligados por padrão (proposta), com botão para silenciar.

## Peça central (todas as telas usam)
**Resolvedor único de código** (`services/codeResolver.ts` + rota `GET /product-variants/lookup?code=`): recebe o texto lido (`PV#101-1`, `#101-1`, `PV#0123`, SKU, código de barras), normaliza, e devolve de uma vez a variação, o produto, o preço, o estoque do sistema e as outras variações do produto. Uma chamada só, sem três idas ao servidor. Erro claro quando não acha: "Código não encontrado nesta loja".

**Entrada de leitura** (`hooks/useCodeInput.ts` + `components/scan/ScanBar.tsx`), duas formas que chamam o mesmo resolvedor:
- Câmera contínua: lê, toca o som, ignora o mesmo código por 1,5 s, fica aberta para a próxima peça.
- Leitor tipo teclado: campo sempre em foco (celular) e escuta global no navegador (PC): junta as teclas até o Enter e trata como leitura. Ignora digitação humana lenta.

**Resposta ao usuário**: flash verde com nome, cor, tamanho e contagem nova; flash vermelho para erro; "Desfazer última leitura" por 5 s.

## Subtarefas
| # | O que | Pronto quando |
|---|---|---|
| Q1 | **Conferência salva, com data (relatório persistido)**: botão "Salvar conferência" grava no servidor a data, quem contou, a categoria, um nome e uma observação, e o resultado de cada peça contada (sistema, contado, diferença). Histórico em "Conferências salvas" (Mais > Relatórios e atalho na tela de conferência) e tela de detalhe com filtro "só divergências". A foto do dia não muda se a peça for renomeada ou apagada depois. Não altera estoque | FEITA 28/10: servidor com testes (6 verdes), migração testada no Postgres (subir, descer, subir), gravação conferida num servidor real; telas escritas e typecheck 0. FALTA ver as telas no navegador/iPhone depois da publicação |
| Q2 | Campo "Contado" com setas de + e - e linha sem contagem já mostrando "falta N" em cinza | FEITA 28/10 |
| Q3 | Resolvedor único: rota `lookup` no servidor (com testes: três formatos, SKU, outra loja, não achou) e `codeResolver.ts` no app | FEITA 28/10: `GET /product-variants/lookup?code=` (QR, #produto-variação, SKU sem diferenciar maiúscula, código antigo; sem custo; só da loja) com 3 testes; `services/codeResolver.ts`. O cadastro NÃO tem código de barras de fábrica (a coluna não existe), então só vale etiqueta e SKU |
| Q4 | **Conferência por leitura (câmera)**: barra "Bipar" no topo, cada leitura soma 1, a lista rola até a linha lida, peça fora da lista vira aviso, desfazer, contagem persistente (já existe) | FEITA 28/10, testada no navegador com leitor simulado: 3 leituras do mesmo QR contaram 3 e o resumo mostrou "faltam 2"; duas leituras rápidas contaram 1; código desconhecido avisa em vermelho; desfazer e rolagem até a linha. FALTA câmera real no iPhone (Q10) |
| Q5 | **Leitor tipo teclado** (USB e Bluetooth) para Conferência, Venda e Consulta, com a regra de ignorar digitação lenta | FEITA 28/10 (`ScanBar`, `utils/scanLogic.ts`): escuta de teclado no navegador do computador, campo para o leitor no celular, e digitar o código + Enter. Lógica testada em `mobile/scripts/test-scan-logic.mts` (8 testes). FALTA leitor USB/Bluetooth de verdade (Q10) |
| Q6 | **Consulta de peça**: tela nova (atalho no Início e no menu) que lê o QR e mostra nome, cor, tamanho, preço, estoque da peça e a grade das outras variações, com botões Vender, Etiqueta e Ver produto. Vendedora não vê custo (a máscara do servidor já vale) | FEITA 28/10: `app/products/consult.tsx` (atalho "Consultar" no Início e no menu Mais). Testada no navegador: SKU achou Bermuda Bege / M, R$ 89,90, 5 em estoque, com as 6 variações; código inexistente dá aviso vermelho |
| Q7 | **Venda**: modo contínuo no PDV (cada leitura soma 1 no carrinho), aviso quando o estoque é 0, mesma barra e mesmo som | FEITA 28/10: PDV com barra de leitura contínua no lugar do botão "Escanear". Testada no navegador: 2 leituras = quantidade 2; com 5 em estoque, a 6ª leitura avisa "só há 5" e não adiciona |
| Q8 | Som, vibração e flash padronizados (verde, vermelho, âmbar) e botão de silenciar guardado no aparelho | FEITA 28/10 (`utils/scanFeedback.ts`): som (navegador), vibração (celular), verde, âmbar e vermelho, botão de silenciar guardado no aparelho. FALTA ouvir/sentir no aparelho (Q10) |
| Q9 | Testes automáticos: resolvedor com formatos de código, ordem de leituras repetidas, sobra e falta, estresse de 500 leituras seguidas (conta exata e sem travar) | FEITA 28/10: servidor com testes do resolvedor (3) e conferência salva (4); app com 8 testes de lógica, incluindo 500 leituras seguidas contando exato e busca entre 30 mil variações |
| Q10 | Teste de verdade: adesivo impresso no tamanho 65x55, iPhone com câmera, luz de loja, e leitor USB se houver. Registrar o que falhou | ABERTA, só o Victor consegue: adesivo impresso em 65x55 e iPhone com câmera. Roteiro: (1) imprimir 8 adesivos de teste pela folha A4; (2) Conferência: bipar 5 peças com a câmera; (3) PDV: bipar 3; (4) Consultar: bipar 1 e conferir preço; (5) em luz fraca e com adesivo brilhante; (6) se tiver leitor USB, repetir 1 a 4. Anotar o que falhar |
| Q11 | Entrada de estoque: ler as peças que chegaram e conferir com a nota (reuso da Q4) | FEITA 28/10: `app/entries/check/[id].tsx` (botão "Conferir recebimento" na entrada). Testada no navegador: entrada de 30 peças, 2 leituras = "2 de 30, faltam 28"; código inexistente avisa |
| Q12 | Numerar a loja de teste e conferir que toda peça da loja real tem código antes de imprimir (subtarefa E8 de `docs/SUBTAREFAS_ETIQUETA.md`) | FEITA 28/10 (simulação em produção, nada gravado): a loja real (loja 2) não tem peça sem número. Só a loja de teste (loja 1) tem 369 variações de teste sem número (`--apply` só com o ok do Victor) |

Próximos passos da Q1 (ainda não pedidos): PDF e impressão da conferência salva, comparar duas conferências do mesmo local, guardar a contagem em andamento no servidor (hoje fica só no aparelho; dois aparelhos não somam), e decidir se uma conferência pode gerar ajuste de estoque (hoje não gera, de propósito).

## Aviso de atualização do sistema (feito junto, 28/10)
Perguntar a cada pessoa "quer atualizar agora?" não serve com várias pessoas ao mesmo tempo: cada uma responderia numa hora e o servidor só pode reiniciar uma vez. A solução adotada não pergunta nada:
- O servidor já espera não haver gravação em andamento (guarda de publicação) antes de reiniciar.
- Se mesmo assim a API sumir, cada aparelho confere sozinho o `/health` a cada 3 s e mostra UMA tela: "Estamos atualizando o sistema. Leva menos de 1 minuto. Não precisa fazer nada." Quando o servidor volta, a tela some, as telas recarregam e aparece "Pronto, sistema atualizado". O que estava digitado ou no carrinho continua onde estava. Sem internet, a tela diz isso. Passou de 2,5 min, aparece "Tentar agora".
- Versão nova do app: o aviso diz "Continue o que está fazendo: ela entra sozinha quando você terminar esta tela". Em telas de venda, cadastro, edição, conferência e recebimento ela nunca recarrega sozinha.
- Código: `services/systemStatus.ts`, `components/layout/SystemUpdateOverlay.tsx`. Testado no navegador derrubando a API de mentira: a tela apareceu, e sumiu sozinha ao voltar.
- Ideia opcional que NÃO foi feita: aviso com contagem regressiva antes da publicação (precisa de um passo no fluxo de publicação do GitHub escrevendo um arquivo no servidor do app).

## Ordem sugerida
Q1 e Q2 (feitas), Q3, Q4, Q5, Q6, Q7, Q8, Q9, depois Q10 com os adesivos impressos. Q11 e Q12 em paralelo quando houver tempo.

## Riscos conhecidos
- iPhone: a câmera no app instalado (PWA) precisa de permissão e de HTTPS (já tem). A leitura por câmera no navegador é mais lenta que a nativa; a Q9 mede.
- QR de 17 mm em papel brilhante pode refletir luz. Se falhar, aumentar o QR no PDF (ajuste de tamanho, não de arquitetura).
- Dois leitores ligados juntos (câmera e teclado) podem contar a mesma peça duas vezes: a regra de ignorar o mesmo código por 1,5 s cobre.
- Conferência com 28 mil variações: a rolagem até a linha lida precisa funcionar com a lista em páginas (o "Mostrar mais" atual). A Q3 abre sozinha a página onde a peça está.
