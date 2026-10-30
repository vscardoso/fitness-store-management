# WhatsApp oficial (Cloud API da Meta): plano e variáveis

Resumo das seções 13.4 e 13.13 do handoff do PC. **Este repositório é público: aqui só entram NOMES de variáveis e onde elas ficam, nunca o valor.**

## O que é

Um segundo canal de WhatsApp da W.A Fitness, ligado à Cloud API oficial da Meta pelo telefone fixo da loja (3433050261), **sem provedor pago**. Ele NÃO substitui o WhatsApp Business do celular da loja. As conversas desse número aparecem dentro do app do Provador (caixa de entrada a construir), e um bot faz a primeira conversa. O WAHA (não oficial) caiu com `device_removed` e não deve ser reconectado.

## Passo a passo da Meta (seção 13.4): quem faz o quê

**Victor (na conta dele; o Claude não cria conta nem usa senha):**

1. `developers.facebook.com`, Meus apps, Criar app, caso de uso "Conectar-se com clientes pelo WhatsApp", nome **Provador WhatsApp**, portfólio de negócios da W.A. Criar app NOVO (não usar o app Meta da automação do Instagram).
2. "Começar a usar a API": criar a conta do WhatsApp Business com o nome W.A Fitness.
3. Em "De", adicionar o número fixo, nome de exibição W.A Fitness, verificação por **ligação de voz** (SMS não recomendado), com alguém ao lado do telefone. Limite de 10 tentativas em 72 horas. Anotar o **ID do número** (`phone_number_id`) e o **ID da conta** (WABA ID); nenhum dos dois é segredo.
4. Configurações da empresa, Usuários do sistema: criar `provador-bot`, atribuir o app e a conta do WhatsApp com Controle total, gerar o token com as permissões `business_management`, `whatsapp_business_messaging` e `whatsapp_business_management`. Pegar o App Secret em App Dashboard, Configurações, Básico.
5. Só **depois** que a rota do webhook estiver no ar: configurar o webhook na Meta (URL de callback, verify token escolhido por nós, assinar o campo `messages`).

**PC (Claude do Windows, com acesso ao VPS):** ler os arquivos de segredo sem repetir o valor, gravar no `.env.prod` do servidor (modo 600), conferir o webhook em produção e acompanhar o deploy.

**Nuvem (Claude remoto):** construir a rota, os modelos e a migração, e testar assinatura e idempotência com eventos simulados.

Para testar antes de gastar as tentativas de verificação do fixo, a Meta dá um número de teste grátis no "API Setup" e deixa cadastrar o celular pessoal do Victor como destinatário. Dá para construir e testar tudo assim e só depois adicionar o fixo. Não confirmado: se o app precisa estar em modo Live ou ter URL de política de privacidade para receber mensagens reais de clientes (verificar na doc da Meta antes de apontar anúncio).

## Variáveis (só os nomes)

Ficam no `.env.prod` do VPS (`/opt/provador/.env.prod`, modo 600). Em desenvolvimento, no `backend/.env` local (já ignorado pelo git). Nunca no git, no chat ou em documento.

| Variável | O que é | Segredo? |
|---|---|---|
| `WHATSAPP_CLOUD_ACCESS_TOKEN` | token permanente do usuário do sistema `provador-bot` | **sim** |
| `WHATSAPP_CLOUD_APP_SECRET` | App Secret do app "Provador WhatsApp"; valida a assinatura `X-Hub-Signature-256` dos webhooks | **sim** |
| `WHATSAPP_CLOUD_VERIFY_TOKEN` | texto que escolhemos para a verificação inicial do webhook (`hub.verify_token`) | **sim** (trate como segredo) |
| `WHATSAPP_CLOUD_PHONE_NUMBER_ID` | ID do número de envio (vai na URL `graph.facebook.com/v23.0/<id>/messages`) | não |
| `WHATSAPP_CLOUD_WABA_ID` | ID da conta do WhatsApp Business | não |
| `WHATSAPP_CLOUD_API_VERSION` | versão do Graph API (padrão `v23.0`) | não |

No PC do Victor, o token e o App Secret são guardados em dois arquivos locais (`wa-token.txt` e `wa-app-secret.txt`, na pasta `.claude` do usuário); o Claude do PC lê sem mostrar o valor e grava no servidor. A nuvem **não** tem acesso a esses arquivos nem ao VPS: lê as variáveis só por `settings` (`backend/app/core/config.py`, valores vazios por padrão) e, nos testes, usa valores falsos.

