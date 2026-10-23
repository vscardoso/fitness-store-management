# WhatsApp oficial (Cloud API da Meta): plano e variáveis

Resumo das seções 13.4 e 13.13 do handoff do PC. **Este repositório é público: aqui só entram NOMES de variáveis e onde elas ficam, nunca o valor.**

## O que é

Um segundo canal de WhatsApp da W.A Fitness, ligado à Cloud API oficial da Meta pelo telefone fixo da loja (3432151035), **sem provedor pago**. Ele NÃO substitui o WhatsApp Business do celular da loja. As conversas desse número aparecem dentro do app do Provador (caixa de entrada a construir), e um bot faz a primeira conversa. O WAHA (não oficial) caiu com `device_removed` e não deve ser reconectado.

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

## Regras que valem aqui

- Nada de envio, mensagem ou etiqueta em cliente real sem consultar o Victor. Todo teste primeiro pelo celular pessoal dele (o número pessoal NÃO fica neste repositório público).
- Mensagem de saída só é gravada como enviada depois que a Meta aceitar.
- Texto para cliente: nome da loja **W.A Fitness**, sem citar marca, sem travessão.
- Janela de atendimento de 24 horas: fora dela só mensagem-modelo (template), que pode ser paga. Anúncio apontando para o número novo só depois do aviso no celular funcionar, com revisão visual e ok do Victor.
- Persistência tudo-ou-nada; `npx tsc --noEmit` do mobile fica em 0 erros.
