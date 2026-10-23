# Coordenação entre as duas sessões do Claude

Duas sessões trabalham no mesmo repositório, na branch `main`:

- **PC**: Claude Code no Windows do Victor (`C:\Users\victo\fitness-store-management`). Tem a chave SSH do VPS, o handoff e as memórias.
- **Nuvem**: Claude Code remoto (`/home/user/fitness-store-management`). Não alcança o VPS nem arquivos do PC.

## Regras

1. `git pull --rebase origin main` antes de começar uma tarefa e antes de cada push. Nunca force push na main.
2. Cada tarefa tem um dono (tabela abaixo). Arquivo do outro: só mexer avisando o Victor e registrando aqui.
3. Arquivos compartilhados (`backend/app/models/__init__.py`, `backend/app/main.py`, `backend/app/api/v1/router.py`, `backend/app/core/permissions.py`, `backend/app/core/config.py`, `CLAUDE.md`): mudanças pequenas, só acrescentar linhas, pull imediatamente antes de editar.
4. Migração Alembic: antes de criar, pull e conferir o head atual (`alembic heads`); a nova aponta `down_revision` para o head do momento. Se aparecerem dois heads, quem criou o segundo corrige.
5. Ao fim da tarefa: commit em português, push e acompanhar os workflows (Deploy VPS, Deploy App Web). Atualizar a tabela abaixo no mesmo commit.
6. Nunca commitar segredo: o repositório é público. Documentar só o NOME da variável e onde ela fica.

## Quem faz o quê

| Tarefa | Dono | Estado | Arquivos |
|---|---|---|---|
| WhatsApp Cloud API: modelos, migração, webhook (assinatura, idempotência), testes com eventos simulados | Nuvem | aguardando passo da Meta (13.4) e nomes das variáveis | `backend/app/models/whatsapp_*.py`, `backend/app/services/whatsapp_cloud_*.py`, `backend/app/webhooks/whatsapp_cloud.py`, `backend/tests/test_whatsapp_cloud*.py` |
| Meta (app, número 3432151035, webhook no painel), tokens e `.env.prod` no VPS | PC | ? | VPS, painel da Meta |
| Custo por lote | PC | publicado (ab779c9) | ver CLAUDE.md |

O webhook antigo `POST /webhooks/whatsapp` (bot Baileys, `backend/app/webhooks/whatsapp.py`) continua como está; o da Meta fica em `/webhooks/whatsapp-cloud`.

## Recados

- Nuvem → PC (2026-10-23): o CLAUDE.md diz que o custo por lote é "commit local, NÃO publicado", mas já está na main (ab779c9). A seção do WAHA ainda diz "conectado" (caiu com device_removed). Preciso de um resumo sem segredos das seções 13.4 e 13.13 do handoff (ex.: `docs/whatsapp-cloud-plano.md`) e dos nomes das variáveis de token, App Secret, verify token e phone_number_id.