## Primeiro passo concreto (seção 13.13)

1. O Victor diz em que passo da seção 13.4 está e passa os IDs (conta e número); confirma que os dois arquivos de segredo existem no PC.
2. **Base (Nuvem):** modelos, migração, webhook com assinatura e idempotência, testados com eventos simulados assinados com um segredo de teste, commit e push (o Deploy VPS publica sozinho):
   - rota nova `GET/POST /webhooks/whatsapp-cloud` (o webhook antigo `POST /webhooks/whatsapp` do bot Baileys continua como está);
   - GET de verificação: devolver `hub.challenge` em texto se `hub.verify_token` bater, senão 403;
   - POST: validar `X-Hub-Signature-256` (`sha256=` + HMAC-SHA256 do CORPO BRUTO com o App Secret), comparação em tempo constante, 403 antes de qualquer outra coisa; responder 200 rápido;
   - idempotência: guardar o id da mensagem da Meta com índice único e ignorar repetida; tudo em UMA transação (tudo-ou-nada);
   - modelar telefone e BSUID (identificador por empresa): não assumir que o telefone sempre existe; telefone brasileiro com e sem o 9 depois do DDD é o mesmo contato.
3. **Meta (PC/Victor):** configurar o webhook no painel e testar com o número de teste da Meta e o celular pessoal.
4. Depois: caixa de entrada no app (sem aba nova; entrada pelo menu Mais), aviso no celular, bot.

## Estado (2026-10-23)

Base pronta e testada só com eventos simulados (nenhuma mensagem real da Meta ainda):

- Tabelas `whatsapp_cloud_numbers` (número da Meta -> loja), `whatsapp_conversations` (contato x número; chave = telefone normalizado ou `u:` + BSUID) e `whatsapp_messages` (`wamid` único). Migração `20261023_whatsapp_cloud`, aditiva, testada no Postgres (upgrade, downgrade, upgrade; schema igual ao do modelo).
- `GET /webhooks/whatsapp-cloud`: devolve `hub.challenge` se `hub.verify_token` bater; senão 403 (também 403 com o token vazio no servidor).
- `POST /webhooks/whatsapp-cloud`: sem App Secret configurado = 503; assinatura errada, ausente ou corpo adulterado = 403 e nada gravado; JSON inválido = 400. Grava tudo numa transação; erro no meio = 500 e nada gravado (a Meta reenvia). Mensagem repetida é ignorada; entregas simultâneas da mesma mensagem (testado no Postgres, 5 ao mesmo tempo) gravam uma vez. Número sem loja vinculada: 200 e ignora.
- Celular com e sem o 9 é a mesma conversa; fixo não ganha 9. Contato só com BSUID vira conversa `u:<bsuid>` e recebe o telefone quando ele aparecer. Campos de BSUID **observados em payload real (30/10/2026)**: `contacts[].user_id` (formato `BR.<números>`), `statuses[].recipient_user_id`; o payload de status também traz `recipient_id` (telefone sem o 9 de celular, ex.: `553488...`). O código ainda NÃO lê `statuses[].recipient_user_id` (ver pendências).
- Status de entrega (sent < delivered < read) só avança; failed guarda o erro e não desfaz delivered/read; status de mensagem que não foi enviada pelo app é ignorado.
- Vincular o número à loja: `backend/scripts/wa_cloud_vincular_numero.py` (simula por padrão, `--apply` grava; recusa número de outra loja).
- O container de produção só recebe as variáveis listadas em `deploy/docker-compose.prod.yml` (já estão lá).

Falta: envio (texto dentro da janela de 24 h, gravado só depois que a Meta aceitar), baixar mídia, caixa de entrada no app, aviso no celular, bot.

## Regras que valem aqui

- Nada de envio, mensagem ou etiqueta em cliente real sem consultar o Victor. Todo teste primeiro pelo celular pessoal dele (o número pessoal NÃO fica neste repositório público).
- Mensagem de saída só é gravada como enviada depois que a Meta aceitar.
- Texto para cliente: nome da loja **W.A Fitness**, sem citar marca, sem travessão.
- Janela de atendimento de 24 horas: fora dela só mensagem-modelo (template), que pode ser paga. Anúncio apontando para o número novo só depois do aviso no celular funcionar, com revisão visual e ok do Victor.
- Persistência tudo-ou-nada; `npx tsc --noEmit` do mobile fica em 0 erros.

