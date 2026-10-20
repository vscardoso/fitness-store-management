# Plano de produto: gestão para loja de moda fitness (2026-10-20)

Objetivo: transformar o fitness-store-management num SaaS vendável para lojas de moda fitness, com produto original (sem clonar ninguém). Referência de modelo: freemium/Pro R$49/mês já definido.

## Pesquisa de mercado (pública, só leitura de blogs e páginas de produto)

Concorrentes que lojistas de roupas comparam: Bling, Tiny, Conta Azul, UpGestão, Gestor Loja de Roupas, Kyte, Nuvemshop (loja virtual, integra com Bling).

O que os guias do setor listam como obrigatório para loja de roupas:
- estoque por grade (tamanho x cor)
- PDV integrado a estoque e financeiro
- emissão de NFC-e / nota fiscal
- vendas loja física + online
- cadastro de clientes
- pagamentos cartão, PIX, boleto

Queixas recorrentes sobre o Bling (Capterra e Nuvemshop): suporte lento, falha de sincronização de estoque, instalação difícil. É onde um produto simples e focado ganha.

NÃO VERIFICADO: preços atuais de Bling, Tiny, Kyte e demais. A busca não trouxe valores. Antes de cravar R$49, abrir os sites oficiais e anotar os planos.

## Onde o produto já se diferencia (existe no código)

- Envio condicional (try before you buy) com itens KEPT/RETURNED/LOST: raro nos concorrentes gerais, e é dor real de moda fitness.
- Viagens de compras (Trip) com entradas de estoque e FIFO estrito.
- Looks (combinações de produtos), wishlist, catálogo público com carrinho WhatsApp.
- Scanner de produto por IA, wizard de criação em 3 etapas.
- PDV com PIX e vários provedores de maquininha, impressoras de etiqueta.
- Multi-tenant, plano por loja, Mercado Pago (PIX + preapproval).

## Lacunas encontradas (conferir antes de priorizar)

1. Emissão fiscal (NFC-e/NF-e): não achei nenhum endpoint de emissão em `backend/app/api/v1/endpoints`. É o maior bloqueio para lojas formais. Caminho: integrar um emissor via API (Focus NFe, eNotas ou PlugNotas) em vez de construir.
2. Grade tamanho x cor: existe variant_id em entradas, mas validar na UI se a matriz de grade (cadastro e leitura de estoque) é de primeira classe.
3. Sincronização com marketplaces e loja online (Nuvemshop, Mercado Livre): não encontrei.
4. Relatório de curva ABC, giro e ruptura por tamanho: validar em `reports.py`.

## Ordem sugerida

1. Congelar escopo do MVP vendável: grade + PDV + condicional + financeiro (já existe, só endurecer).
2. Validar demanda antes de construir fiscal: 5 a 10 lojistas de Uberlândia usando por 30 dias (a W.A é o caso zero).
3. Integrar emissor fiscal via API (maior alavanca de venda).
4. Landing em `web/` com a mensagem "condicional + grade, sem a dor do ERP gigante".
5. Preço: decidir só depois de levantar os planos reais dos concorrentes.

## Pendências de verificação

- Preços dos concorrentes (acima).
- Se os 16 cenários e2e do backend ainda passam (último commit citava 16/16).
- Estado real do deploy e do billing em produção.
