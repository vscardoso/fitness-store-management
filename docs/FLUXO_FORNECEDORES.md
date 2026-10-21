# Fluxo de fornecedores na entrada de estoque (2026-10-21)

> Status: Fase 1 implementada em 21/10/2026 (fornecedor por item, padrão na entrada, vínculo automático, seletor, resumo, card do produto e migração dos textos antigos). Fases 2 e 3 pendentes.

Pedido: uma mesma entrada pode ter produtos de vários fornecedores (ex.: viagem ao Brás, várias lojas no mesmo dia). Pensar o fluxo, ideias de melhoria e ciclo de vida para o lojista.

## 1. Como é hoje (verificado por teste, 21/10/2026)

| Item | O que acontece |
|---|---|
| Fornecedor da entrada | Um único texto livre (`stock_entries.supplier_name`, obrigatório). Não aponta para o cadastro de fornecedores. |
| Fornecedor por item | O app envia `supplier_id` em cada item, mas o `EntryItemCreate` do backend não tem esse campo. Teste: dois itens de fornecedores diferentes foram gravados com `supplier_id` vazio. |
| Card "Fornecedores" do produto | Sempre vazio. `SupplierService.upsert_supplier_product` nunca é chamado, então `supplier_products` fica com 0 linhas (teste: 4 itens comprados, 0 vínculos). |
| Cadastro de fornecedores | Existe (nome, CNPJ, telefone, e-mail, observações), mas nada o alimenta nem o consulta durante a compra. |
| Cadastro atômico (produto novo + entrada) | Também não grava fornecedor por item nem vínculo. |

Consequência: o print do produto mostra a entrada "ENTRADA-001 · Brás" e, logo abaixo, "Nenhum fornecedor registrado". A informação existe só como texto solto na entrada.

## 2. Modelo proposto

- **Fornecedor** (cadastro): nome, CNPJ, WhatsApp, cidade/região (ex.: Brás), prazo de pagamento (dias), prazo de entrega, preferencial (sim/não), ativo.
- **Entrada**: fornecedor padrão opcional (atalho). Cada **item** tem o seu fornecedor (começa igual ao padrão, o lojista troca por item). Isso resolve compra mista.
- **Vínculo produto x fornecedor** (`supplier_products`): atualizado sozinho a cada entrada (último custo, última compra, nº de compras). Alimenta o card do produto e a comparação de preço.
- **Opcional (fase 3)**: documento por fornecedor dentro da entrada (nota/comprovante, forma de pagamento, valor, vencimento), porque na viagem cada loja tem o seu comprovante e o seu pagamento.

## 3. Fluxo na tela de nova entrada

1. Lojista escolhe a **viagem** ou o tipo da entrada (já existe).
2. Fornecedor padrão: seletor com busca e "Novo fornecedor" inline (mesmo padrão de "Nova categoria"). Texto digitado que não existe cria o cadastro (sem duplicar: nome normalizado e CNPJ).
3. Adiciona produtos; cada linha mostra o fornecedor e permite trocar com um toque.
4. Resumo agrupado por fornecedor: total por fornecedor e total geral. Aviso se algum item ficou sem fornecedor.
5. Ao salvar: itens com `supplier_id`, vínculos atualizados, e o card do produto passa a listar fornecedores com último custo.

## 4. Ciclo de vida

**Do fornecedor**
1. Descoberta: criado na hora da compra, só com o nome.
2. Qualificação: após a 1ª compra o app pede prazo, contato e uma nota de qualidade.
3. Recorrente: histórico de custo e frequência.
4. Preferencial: condições negociadas, entra primeiro nas sugestões de reposição.
5. Em atenção: custo subindo, muita devolução ou baixo giro dos produtos dele.
6. Inativo: sem compra há X dias; arquivado (soft delete), histórico preservado.

**Da compra (entrada)**
1. Planejada: lista de reposição sugerida (produtos em ruptura ou baixo), agrupada por fornecedor, compartilhável por WhatsApp.
2. Em compra: rascunho durante a viagem, vários fornecedores.
3. Recebida e conferida: quantidade comprada x conferida, divergência registrada.
4. Etiquetada: impressão de etiquetas (já existe).
5. À venda: estoque FIFO por variação.
6. Giro: sell-through e ROI por fornecedor (a análise por entrada já existe).
7. Encerrada: esgotada ou liquidada; custo real e lucro fechados.
8. Pós-venda: devolução ao fornecedor (defeito) ligada ao item da entrada.

## 5. Ideias, em ordem de valor

1. **Fundação (corrige o que está quebrado)**: `supplier_id` por item no backend, fornecedor padrão na entrada, vínculo automático em `supplier_products`. Sem isso nada abaixo funciona.
2. **Seletor com "Novo fornecedor" inline** e migração do texto livre antigo para cadastros (junta duplicados como "Brás", "bras").
3. **Card do produto com comparação**: fornecedores, último custo, variação de custo, "reabastecer com X".
4. **Ranking de fornecedores**: giro, margem e devolução por fornecedor (usa o que já existe por entrada).
5. **Lista de reposição por fornecedor** para a próxima viagem, enviada por WhatsApp.
6. **Contas a pagar por fornecedor** (prazo, vencimento, pagamento parcial), ligando ao módulo de despesas.
7. **Devolução ao fornecedor** e conferência de recebimento.
8. **Importar XML de NF-e de entrada**: cria a entrada e o fornecedor pelo CNPJ (conversa com a lacuna fiscal de `PLANO_PRODUTO.md`).

## 6. Fases sugeridas

- **Fase 1 (fundação)**: itens 1, 2 (seletor e migração) e card do produto. Backend: `EntryItemCreate.supplier_id`, `StockEntry.supplier_id` opcional (padrão), chamada do `upsert_supplier_product`, migração dos textos livres. App: seletor por entrada e por item, resumo por fornecedor, card do produto.
- **Fase 2 (inteligência)**: ranking, lista de reposição por fornecedor, comparação de custo.
- **Fase 3 (financeiro e conferência)**: documento por fornecedor, contas a pagar, devolução, XML de NF-e.

## 7. Perguntas abertas para o lojista

- Na viagem, cada loja do Brás dá comprovante/nota próprio? Pagam à vista, Pix ou prazo?
- Faz sentido controlar contas a pagar por fornecedor agora ou só histórico de compra?
- Existe fornecedor que vende o mesmo produto mais barato em outra época (comparação de custo é útil)?
