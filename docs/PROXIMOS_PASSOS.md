# Próximos passos (24/10/2026)

Lista para dividir entre os devs e o Claude. Cada item tem tamanho (P até 1 dia, M até 3 dias, G mais de 3), dependências e o que prova que está pronto. Regras de trabalho em `docs/COORDENACAO.md` (pull antes de começar, migração confere `alembic heads`, id de revisão com no máximo 32 caracteres, commit em português, push e acompanhar o deploy). Coluna "Dono" fica em branco até a divisão.

Regras fixas do Victor que valem para tudo: nada vai a cliente real sem pedir; testes de ponta a ponta antes de dizer pronto; FIFO e estoque nunca se alteram na mão (ajuste sempre por entrada de ajuste, tudo ou nada); telas em português simples, sem CMV, ROI ou margem bruta; cores seguem a paleta da loja; sem segredo em chat, git ou doc (repo público); typecheck do app em 0.

---

## 1. Etiqueta e conferência de estoque (prioridade 1)

Objetivo: conferir o estoque lendo a etiqueta, e imprimir a etiqueta pelo sistema (hoje o Victor preenche à mão o verso da tag e cola um QR).

| # | Item | Tam. | Depende de | Pronto quando | Dono |
|---|---|---|---|---|---|
| 1.1 | **Código curto por variação, por loja** (`#0001`, `#0002`...). Tabela de contador por loja (sem reaproveitar, sem buracos), atribuído ao criar variação sob o mesmo lock do SKU (`sku_service.lock_catalog`), script de preenchimento das variações existentes por ordem de criação (simula sem `--apply`), campo `short_code` nas respostas de produto e variação, busca por código curto. Migração aditiva. | M | | Duas criações simultâneas nunca repetem o número (teste em `tests/pg`); script idempotente; produção numerada sem mexer em SKU || Nuvem: PRONTO no código (2026-10-26). Trava = linha do contador por loja (`catalog_counters`, `UPDATE ... RETURNING`), não o lock do SKU; transação desfeita devolve o número. Teste PG: 40 criações simultâneas em 2 lojas, sem repetir nem buraco. FALTA: rodar `scripts/short_codes_backfill.py` em produção (simular, depois `--apply`), com ok do Victor |
| 1.2 | **Layout da etiqueta nova** (verso da tag): nome, cor e tamanho, preço, código curto GRANDE, QR/código de barras, código da entrada pequeno, logo (ver 1.5). Gerar ZPL (203 dpi) e PDF do mesmo layout. Tamanho padrão da loja em `label_printers` (hoje 55x65 mm). | M | 1.1 | Impressão de teste conferida em papel com a régua; leitura do QR e do código de barras com celular e leitor || Nuvem: PDF PRONTO (2026-10-26), adesivo 50x60 em 4 faixas, SEM código da entrada nem logo (só o que a cliente pode ver). `POST /labels/pdf` e `/labels/pdf/entry/{id}`, folha A4 12 por folha com posição inicial ou rolo; app: cartão "Adesivo do verso da tag" em Gerar Etiquetas. Teste no navegador 21/21 e QR lido do PDF. FALTA: ZPL, impressão em papel com régua (não verificado) |
| 1.3 | **Como imprimir a partir do app** (decisão antes de codar): o backend roda no VPS e NÃO alcança impressora na rede ou USB da loja (`printer_service` abre TCP 9100 ou USB do servidor). Opções: (a) imprimir pelo navegador/PWA com o driver da impressora e tamanho de página fixo (mais simples, funciona em qualquer marca); (b) agente local no PC da loja que busca a fila de impressão no servidor e envia ZPL à impressora; (c) impressora com nuvem/Wi-Fi própria. Recomendação: começar por (a), deixar (b) para quando houver volume. | M | decisão do Victor | Etiqueta sai do PC da loja com um clique, sem passo manual | |
| 1.4 | **Conferência de estoque** (contagem). Backend: sessão de contagem (escopo: tudo, categoria ou prateleira), leituras por scan ou código curto somam 1, diferença por variação (sistema x contado), confirmação aplica o ajuste de uma vez: sobra vira entrada do tipo ajuste, falta consome das entradas existentes pelo FIFO existente. App: tela de contagem com scanner, tela de diferenças em português simples ("Short Duplo Azul M: sistema 3, contado 2, falta 1"), aviso antes de confirmar. Permissão: gerente. | G | 1.1 | Teste prova `restante = recebido - vendido pelas fontes` antes e depois do ajuste; contagem abandonada não grava nada; duas contagens abertas não se pisam | |
| 1.5 | **Logo na etiqueta**: logo da loja se existir, senão o do app (mesma regra da tela inicial); converter para preto e branco/dither para ZPL (`^GF`) e conferir legibilidade em 203 dpi. | P | 1.2 | Etiqueta com logo legível impressa | |
| 1.6 | **Impressora**: comprar e homologar (ver recomendação abaixo), cadastrar em `label_printers` e rodar a impressão de teste real. Hoje nada disso foi testado com impressora de verdade. | P | 1.2 | Etiqueta de verdade na mão | Victor |
| 1.7 | Reimpressão em lote: por entrada (todas as peças de uma compra) e por variação, quantidade igual ao comprado. | P | 1.2 | Entrada com 23 peças imprime 23 etiquetas certas || Servidor pronto (`POST /labels/pdf/entry/{id}`, uma por peça recebida); falta o botão em `entries/[id].tsx` (área do PC) |

