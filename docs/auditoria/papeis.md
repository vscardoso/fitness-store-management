# Auditoria: papéis, isolamento entre lojas e concorrência nas rotas de dinheiro

Data: 2026-11-08. Testes: `backend/tests/audit/papeis/` (50 testes: 35 passam, 15 `xfail` com motivo; 0 falhas; 0 erros 500 inesperados).
Rodar: `cd backend; TEST_DATABASE_URL=sqlite+aiosqlite:///./test_audit_pap.db SECRET_KEY=<32+ chars> DATABASE_URL=sqlite:///./test_audit_pap.db ENVIRONMENT=test ./venv/Scripts/python.exe -m pytest tests/audit/papeis -q --no-cov -p no:cacheprovider -W ignore -rxX` (cerca de 3 min no PC carregado).

Convenção: um bug confirmado vira `xfail(strict=True)` com o código `BUG-Pn` no motivo: quando for corrigido o teste "passa por engano" e o pytest manda tirar o `xfail`. Falha de invariante de concorrência no SQLite vira `xfail` "SEM TRAVA NO SQLITE" (ver seção d), não é bug confirmado.

## (a) Cenários cobertos

| Arquivo | O que prova |
|---|---|
| `test_matriz_papeis.py` | Tabela escrita à mão (não importada do código) com 98 rotas de dinheiro (vendas, devoluções, caixa, fiado, `/finance/*`, despesas, relatórios, dashboard, descontos, clientes/fidelidade, `/store/*`, PDV) x 4 papéis = 392 chamadas: 403 exatamente quando o papel está abaixo do mínimo documentado, nunca 403 acima, nunca 500. |
| `test_custo_escondido.py` | Caixa e vendedor em 22 a 27 rotas de leitura, mais a resposta da venda criada pelo caixa e da devolução feita pelo vendedor: nenhuma chave de custo/lucro/margem com valor, e varredura por VALOR (custo 40, total 120, lucro 180, margem 60) sob qualquer nome de campo. Controle: o admin vê o custo (detector não é vazio). 403 de rota de gerente só leva `{"detail"}`. |
| `test_isolamento_lojas.py` | Loja A com venda, devolução, fiado com parcela recebida, caixa aberto, conta bancária, transferência, retirada/empréstimo, conta a pagar, despesa, categoria, lote e viagem. Loja B (4 papéis) faz 53 ataques de leitura, escrita, apagar, uso de conta/categoria/lote/viagem/produto/cliente de A: nenhum 2xx, nenhum 500, nenhum nome de A em nenhuma resposta, e o estado de A idêntico (fotografia) no fim. 31 listagens x 4 combinações de cabeçalho forjado (`X-Tenant-Id`, `X-Store-Slug`) sem vazamento. B opera o próprio caixa normalmente. |
| `test_operacoes_reais_por_papel.py` | Com dado real: cancelar venda só admin (e devolve estoque), estorno por erro de lançamento só admin, ajuste de pontos/anonimizar/log de acesso só admin e nada muda quando barrado, exportar cliente (gerente+), editar cliente (vendedor+), fiado (caixa recebe, não desfaz/cancela/lança antigo), caixa da gaveta por papel, despesas/financeiro por papel (gerente não implanta nem troca banco do PIX), configurações da loja e descontos só admin. |
| `test_tokens_e_equipe.py` | Sem token, lixo, esquema errado, vencido, outra chave, sem `sub`, usuário inexistente, `alg=none`: 401/403 em ~30 rotas de dinheiro. Usuário desativado perde acesso na hora e volta com o mesmo token ao reativar. Troca de papel vale na requisição seguinte. Gerente/vendedor/caixa não mexem na equipe nem se promovem. Admin da loja B não lê, renomeia, promove, redefine senha, desativa nem reativa gente da loja A. Limite por plano (free 1, trial 3, pro 5) para criar e reativar. |
| `test_concorrencia.py` | `asyncio.gather` com uma sessão por requisição: devoluções simultâneas da mesma peça e parciais, cancelamentos simultâneos, cancelar+devolver, 5 e 10 recebimentos de fiado, desfazer o mesmo recebimento, abrir caixa 4x, sangrias acima do saldo, fechar caixa 3x, venda+sangria juntas, pagar/desfazer a mesma conta a pagar, fechar o mesmo mês 3x, despesas+transferências, última peça, pontos gastos duas vezes, cadastro de usuário na última vaga. |