## Estado (2026-10-30): número no ar, recebimento real comprovado

**Repositório público: aqui só IDs que não são segredo. Token, App Secret e verify token ficam só no `.env.prod` do VPS e em arquivos locais do Victor.**

### O que foi feito (Meta)

- App novo **Provador Fit** (ID `2218667769031250`) no portfólio empresarial da W.A (verificação da empresa já concluída). NÃO reusar o app antigo da automação do Instagram. Atenção: o app tem um "app do Threads" com App Secret próprio (ID `2236182867778431`); ele NÃO serve para o webhook (a Meta devolve erro 190 de assinatura inválida).
- Número fixo **+55 34 3305-0261** registrado por ligação de voz (a ligação é gravada em inglês e fala os dígitos). Nome verificado **W.A. Fitness**, status VERIFIED.
  - `phone_number_id` = `1317051404835668`
  - WABA ID = `1119795014098348` (aparece na Meta como "W A Moda Fitness"; renomear o portfólio é opcional e não afeta o que o cliente vê)
- Número de teste da Meta (+1 555-179-4908): `phone_number_id` `1069559752900841`, WABA `1247720830277736`. Só serve para teste; não usar em produção.
- Token: usuário do sistema **Employee** (criado pela Meta no fluxo do app), tipo SYSTEM_USER, **não expira**, escopos `business_management`, `whatsapp_business_management`, `whatsapp_business_messaging`. Gerar token exigiu verificação de conta/e-mail no portfólio.
- Webhook configurado no painel: URL de callback `https://api.provadorfit.com.br/webhooks/whatsapp-cloud`, verificado com sucesso (GET 200 com `hub.challenge`).

### O que foi feito (servidor)

- `/opt/provador/.env.prod` (modo 600) com `WHATSAPP_CLOUD_ACCESS_TOKEN`, `_APP_SECRET`, `_VERIFY_TOKEN`, `_PHONE_NUMBER_ID`, `_WABA_ID` (valores do número FIXO). Backups do arquivo em `/opt/provador/backups/env.prod.antes_wa` e `env.prod.antes_wa2`. O compose de produção já repassava essas variáveis ao container; `docker compose ... --env-file .env.prod up -d backend` aplica.
- Número vinculado à **loja 2 (W.A Fitness)** (a loja 1 é "WA Fitness", outra) com `scripts/wa_cloud_vincular_numero.py` (simulação primeiro, depois `--apply`; rodar de novo diz "nada a fazer").

### Testes feitos (com saída observada)

- Verificação: GET com token certo = 200 e devolve o desafio; token errado = 403.
- POST sem assinatura = 403 `invalid signature` (antes de configurar o App Secret seria 503).
- Token validado na Graph API: lê o `phone_number_id` do fixo (VERIFIED) e do número de teste; `debug_token` confirma app, tipo SYSTEM_USER, sem expiração e os 3 escopos. App Secret validado com a Meta (chamada `access_token=<app_id>|<secret>` devolve o app).
- **Recebimento real**: mensagem de texto do celular do Victor para o fixo, 30/10 às 19:31 (BRT), chegou como `POST /webhooks/whatsapp-cloud` com 200; gravada em `whatsapp_messages` (direção `in`, com `wamid`) e `whatsapp_conversations` (loja 2, chave = telefone normalizado com o 9).
- Envio pelo painel da Meta (hello_world para o celular de teste): chegou. O primeiro envio falhou com erro 131000 (genérico) e passou na segunda tentativa; causa não confirmada (suspeita: formato do número com/sem o 9).

### Pendências (para o próximo dev)