### Impressora, o que já se sabe
- O sistema fala ZPL, CPCL e ESC/POS e já foi pensado para a **Elgin L42 Pro** (203 dpi) e compatíveis com ZPL.
- Preços de varejo variam muito e mudam; conferir no dia: Elgin L42 Pro Full entre ~R$ 1.470 e ~R$ 2.375 nas listagens consultadas; Zebra ZD220 entre ~R$ 1.719 e ~R$ 2.640.
- ZD220 só imprime em térmica direta (sem fita): barata de operar, mas a impressão desbota com o tempo. L42 Pro aceita térmica direta ou transferência (com fita), que dura mais.
- **Confirmar na ficha técnica antes de comprar:** se a impressora lê a marca/furo do papel tag (sensor de espaço ou marca preta) e aceita a gramatura do papel da tag; largura máxima de impressão compatível com a tag.
- Alternativa ao verso manual: comprar tag em branco em rolo e imprimir TUDO (inclusive o logo, em preto e branco). Só vale se a parte colorida da tag atual não for essencial.

---

## 2. Segurança e LGPD (prioridade 2)

| # | Item | Tam. | Pronto quando | Dono |
|---|---|---|---|---|
| 2.1 | **LGPD**: política de privacidade e termos de uso (texto revisado por quem entende), aceite no cadastro com versão e data gravadas no servidor, novo aceite só quando a versão mudar, rota para exportar os dados de um cliente da loja, rota para anonimizar/excluir um cliente, registro de quem acessou, contato do responsável. Guardamos nome, e-mail, telefone, nascimento e endereço de clientes das lojas. | G | Cadastro sem aceite não conclui; exportação e anonimização testadas; texto publicado em página pública || Nuvem: FEITO textos (rascunho, dados da empresa em branco, revisar com advogado), aceite no cadastro e no login, páginas públicas `/termos` e `/privacidade`. FEITO também (27/10/2026): exportar e anonimizar cliente, registro de quem acessou (ver CLAUDE.md, seção LGPD). Falta: revisão jurídica, dados da empresa e encarregado |
| 2.2 | Esconder campos de custo (cost_price, unit_cost, lucro) para caixa e vendedor nas respostas da API (hoje só o menu esconde). | M | Teste por papel mostra que caixa e vendedor não recebem custo || Nuvem: FEITO 27/10/2026 (`app/core/cost_mask.py`, ver CLAUDE.md) |
| 2.3 | Rate limit também em cadastro, reset de senha e scanner de IA (hoje só no login). | P | 429 com mensagem clara; testes || Nuvem: FEITO 27/10/2026 (ver CLAUDE.md, "Limite de tentativas") |
| 2.4 | Validar o conteúdo real das imagens enviadas (abrir com Pillow, limite de tamanho no código, não confiar no tipo declarado). | P | Arquivo que não é imagem é recusado | Nuvem: FEITO 28/10/2026 (`app/core/image_guard.py`, ver CLAUDE.md, "Imagens enviadas") |
| 2.5 | Dependabot e CI que falha em vulnerabilidade grave (hoje `safety` e `npm audit` com `|| true`). | P | PRs automáticos abrindo; CI barra grave | Nuvem: FEITO 28/10/2026 (`.github/dependabot.yml`, `security-audit.yml`, ver CLAUDE.md, "Dependências e vulnerabilidades") |
| 2.6 | Bot protection (Cloudflare Turnstile) no cadastro, perto do lançamento público. | P | Cadastro sem token recusado | |
| 2.7 | CSP no site do app (nginx), testando para não quebrar o PWA. | M | Sem erro de CSP no console em todas as telas | |
| 2.8 | Decidir e ligar o RLS no Postgres em produção (código pronto e dormente, roteiro em CLAUDE.md). | M | `rls_apply.py` aplicado, app rodando com o papel sem superusuário, rollback testado | |
| 2.9 | Trocar a senha de root do VPS e rever a porta 5678 do n8n (Docker publica por cima do ufw). | P | Só o necessário exposto | Victor |

