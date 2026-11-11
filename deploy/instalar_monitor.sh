#!/usr/bin/env bash
# Instala (ou atualiza) o monitor de logs no VPS. Rodar UMA vez, como root:
#     bash /opt/provador/repo/deploy/instalar_monitor.sh victorscardoso@outlook.com
# O argumento são as contas que recebem o aviso no celular (separadas por vírgula). Sem argumento mantém o que já está em
# /opt/provador/monitor.env. Pode rodar de novo à vontade: não duplica a tarefa do cron.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$REPO/deploy/monitor_logs.py"
ENV=/opt/provador/monitor.env
LOG=/var/log/provador-monitor.log
CRON_LINE="* * * * * python3 $SCRIPT >> $LOG 2>&1"

[ "$(id -u)" = 0 ] || { echo "Rode como root."; exit 1; }
command -v python3 >/dev/null || { echo "python3 não encontrado."; exit 1; }
python3 -c "import ast,sys; ast.parse(open('$SCRIPT').read())"

mkdir -p /var/lib/provador-monitor
touch "$LOG"

if [ ! -f "$ENV" ]; then
  : > "$ENV"
fi
chmod 600 "$ENV"
if [ "${1:-}" != "" ]; then
  grep -v '^ALERT_PUSH_EMAILS=' "$ENV" > "$ENV.tmp" || true
  echo "ALERT_PUSH_EMAILS=$1" >> "$ENV.tmp"
  mv "$ENV.tmp" "$ENV"
  chmod 600 "$ENV"
fi
echo "Canais configurados em $ENV (só os nomes):"
sed 's/=.*/=<definido>/' "$ENV" | sort || true

# giro do log do monitor (não deixa crescer sem fim)
cat > /etc/logrotate.d/provador-monitor <<ROT
$LOG {
    weekly
    rotate 4
    compress
    missingok
    notifempty
}
ROT

# tarefa do cron: uma por minuto (troca a linha antiga, se existir)
( crontab -l 2>/dev/null | grep -v 'monitor_logs.py' || true; echo "$CRON_LINE" ) | crontab -
echo "Tarefa do cron instalada: $CRON_LINE"

echo "Mandando uma mensagem de teste pelos canais configurados..."
python3 "$SCRIPT" --teste
echo "Pronto. Acompanhe com: tail -f $LOG"
