# Provador Fit como Tech Provider: passo a passo (para o Victor)

Objetivo: ligar o WhatsApp Business do celular da loja (99650-0091) ao Provador por coexistência.
Base: documentação oficial da Meta lida em 05/11/2026 (ver `docs/whatsapp-cloud-plano.md`, seção "Estudo: celular da loja").
Nada aqui é segredo: IDs de app não são segredo; token e App Secret nunca vão para este arquivo.

## Links diretos (app Provador Fit, ID 2218667769031250)

Os endereços do painel da Meta mudam às vezes; se algum cair na página inicial, use o menu da esquerda do painel do app.
- Configurações básicas: https://developers.facebook.com/apps/2218667769031250/settings/basic/
- Casos de uso (WhatsApp > Personalizar > Tech Provider onboarding): https://developers.facebook.com/apps/2218667769031250/use_cases/
- Revisão do app (permissões): https://developers.facebook.com/apps/2218667769031250/app-review/permissions/
- Pedidos de revisão enviados: https://developers.facebook.com/apps/2218667769031250/app-review/requests/
- WhatsApp > Configuração da API (mensagem de teste): https://developers.facebook.com/apps/2218667769031250/whatsapp-business/wa-dev-console/
- WhatsApp Manager, modelos de mensagem: https://business.facebook.com/wa/manage/message-templates/
- Política de privacidade (para colar no app): https://app.provadorfit.com.br/privacidade
- Termos (para colar no app): https://app.provadorfit.com.br/termos

## 1. Ajustes básicos do app (Painel do app Provador Fit > Configurações do app > Básico)

- Ícone do app (1024 x 1024): usar `mobile/assets/icon.png` (logo Provador).
- URL da Política de Privacidade: `https://app.provadorfit.com.br/privacidade`
- URL dos Termos de Serviço: `https://app.provadorfit.com.br/termos`
- Categoria: Negócios e páginas (ou "Business and pages").
- Salvar.

## 2. Virar Tech Provider (Painel do app > Casos de uso > WhatsApp > Personalizar > Tech Provider onboarding)

1. "Verify your business": a W.A já é verificada; deve aparecer concluído.
2. "Onboard without a partner" (sem parceiro).
3. Clicar em "Begin App Review".

## 3. Revisão do app (as duas permissões)

A Meta exige, para CADA permissão, um texto e uma gravação de tela (print não vale). Rascunho não é avaliado: lembrar de clicar em Enviar. Tempo médio informado pela Meta: cerca de 24 horas.

### whatsapp_business_messaging

Texto (colar em inglês):

> Provador is a management and CRM app for small fashion retail stores. Each store connects its own WhatsApp Business number to Provador so the store staff can read and answer customer messages inside the app, next to the customer's purchase history. We use whatsapp_business_messaging to receive incoming messages through webhooks and to send replies typed by the store staff within the 24-hour customer service window. We do not send unsolicited or automated marketing messages.

Gravação (30 a 60 segundos): Painel do app > WhatsApp > API Setup (Configuração da API), escolher o número de teste, mandar a mensagem de teste para o seu celular e mostrar a mensagem chegando no WhatsApp do celular. (A Meta aceita essa gravação do próprio painel.)

### whatsapp_business_management

Texto:

> Provador uses whatsapp_business_management to read and manage the WhatsApp Business account of each connected store: the phone number status and display name, the business profile (description, address, website), webhook subscription for the store's account, and message templates the store creates to start conversations. Store owners connect their own account through Embedded Signup and can disconnect at any time.

Gravação: abrir o WhatsApp Manager (business.facebook.com > WhatsApp Manager > Modelos de mensagem), criar um modelo simples (ex.: categoria Utilidade, nome `teste_provador`, texto "Olá, seu pedido está pronto para retirada.") e enviar para análise.

## 4. Depois da aprovação: tela de conexão (eu passo os valores exatos quando chegar aqui)

- Facebook Login for Business > Configurações: domínio `app.provadorfit.com.br` em "Domínios permitidos" e "URIs de redirecionamento válidos".
- Facebook Login for Business > Configurações > Criar a partir de modelo: "WhatsApp Embedded Signup". Anotar o ID da configuração (não é segredo).
- Webhooks do app: assinar também `account_update`, `history`, `smb_app_state_sync` e `smb_message_echoes` (além de `messages`, que já está).

## 5. Conectar o celular da loja

- WhatsApp Business no celular atualizado (versão 2.24.17 ou mais nova) e aberto.
- No Provador (Mais > WhatsApp > Conectar o WhatsApp do celular), tocar em Conectar, escolher a W.A, digitar o 99650-0091, aceitar a mensagem que chega no app ("Conectar" e "Conectar à Plataforma Business"), permitir compartilhar o histórico e colar o código.
- O Provador puxa contatos e até 6 meses de conversas (prazo da Meta: 24 horas).
- Antes: avisar a equipe que o WhatsApp Web e outros aparelhos vão desconectar e precisam ser conectados de novo, e que as listas de transmissão ficam só leitura.

## Andamento

- 05 e 06/11/2026: configurações básicas do app preenchidas (privacidade, termos, exclusão de dados em `app.provadorfit.com.br/exclusao-de-dados`, ícone, categoria); integração como Independent Tech Provider iniciada; modelo `peca_separada` (Utilidade, pt_BR) criado no WhatsApp Manager para o vídeo 2; revisão do app ENVIADA só com `whatsapp_business_messaging` e `whatsapp_business_management` (as outras permissões dos casos de uso foram tiradas da revisão). Operadores declarados: Hetzner Online GmbH e Google LLC. Prazo informado pela Meta: até 20 dias.
- Risco conhecido: o vídeo 1 não mostra o fluxo de conexão (Embedded Signup), porque a tela ainda não existia. Se reprovar por isso, fazer a tela, regravar e reenviar.