---

## 3. Produto, dinheiro e relatórios

| # | Item | Tam. | Pronto quando | Dono |
|---|---|---|---|---|
| 3.1 | **Ajuste retroativo de custo**: custo lançado depois (desconto, frete) corrigir o lucro de peças já vendidas, com aviso e histórico. Hoje só o saldo em estoque muda. Precisa de decisão do Victor. | G | Venda antiga recalculada com trilha de auditoria; FIFO intacto | |
| 3.2 | Web Push no PWA (alertas de estoque baixo e outros). Falta o Victor dizer quais alertas quer. | M | Alerta chega no celular com o app fechado | |
| 3.3 | Relatórios novos: fluxo de caixa, clientes, contas a pagar, taxa da maquininha por forma de pagamento (margem real). | G | Cada tela em português simples | |
| 3.4 | Unificar "lote" e "entrada" nos textos do app. | P | Um só termo em todas as telas | |
| 3.5 | PDV: confirmação manual como padrão para cartão e PIX, bloquear o PIX `mock` em produção, taxa da maquininha por loja. | M | Venda no cartão sem maquininha integrada fecha por confirmação manual | |
| 3.6 | Despesa recorrente gerar o lançamento do mês seguinte. | M | Teste com virada de mês | |
| 3.7 | Esconder menus de fase 2 (Lookbook, Wishlist e outros) antes de liberar para outras lojas. | P | Menu só com o que funciona | |
| 3.8 | Entrada com vários fornecedores: o campo "Desconto do fornecedor" da Nova Entrada é geral; permitir desconto por fornecedor já na criação. | M | Criar entrada com dois fornecedores e dois descontos de uma vez | |
| 3.9 | Rota `POST /returns/reconcile-status` inalcançável (a rota `/returns/{sale_id}` casa antes). | P | Rota responde | |
| 3.10 | W.A Fitness em produção: desligar "esta loja devolve dinheiro" (Mais > Prazo de troca e devolução). Aguarda o sim do Victor. | P | Configuração gravada | Victor |

---

## 4. Marca, infra e distribuição