Resultado: matriz de papéis, máscara de custo e isolamento entre lojas estão sólidos (nenhuma falha em 392 chamadas de papel, 53 ataques cruzados e ~130 leituras com cabeçalho forjado).

## (b) Bugs confirmados

### BUG-P5 (ALTA): gerente cancela venda JÁ CONCLUÍDA pelo PDV e contorna "cancelar = só admin"
- Passos: venda em dinheiro de 2 peças (concluída, pagamento `confirmed`); gerente chama `POST /api/v1/pdv/orders/{sale_id}/cancel`.
- Esperado: recusar (venda concluída não é "pagamento pendente"; cancelar venda é só admin e devolve o estoque).
- Obtido: 200 "Pagamento cancelado."; a venda vira `cancelled`, o estoque NÃO volta (8 antes, 8 depois), o pagamento continua `confirmed`. A receita some das contas (venda cancelada fica fora), o dinheiro continua na gaveta (aparece como sobra no fechamento do caixa) e a peça some do estoque. Pontos e fiado da venda não são revertidos por essa rota.
- Causa: `ManualProvider.cancel_payment` (`app/services/payment_providers/manual.py`) faz `UPDATE sales SET status=CANCELLED` sem checar o status atual nem restaurar nada, e a matriz libera a rota para gerente. `refund_payment` (admin) faz o mesmo com `REFUNDED`.
- Observação: as telas do PDV estão escondidas no app (`maquininhas` desligada), mas a API continua exposta.
- Teste: `test_operacoes_reais_por_papel.py::test_atalho_pdv_nao_cancela_venda_concluida`.

### BUG-P1 (MÉDIA): refresh token é aceito como token de acesso
- Passos: `create_refresh_token(...)` (7 dias) enviado como `Authorization: Bearer` em `GET /api/v1/sales/`.
- Esperado: 401 (acesso dura 30 min). Obtido: 200. `get_current_user` não confere `payload["type"] == "access"`. Quem rouba o refresh guardado no aparelho tem acesso completo por 7 dias, mesmo após logout (o logout revoga o registro, não o JWT usado como Bearer).
- Teste: `test_tokens_e_equipe.py::test_refresh_token_nao_serve_como_token_de_acesso`.

### BUG-P2 (MÉDIA): limite de usuários do plano estoura com cadastros simultâneos
- Passos: loja trial (limite 3) com 2 usuários; 4 `POST /team` ao mesmo tempo.
- Esperado: 1 criado (3 ativos). Obtido: 3 criados (5 ativos). Reproduz até no SQLite porque `ensure_can_add_user` conta e depois cria sem trava. Já estava listado como "concorrência conhecida" no CLAUDE.md; agora há teste que prova e que pode virar fix (travar a linha da loja).
- Teste: `test_dois_cadastros_simultaneos_na_ultima_vaga`.

### BUG-P3 (BAIXA): token com assinatura válida e `sub` não numérico dá 500
- `sub` = `abc`, `1.5`, vazio ou número gigante: 500 ("Erro ao buscar usuário") em vez de 401. Só explorável por quem tem a chave de assinatura ou por defeito de emissão, mas 500 num caminho de autenticação polui o registro de erros.
- Teste: `test_token_com_sub_estranho_nao_pode_dar_500`.

### BUG-P4 (BAIXA/MÉDIA, a decidir): loja desativada ou assinatura vencida continua usando toda a API
- `Store.is_active=False` não bloqueia ninguém (o campo só é lido para resolver loja por slug/domínio). Se a cobrança prevê suspender loja inadimplente, hoje não há efeito na API.
- Teste: `test_loja_desativada_nao_vende`.

