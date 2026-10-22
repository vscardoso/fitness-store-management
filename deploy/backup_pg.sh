#!/usr/bin/env bash
# Backup diário do Postgres do Provador, CRIPTOGRAFADO com age (chave pública SSH em /opt/provador/backup_recipient.pub).
# A chave privada fica só no PC do Victor (~/.ssh/provador_backup); sem ela o backup não abre, nem no VPS nem no Drive.
# Cron sugerido (03:15): 15 3 * * * /opt/provador/backup_pg.sh >> /opt/provador/backup.log 2>&1
# Guarda 14 dias no VPS e, se REMOTE estiver definido (rclone), copia para FORA do VPS (obrigatório em produção).
set -euo pipefail

cd /opt/provador
set -a; . ./.env.prod; set +a

RECIPIENT=/opt/provador/backup_recipient.pub
test -s "$RECIPIENT" || { echo "$(date) ERRO: chave publica de backup ausente ($RECIPIENT), backup NAO feito"; exit 1; }

DEST=/opt/provador/backups
mkdir -p "$DEST"
STAMP=$(date +%Y%m%d-%H%M%S)
FILE="$DEST/provador-$STAMP.sql.gz.age"

docker exec provador-db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner | gzip | age -R "$RECIPIENT" > "$FILE"

# vazio ou truncado = falha. Sem a chave privada aqui não dá para abrir; confere tamanho e cabeçalho do age.
test "$(stat -c %s "$FILE")" -gt 2000 || { echo "$(date) ERRO: backup suspeito ($FILE)"; exit 1; }
head -c 22 "$FILE" | grep -q "age-encryption.org" || { echo "$(date) ERRO: arquivo nao esta criptografado ($FILE)"; exit 1; }
echo "$(date) OK $FILE $(du -h "$FILE" | cut -f1) (criptografado)"

find "$DEST" -name 'provador-*.sql.gz.age' -mtime +14 -delete

if [ -n "${REMOTE:-}" ]; then
  rclone copy "$FILE" "$REMOTE" && echo "$(date) copiado para $REMOTE"
  # confere que o arquivo chegou ao destino com o mesmo tamanho (copia nao verificada nao conta)
  LOCAL_SIZE=$(stat -c %s "$FILE")
  REMOTE_SIZE=$(rclone lsjson "$REMOTE" --include "$(basename "$FILE")" 2>/dev/null | grep -o '"Size":[0-9]*' | head -1 | cut -d: -f2)
  [ "$LOCAL_SIZE" = "$REMOTE_SIZE" ] && echo "$(date) verificado no destino ($REMOTE_SIZE bytes)" || { echo "$(date) ERRO: tamanho diferente no destino (local $LOCAL_SIZE, remoto ${REMOTE_SIZE:-nada})"; exit 1; }
  rclone delete "$REMOTE" --min-age 30d --include 'provador-*.sql.gz.age'   # guarda 30 dias fora do VPS
else
  echo "$(date) AVISO: REMOTE não definido, backup só existe neste VPS"
fi
