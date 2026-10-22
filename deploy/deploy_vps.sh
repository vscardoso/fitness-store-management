#!/usr/bin/env bash
# Roda NO VPS (chamado pelo GitHub Actions). Atualiza só o backend do Provador.
# Backup antes, build, health check; se falhar, volta ao commit anterior.
# Nunca toca em n8n nem no nginx do wamodafitness.com.br.
set -euo pipefail
cd /opt/provador
DC="docker compose -f docker-compose.prod.yml --env-file .env.prod"

./backup_pg.sh || { echo "ERRO: backup falhou, deploy abortado"; exit 1; }

PREV=$(git -C repo rev-parse HEAD)
git -C repo fetch origin main
git -C repo reset --hard origin/main
NEW=$(git -C repo rev-parse HEAD)
echo "Deploy: $PREV -> $NEW"

health() {
  for i in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then return 0; fi
    sleep 3
  done
  return 1
}

$DC up -d --build backend
if health; then
  echo "OK: backend saudavel em $NEW"
  exit 0
fi

echo "FALHA no health check. Logs:"; $DC logs --tail 80 backend || true
echo "Rollback para $PREV"
git -C repo reset --hard "$PREV"
$DC up -d --build backend
health && echo "Rollback OK" || echo "Rollback tambem falhou: intervencao manual"
exit 1