## (c) Melhorias (não são bugs de dinheiro)

1. `GET /returns/eligibility/{id}`, `GET /returns/history/{id}` e `GET /receivables/{id}/payments` respondem 200 "vazio" para id de outra loja ou inexistente, em vez de 404. Não vaza dado (confirmado com devolução e pagamento reais em A), mas é inconsistente com o resto da API.
2. `POST /pdv/orders/{id}/cancel` de outra loja devolve 200 "Pagamento cancelado" mesmo sem encostar em nada (o `UPDATE` filtra a loja, mas não confere que alguma linha mudou). Teste prova que a venda de A não muda.
3. Transferências (`POST /finance/transfers`) não recusam valor acima do saldo da conta de origem (leitura do código; só o fechamento do mês exige gaveta não negativa). Não testado para não alterar regra de negócio.
4. Possível corrida entre fechar o mês e lançar/pagar/transferir no mesmo mês: `ensure_open_month` é conferido sem travar a loja, e só o fechamento trava `Store`. Leitura de código, só provável no Postgres.
5. `DELETE /customers/{id}` é de gerente na matriz (o texto do papel diz que apagar registros é do admin). Confirmar se é intencional.
6. A máscara de custo cobre só JSON e chaves em snake_case por palavra inteira; um campo novo `costPrice` (camelCase) ou um PDF/CSV exportado para vendedor passaria. Hoje nenhum caso real (relatórios são de gerente).
7. Trava de usuário no plano: usar `SELECT ... FOR UPDATE` na linha da loja em `POST /team`, `activate` e `register` (resolve BUG-P2).

## (d) O que não deu para cobrir (e o que só o Postgres cobre)

- Não há Postgres de pé (não subi). As travas do app são `pg_advisory_xact_lock` (`stock_lock.py`) e `SELECT ... FOR UPDATE`; no SQLite viram no-op. Por isso 10 dos 17 testes de `test_concorrencia.py` terminam `xfail` "SEM TRAVA NO SQLITE" (devolução dupla, devolução parcial acima do vendido, cancelamento duplo, recebimentos de fiado em excesso, desfazer recebimento duplo, sangria acima do saldo, fechar caixa duas vezes, pagar e desfazer a mesma conta a pagar). Isso é o comportamento esperado sem trava; rodar no Postgres (`TEST_PG_URL`, adaptar a fixture `sessao_por_requisicao`) é o que confirma que as travas funcionam.
- No SQLite as regras de unicidade continuam valendo: abrir o caixa 4x ao mesmo tempo dá 1x 201 e 3x 409, sem 500 (passa). Última peça, pontos gastos em dobro, fechar o mês 3x e despesas+transferências passaram no SQLite.
- Cobertura do Postgres que já existe em `tests/pg/` (não repeti): 8 aberturas de caixa, sangrias simultâneas, recebimentos de fiado, empréstimo, fechamentos simultâneos do mês, resgates de pontos, vendas/devoluções/cancelamentos/trocas simultâneos. Sem teste no Postgres hoje: fechar caixa duas vezes, desfazer recebimento de fiado em dobro, pagar/desfazer/cancelar a mesma conta a pagar, cadastro de usuário na última vaga, venda+sangria juntas.
- Não cobertos: rotas de webhook (MP/Stone/Cielo), PDV real com maquininha/PIX, envio real de WhatsApp, rate limit por IP, RLS no Postgres (`RLS_ENABLED=false`), escopo por usuário dentro da mesma loja (a API não restringe vendedor a ver só as vendas dele; não há regra documentada para isso), tokens de dispositivo de push, upload de imagem, `/admin` (sqladmin).
- Não toquei na loja 2, em produção, no VPS nem em rede externa. Banco usado: `test_audit_pap.db` (apagado), nenhum processo python ficou vivo.
