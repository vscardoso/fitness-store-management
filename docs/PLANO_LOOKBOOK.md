# Plano: Lookbook (conjuntos de peças que viram venda)

Estado em 2026-10-29. Decisão do Victor: voltar ao Lookbook. Ideia: o look é uma combinação de peças (top + legging + jaqueta) vendida junto, com desconto de 3 ou mais peças, e o canal natural é o WhatsApp da loja. Cada loja tem o próprio WhatsApp (Cloud API, número vinculado em `whatsapp_cloud_numbers`).

## O que já existia
Servidor: `looks`/`look_items`, CRUD, desconto de 10% com 3 ou mais peças, vitrine pública `/public/looks`. App: lista, montar (2 passos), detalhe com "Pedir condicional". Site: `web/app/looks`.

## Defeitos corrigidos (14219ac)
Loja montava look com produto/variação/cliente de outra loja (vazamento); vitrine pública dava 500 e podia mostrar look de cliente; lista mostrava total 0.

## Fase A: look usável (não depende do WhatsApp)
- A1 Cada peça do look informa cor, tamanho, SKU e estoque (servidor) e a tela mostra se está disponível.
- A2 Escolher a variação (cor/tamanho) de cada peça ao montar; sem variação escolhida o look não salva.
- A3 Editar o look: nome, descrição, trocar a variação de uma peça, tirar peça, acrescentar peça. O desconto de 3 ou mais peças acompanha as mudanças.
- A4 "Vender este look" no PDV: põe todas as peças no carrinho com o desconto do look; recusa peça sem estoque dizendo qual.
- A5 "Pedir condicional" passa a mandar a variação de cada peça (antes mandava só o produto).

## Fase B: WhatsApp (depois que o WhatsApp oficial estiver consolidado)
- B1 "Enviar no WhatsApp": mensagem pronta com peças, tamanhos e total (`wa.me` já; pela Cloud API depois).
- B2 Número do WhatsApp da loja no cadastro da loja (hoje o site usa uma variável única `NEXT_PUBLIC_WHATSAPP_NUMBER`, que só serve a uma loja).
- B3 Link público do look por loja: a cliente toca em "Quero este look" e abre a conversa com a loja certa já com o look escrito.
- B4 Resposta da cliente na conversa vira atendimento no Provador (condicional ou venda a partir do look).

## Antes de liberar para outras lojas
Menu Lookbook segue escondido para lojas que não pediram (lista "Menus de fase 2" do CLAUDE.md). Perguntar à lojista da W.A se vende "montagens" hoje.
