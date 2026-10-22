#!/usr/bin/env bash
# Backup diário do Postgres do Provador. Cron sugerido (03:15): 15 3 * * * /opt/provador/backup_pg.sh >> /opt/provador/backup.log 2>&1
# Guarda 14 dias no VPS e, se REMOTE estiver definido (rclone), copia para FORA do VPS (obrigatório em produção).
set -euo pipefail

cd /opt/provador
set -a; . ./.env.prod; set +a

DEST=/opt/provador/backups
mkdir -p "$DEST"
STAMP=$(date +%Y%m%d-%H%M%S)
FILE="$DEST/provador-$STAMP.sql.gz"

docker exec provador-db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner | gzip > "$FILE"

# dump vazio ou truncado = falha (não confiar em backup que não foi verificado)
test "$(stat -c %s "$FILE")" -gt 2000 || { echo "$(date) ERRO: backup suspeito ($FILE)"; exit 1; }
gunzip -t "$FILE"
echo "$(date) OK $FILE $(du -h "$FILE" | cut -f1)"

find "$DEST" -name 'provador-*.sql.gz' -mtime +14 -delete

if [ -n "${REMOTE:-}" ]; then
  rclone copy "$FILE" "$REMOTE" && echo "$(date) copiado para $REMOTE"
  # confere que o arquivo chegou ao destino com o mesmo tamanho (copia nao verificada nao conta)
  LOCAL_SIZE=$(stat -c %s "$FILE")
  REMOTE_SIZE=$(rclone lsjson "$REMOTE" --include "$(basename "$FILE")" 2>/dev/null | grep -o '"Size":[0-9]*' | head -1 | cut -d: -f2)
  [ "$LOCAL_SIZE" = "$REMOTE_SIZE" ] && echo "$(date) verificado no destino ($REMOTE_SIZE bytes)" || { echo "$(date) ERRO: tamanho diferente no destino (local $LOCAL_SIZE, remoto ${REMOTE_SIZE:-nada})"; exit 1; }
  rclone delete "$REMOTE" --min-age 30d --include 'provador-*.sql.gz'   # guarda 30 dias fora do VPS
else
  echo "$(date) AVISO: REMOTE não definido, backup só existe neste VPS"
fi