1. Meta: ligar **Assinar webhooks** do número fixo e conferir o campo `messages` assinado (o evento chegou, então deve estar ok; confirmar na tela).
2. Meta: **cartão de pagamento** (só o Victor faz) e requisitos do app para publicar/Live: ícone 1024x1024, URL da política de privacidade, URL de instruções de exclusão de dados, categoria. A tela mostra "Não qualificado para envio no momento"; não está confirmado se isso bloqueia mensagens de clientes reais. Criar as páginas de política de privacidade e exclusão de dados em `provadorfit.com.br`.
3. Perfil do número no Gerenciador do WhatsApp: foto (logo quadrada 640x640), descrição (até 512 caracteres), endereço (Av. dos Taróis, 640), categoria.
4. Código: ler `statuses[].recipient_user_id` no tratamento de status; criar fixture de teste a partir de um payload real REDIGIDO (os payloads trazem telefone e BSUID do cliente: trocar por valores falsos antes de commitar).
5. Envio de saída (texto dentro da janela de 24 h, gravado só depois da Meta aceitar), modelos (templates) em português para iniciar conversa, baixar mídia, caixa de entrada no app, aviso no celular, bot.
6. Teste de recebimento pelas donas da loja: pedir que mandem "oi" para o fixo e conferir em `whatsapp_messages` (ainda não feito até este registro).
7. Antes de apontar anúncio para o número: aviso no celular funcionando, revisão visual e ok do Victor.

### Armadilhas encontradas

- Celular brasileiro: o WhatsApp devolve o `wa_id` **sem o 9** (ex.: 5534988... vira 553488...). Casar sempre as duas formas.
- Para o painel pedir código de segurança por SMS, o telefone da conta Meta precisa receber SMS. Telefone fixo não recebe. O e-mail da conta Meta pode ser diferente do e-mail pessoal.
- Texto livre fora da janela de 24 horas não é entregue; o primeiro contato só por modelo aprovado ou o cliente escrevendo primeiro (QR code).
- O log de acesso do backend grava a URL do GET de verificação com o verify token; tratar o log como sensível.
- Mexer no `.env.prod` e reiniciar o backend: rodar antes `python3 /opt/provador/guarda_publicacao.py --status` no VPS (só quando LIVRE; o login do próprio Victor conta como uso).

## Estado (2026-10-30, noite): envio de texto e caixa de conversas (nuvem)

- Backend: `POST /whatsapp/conversations/{id}/send` (`send_text` em `whatsapp_cloud_service.py`): só texto livre com a janela de 24 h aberta (última mensagem DO CONTATO), manda para o `wa_id` que a Meta conhece (celular pode vir sem o 9), grava a mensagem como `sent` SÓ depois que a Meta devolve o `wamid`. Recusa da Meta, timeout, token ausente e resposta sem `wamid` viram erro legível 424 e nada é gravado (5xx seria reescrito pelo tratador de erros amigáveis). Também: `GET /whatsapp/conversations`, `GET /whatsapp/conversations/{id}`, `POST .../read`, `GET /whatsapp/unread-count`. Papel mínimo: vendedor (regra em `permissions.py`).
- Status de entrega: `recipient_user_id` agora completa o BSUID da conversa. A fixture com payload real redigido ainda NÃO existe (o teste usa valor falso).
- App: Mais > "Conversas do WhatsApp" (e "WhatsApp" na barra lateral do notebook), telas `app/whatsapp/index.tsx` e `[id].tsx` (bolhas, status da mensagem, aviso de janela fechada, campo bloqueado fora da janela, não lidas zeradas ao abrir, atualização a cada 10 a 20 s). Sem aba nova.
- Testes: `tests/test_whatsapp_inbox.py` (10) + os 23 do webhook + permissões + looks: 93 passam. No navegador (backend local, Meta inacessível): lista, abrir, enviar com erro legível, janela fechada, não lidas zeradas: 8/8, sem erro de JS.
- NÃO verificado: envio real pela Meta (nenhum envio real foi feito), iPhone/PWA físico, aviso no celular (push) e modelos (templates) para fora da janela. Proposta para o aviso: o projeto já tem push do Expo para alertas da loja; ligar o webhook de mensagem nova a ele. Aguardando ok do Victor antes de construir.
- Teste real pendente (com o Victor): mandar "oi" do celular dele para o fixo, abrir em Mais > Conversas do WhatsApp e responder.

### Teste real de envio e recebimento (2026-10-30, ~19:55 BRT)

- Recebimento: "Oi" do celular do Victor para o fixo chegou (19:51) e está na loja 2 (conferido no banco, só leitura). A caixa vazia que ele viu era a loja 1 ("WA Fitness", teste); a real é a loja 2 ("W.A Fitness"). Atenção: nomes quase iguais.
- Envio: a resposta "Boa noite, tudo bem?" (19:55) chegou no celular dele, com o aviso padrão da Meta de serviço seguro. Fica a conferir no app se a bolha aparece com o status de entrega (assumido que saiu pelo app; não confirmado).