| # | Item | Tam. | Pronto quando | Dono |
|---|---|---|---|---|
| 4.1 | **Decisão do público e do nome** (só moda ou varejo em geral). `provadorfit.com.br` limita a fitness; busca no INPI e Play Store ainda não feitas. Domínios livres a confirmar no Registro.br. | decisão | Nome e domínio decididos ANTES do primeiro APK (o pacote Android é permanente) | Victor |
| 4.2 | APK Android (identificador do pacote, EAS, ícone da marca). | M | APK instalando e entrando | |
| 4.3 | Renomear textos "Fitness Store Management" para Provador, título da aba, e-mails. | P | Nenhum texto antigo visível | |
| 4.4 | E-mail automático do app (Resend): SPF único juntando Zoho e Resend; provar SPF/DKIM PASS no envio. | M | E-mail de teste com SPF e DKIM PASS | |
| 4.5 | WhatsApp oficial (Cloud API): dependente dos passos da Meta e dos arquivos de token do Victor; depois gravar variáveis no servidor, vincular o número à loja e testar o webhook. | M | Mensagem de teste chega e é gravada | Victor + dev |
| 4.6 | Crédito na chave Gemini (Google AI Studio) para o scanner voltar; chave não pode aparecer em chat. | P | Scanner lê uma foto de produto | Victor |
| 4.7 | Desligar Render e Neon; remover o container `moneyprinterturbo-api` em loop no VPS. | P | Sem custo e sem container quebrado | |
| 4.8 | Cópia da chave privada dos backups (`~/.ssh/provador_backup`) no gerenciador de senhas; teste periódico de restauração. | P | Restauração testada este mês | Victor |
| 4.9 | CI do backend vermelho: consertar ou remover os testes mortos (100 falhas e 21 erros antigos) para o CI voltar a ser sinal confiável. | G | CI verde | |

---

## 5. Dívida de verificação (já está em produção, falta olhar na tela)

Nada abaixo foi clicado no navegador ou no celular; só testes da API, tipos e produção no ar:
- troca e devolução (modal Troca e devolução, escolha da peça nova, diferença a pagar, peça com defeito);
- Mais > Prazo de troca e devolução; Fornecedores > Devoluções; botão Devolver ao fornecedor no item da entrada;
- desconto por fornecedor (formulário com escolha do fornecedor e lixeira por linha);
- quadros Custo total, Markup e Lucro do lote (em %) no topo da entrada;
- layout dos botões do item da entrada em tela estreita (iPhone);
- logo da loja x logo do app depois de trocar de conta;
- Nova Entrada: variação nova de produto já cadastrado.

Roteiro de teste sugerido em `docs/RELATORIO_SESSAO_2026-10-23.md`, seção 6, e para a conferência (1.4) escrever o roteiro junto com a entrega.

---

## 6. Sugestão de divisão

- **Dev A (app e etiqueta):** 1.2, 1.5, 1.7 e as telas do 1.4. Arquivos: `mobile/components/labels/*`, `mobile/app/products/label/*`, telas novas de conferência.
- **Dev B (backend e dados):** 1.1 e a parte de servidor do 1.4, depois 3.1 e 3.8. Arquivos: `backend/app/models`, `services/sku_service.py`, serviço novo de contagem, migrações.
- **Dev C (segurança e LGPD):** 2.1 a 2.7. Arquivos: `backend/app/core`, `api/v1/endpoints/auth.py`, `store.py`, páginas públicas.
- **Claude:** 1.3 (decisão e protótipo de impressão), 1.4 em dupla com o Dev B, 3.9, 3.4 e a dívida de verificação da seção 5.
- **Victor:** 1.6, 2.9, 3.10, 4.1, 4.5, 4.6, 4.8 e as decisões marcadas.

Conflitos a evitar: `CLAUDE.md`, `models/__init__.py`, `router.py`, `permissions.py` e `docs/COORDENACAO.md` são compartilhados, só acrescentar linhas e dar pull imediatamente antes. Toda rota nova precisa de regra em `permissions.py`. Migração nova: conferir `alembic heads` e usar id de revisão com até 32 caracteres.
