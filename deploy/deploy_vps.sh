#!/usr/bin/env bash
# Roda NO VPS (chamado pelo GitHub Actions). Atualiza só o backend do Provador.
# Backup antes, build, health check; se falhar, volta ao commit anterior.
# Nunca toca em n8n nem no nginx do wamodafitness.com.br.
set -euo pipefail
cd "${PROVADOR_DIR:-/opt/provador}"   # PROVADOR_DIR e NGINX_UPSTREAM so mudam em teste local
DC="docker compose -f docker-compose.prod.yml --env-file .env.prod"

./backup_pg.sh || { echo "ERRO: backup falhou, deploy abortado"; exit 1; }

PREV=$(git -C repo rev-parse HEAD)
git -C repo fetch origin main
git -C repo reset --hard origin/main
NEW=$(git -C repo rev-parse HEAD)
echo "Deploy: $PREV -> $NEW"

health() {  # health [porta]
  local port="${1:-8000}"
  for i in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then return 0; fi
    sleep 3
  done
  return 1
}

# Troca SEM queda (precisa de ativar_troca_sem_queda.sh rodado uma vez no VPS): constroi a imagem, sobe a reserva (8001)
# com o codigo novo, o nginx passa para ela, o principal (8000) e recriado, o nginx volta e a reserva desliga.
# Se algo faltar, cai no jeito antigo (recria o principal, com uns 15 s de queda).
UP="${NGINX_UPSTREAM:-/etc/nginx/conf.d/provador-upstream.conf}"
ALT="$PWD/docker-compose.alt.yml"
swap_to() {  # swap_to PORTA: aponta o nginx e recarrega (conexoes em andamento terminam)
  sed -i "s#server 127.0.0.1:[0-9]*;#server 127.0.0.1:$1;#" "$UP"
  nginx -t && nginx -s reload
}

if [ -f "$UP" ] && [ -f "$ALT" ]; then
  DCA="docker compose -f docker-compose.prod.yml -f docker-compose.alt.yml --env-file .env.prod"
  echo "Troca sem queda"
  $DC build backend
  $DCA up -d --no-deps --force-recreate backend_alt
  if ! health 8001; then
    echo "FALHA: a reserva nao ficou saudavel. O backend atual NAO foi tocado."
    $DCA logs --tail 80 backend_alt || true
    $DCA rm -sf backend_alt || true
    git -C repo reset --hard "$PREV"
    exit 1
  fi
  swap_to 8001
  sleep 2
  docker stop -t 40 provador-backend || true   # termina as requisicoes que ja estavam nele
  $DC up -d --no-build --no-deps --force-recreate backend
  if health 8000; then
    swap_to 8000
    sleep 2
    docker stop -t 40 provador-backend-alt || true
    $DCA rm -f backend_alt >/dev/null 2>&1 || true
    echo "OK: backend saudavel em $NEW (sem queda)"
    exit 0
  fi
  echo "FALHA: o principal nao subiu. O trafego continua na reserva (8001, codigo novo). Intervencao necessaria."
  $DC logs --tail 80 backend || true
  exit 1
fi

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
