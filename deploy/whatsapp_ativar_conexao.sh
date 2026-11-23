#!/usr/bin/env bash
# Liga no VPS a conexão do WhatsApp da loja (Embedded Signup / coexistência): põe as variáveis novas no compose e no .env.prod do servidor
# e reinicia só o backend. Idempotente: pode rodar de novo (ex.: para trocar o ID da configuração).
#
# Uso, no VPS, como root:
#   bash /opt/provador/repo/deploy/whatsapp_ativar_conexao.sh <ID_DA_CONFIGURACAO_DO_EMBEDDED_SIGNUP>
#
# O que faz, nesta ordem (para no primeiro erro, sem deixar nada pela metade):
#   1. confere a guarda de publicação (ninguém gravando na API); com FORCAR=1 ignora
#   2. backup de docker-compose.prod.yml e .env.prod com data
#   3. .env.prod: WHATSAPP_CLOUD_APP_ID (público), WHATSAPP_CLOUD_ES_CONFIG_ID (o argumento) e WHATSAPP_TOKEN_ENCRYPTION_KEY
#      (chave nova, só se ainda não existir: NUNCA trocar depois que uma loja conectou, senão os tokens gravados não abrem)
#   4. docker-compose.prod.yml: lista as variáveis para o container recebê-las (--env-file só preenche os ${...} listados)
#   5. reinicia o backend (cerca de 15 s fora do ar) e confere a saúde e que a configuração chegou
# Não imprime nenhum segredo.
set -euo pipefail

CONFIG_ID="${1:-}"
APP_ID="${WHATSAPP_APP_ID:-2218667769031250}"        # app Provador Fit (ID de app não é segredo)
DIR="${PROVADOR_DIR:-/opt/provador}"
COMPOSE="$DIR/docker-compose.prod.yml"
ENVF="$DIR/.env.prod"

if [[ -z "$CONFIG_ID" || ! "$CONFIG_ID" =~ ^[0-9]{8,25}$ ]]; then
  echo "Informe o ID da configuração do Embedded Signup (só números). Ex.: bash $0 1234567890123456" >&2
  exit 2
fi
cd "$DIR"

if [[ "${FORCAR:-0}" != "1" && -f "$DIR/repo/deploy/guarda_publicacao.py" ]]; then
  set +e
  python3 "$DIR/repo/deploy/guarda_publicacao.py" --status
  rc=$?
  set -e
  if [[ $rc -ne 0 ]]; then
    echo "Tem gente gravando na API agora. Tente de novo em alguns minutos (ou FORCAR=1 para ignorar)." >&2
    exit 10
  fi
fi

stamp="$(date +%Y%m%d-%H%M%S)"
cp -p "$COMPOSE" "$COMPOSE.bak-whatsapp-$stamp"
cp -p "$ENVF" "$ENVF.bak-whatsapp-$stamp"
echo "backups: *.bak-whatsapp-$stamp"

# 3. .env.prod (sem imprimir valores secretos)
set_env() {  # set_env NOME VALOR  (troca se existir, senão acrescenta)
  local k="$1" v="$2"
  if grep -q "^${k}=" "$ENVF"; then
    python3 - "$ENVF" "$k" "$v" <<'PY'
import sys
p, k, v = sys.argv[1:4]
L = open(p, encoding="utf-8").read().split("\n")
L = [f"{k}={v}" if l.startswith(k + "=") else l for l in L]
open(p, "w", encoding="utf-8", newline="\n").write("\n".join(L))
PY
  else
    [[ -n "$(tail -c1 "$ENVF")" ]] && echo >> "$ENVF"
    echo "${k}=${v}" >> "$ENVF"
  fi
}
set_env WHATSAPP_CLOUD_APP_ID "$APP_ID"
set_env WHATSAPP_CLOUD_ES_CONFIG_ID "$CONFIG_ID"
if ! grep -q "^WHATSAPP_TOKEN_ENCRYPTION_KEY=.\+" "$ENVF"; then
  key="$(docker exec provador-backend python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"
  set_env WHATSAPP_TOKEN_ENCRYPTION_KEY "$key"
  echo "chave de criptografia dos tokens criada (guarde uma cópia do .env.prod no gerenciador de senhas)"
fi
chmod 600 "$ENVF"

# 4. compose: variáveis que o container precisa receber
python3 - "$COMPOSE" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
add = [
    "      WHATSAPP_CLOUD_APP_ID: ${WHATSAPP_CLOUD_APP_ID:-}",
    "      WHATSAPP_CLOUD_ES_CONFIG_ID: ${WHATSAPP_CLOUD_ES_CONFIG_ID:-}",
    "      WHATSAPP_TOKEN_ENCRYPTION_KEY: ${WHATSAPP_TOKEN_ENCRYPTION_KEY:-}",
]
lines = s.split("\n")
missing = [a for a in add if a.split(":")[0].strip() + ":" not in s]
if missing:
    i = next((n for n, l in enumerate(lines) if l.strip().startswith("WHATSAPP_CLOUD_API_VERSION:")), None)
    if i is None:
        sys.exit("não achei WHATSAPP_CLOUD_API_VERSION no compose do servidor; ajuste à mão")
    lines[i + 1:i + 1] = missing
    open(p, "w", encoding="utf-8", newline="\n").write("\n".join(lines))
    print("compose: acrescentadas", len(missing), "variáveis")
else:
    print("compose: já tinha as variáveis")
PY

# 5. reinicia só o backend e confere
DC="docker compose -f docker-compose.prod.yml --env-file .env.prod"
$DC config -q
$DC up -d --no-deps backend
for _ in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
[[ "${ok:-0}" == "1" ]] || { echo "O backend não voltou a responder em 80 s. Veja: docker logs --tail 50 provador-backend" >&2; exit 1; }
docker exec -i provador-backend python - <<'PY'
from app.core.config import settings as s
print("APP_ID:", s.WHATSAPP_CLOUD_APP_ID or "VAZIO")
print("ES_CONFIG_ID:", s.WHATSAPP_CLOUD_ES_CONFIG_ID or "VAZIO")
print("chave de criptografia:", "definida" if s.WHATSAPP_TOKEN_ENCRYPTION_KEY else "VAZIA (usa o SECRET_KEY)")
print("segredo do app (assinatura do webhook):", "definido" if s.WHATSAPP_CLOUD_APP_SECRET else "VAZIO")
PY
echo "Pronto. Abra o app: Mais > WhatsApp > Conectar o WhatsApp."
