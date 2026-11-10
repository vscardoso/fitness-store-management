# Restaurar o produto #039 (loja 2), 10/11/2026

- **Pedido do Victor**: voltar o #039 ("Conjunto Calça Flare Com Blusa De Manga", id 41, loja 2) para reutilizar como cadastro. Autorizou também pular a guarda de publicação nesta operação (só esta).
- **Por que sumiu**: foi desativado em 04/11/2026 às 20:48 (Brasília), com as 4 variações marcadas `_del_<id>` no SKU. Nunca teve venda. Não há registro de auditoria de quem excluiu naquele dia.
- **O que foi feito** (`restaurar_039.sql`, uma transação que se cancela se a contagem não for 1 produto e 4 variações): produto e variações ativos, SKU original de volta. Os itens de entrada 125 a 128 (entrada ROLETTE) ficam desativados: o produto voltou com 0 peças e não publicado no site.
- **Conferido depois**: produto ativo, 4 variações ativas (#039-1 a #039-4, códigos 77 a 80), inventário 0, 0 itens de entrada ativos.
- **Desfazer**: `desfazer_restauracao_039.sql`.
- Preflight de segurança antes de gravar: nenhum SKU original estava em uso por outra variação ativa.
