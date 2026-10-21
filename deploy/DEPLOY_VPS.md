# Deploy do Provador no VPS (Hetzner 204.168.144.151)

Pré-requisitos: registro **A** `api` → `204.168.144.151` no DNS do Registro.br (propagado), acesso SSH, Docker e Compose (já instalados).
Regra: não mexer no n8n (porta 5678) nem no nginx do site `wamodafitness.com.br`; só adicionar um site novo.

## 0. Antes de tudo (aprovação do Victor)
- Liberar disco (hoje 85% usado, 5,5 GB livres): `journalctl --vacuum-size=200M`, `npm cache clean --force`, `rm -rf /root/.cache/pip /root/.cache/uv` (só caches e logs regeneráveis, ~11 GB).
- Firewall: `ufw allow 22,80,443/tcp`, liberar 5678 só se o n8n for acessado de fora, `ufw enable`. Abrir uma 2ª sessão SSH para testar ANTES de fechar a primeira. Fechar a 631 (cups): `systemctl disable --now cups cups-browsed`.

## 1. Código e variáveis
```bash
mkdir -p /opt/provador && cd /opt/provador
git clone https://github.com/vscardoso/fitness-store-management.git repo
cp repo/deploy/docker-compose.prod.yml repo/deploy/backup_pg.sh .
cp repo/deploy/.env.prod.example .env.prod && chmod 600 .env.prod
# editar .env.prod: senha do Postgres, SECRET_KEY (openssl rand -hex 32), CORS_ORIGINS
sed -i 's|build: ../backend|build: ./repo/backend|' docker-compose.prod.yml
chmod +x backup_pg.sh
```

## 2. Subir
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml logs -f backend   # esperar "Application startup complete"
curl -s http://127.0.0.1:8000/health
```
Banco novo e vazio: `scripts/db_init.py`/`entrypoint.sh` cria o schema e marca o alembic como head.

## 3. HTTPS com o nginx existente
```bash
cp repo/deploy/nginx-api.conf /etc/nginx/sites-available/provador-api
ln -s /etc/nginx/sites-available/provador-api /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d api.provadorfit.com.br
curl -s https://api.provadorfit.com.br/health
```

## 4. Backup (obrigatório antes de usar de verdade)
- Configurar `rclone` para um destino FORA do VPS (Storage Box, Backblaze, Drive) e exportar `REMOTE=nome:pasta` no ambiente do cron.
- `crontab -e`: `15 3 * * * /opt/provador/backup_pg.sh >> /opt/provador/backup.log 2>&1`
- Rodar uma vez na mão e TESTAR restaurar num banco temporário: `gunzip -c arquivo.sql.gz | docker exec -i provador-db psql -U provador -d postgres -c 'create database teste_restore'` e depois restaurar nele. Backup que nunca foi restaurado não conta.

## 5. Teste de ponta a ponta (contra a API do servidor)
Cadastro da loja, login, produto com entrada, venda em dinheiro, alerta de estoque. Os scripts `backend/scripts/qa_*.py` apontam para `http://127.0.0.1:8766`: ajustar a base (`B`) e rodar contra o servidor com uma conta de teste, depois apagar a conta.

## 6. Atualizar depois
`cd /opt/provador/repo && git pull && cd .. && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build` (as migrações rodam no start). Fazer backup antes.
