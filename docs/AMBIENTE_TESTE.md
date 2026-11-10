# Ambiente de teste (SIT local)

Para ver na tela o que vai para produção ANTES de publicar. Backend e banco descartáveis na máquina, app web servido em
`http://127.0.0.1:8081`. Nada disto toca no servidor de produção. Acesso (e-mail e senha) em
`backend/ambiente_teste_acesso.local.txt` (gerado, ignorado pelo git).

## Um comando (PowerShell, na raiz do projeto)

- `.mbiente-teste.ps1` sobe tudo com o código ATUAL (refaz o app, uns 3 a 5 min; cria a loja de exemplo na primeira vez).
- `.mbiente-teste.ps1 -SemBuild` sobe reaproveitando o app já gerado (rápido).
- `.mbiente-teste.ps1 -Recriar` apaga o banco de teste e refaz a loja de exemplo.
- `.mbiente-teste.ps1 parar` desliga; `.mbiente-teste.ps1 status` mostra o que está no ar.

Depois abra `http://127.0.0.1:8081` (NÃO `:8000`, que é só a API e mostra "Not Found"). Logs em `ambiente-teste-logs/` (ignorado pelo git).
Mudou o código? Rode de novo sem `-SemBuild` (o app precisa ser gerado de novo).

## Passo a passo manual (o que o script faz)

1. Backend de teste (pasta `backend`, banco `ambiente_teste.db` novo):
   `CORS_ORIGINS='["http://127.0.0.1:8081"]' DATABASE_URL=sqlite+aiosqlite:///./ambiente_teste.db ENVIRONMENT=development SECRET_KEY=<32+ caracteres> venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`
2. Loja de exemplo: `python scripts/ambiente_teste.py` (6 entradas, 3 vendas, fila de etiquetas, financeiro com transferência, despesa e retirada).
3. App web (pasta `mobile`): `EXPO_PUBLIC_API_URL=http://127.0.0.1:8000/api/v1 CI=1 node node_modules/expo/bin/cli export --platform web --output-dir dist-teste --clear`
4. Servir: `python -I -X utf8 scripts/spa-server.py dist-teste 8081`.

## SIT hospedado (proposta, ainda não feito)
`sit.provadorfit.com.br` + `sit-api.provadorfit.com.br` no VPS, com Postgres e containers próprios (nunca o banco de produção), nginx e
certbot à parte e deploy por branch `sit`. Exige DNS no Registro.br e comandos de servidor rodados pelo Victor.
