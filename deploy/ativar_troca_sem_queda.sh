#!/usr/bin/env bash
# Roda UMA vez NO VPS (como root): liga a publicação sem queda. Faz backup do que muda, testa o nginx e desfaz se falhar.
# O que muda: nginx passa a falar com o backend por um "upstream" que o deploy_vps.sh troca de porta (8000 <-> 8001).
# Nada do n8n nem do site wamodafitness.com.br é tocado.
set -euo pipefail
SNIP=/etc/nginx/snippets/provador-proxy.conf
UP=/etc/nginx/conf.d/provador-upstream.conf
REPO=/opt/provador/repo/deploy
STAMP=$(date +%Y%m%d-%H%M%S)

[ -f "$SNIP" ] || { echo "ERRO: $SNIP nao existe"; exit 1; }
cp "$SNIP" "/root/provador-proxy.conf.bak-$STAMP"
[ -f "$UP" ] && cp "$UP" "/root/provador-upstream.conf.bak-$STAMP" || true

cp "$REPO/nginx/provador-upstream.conf" "$UP"
sed -i 's#proxy_pass http://127.0.0.1:[0-9]*;#proxy_pass http://provador_backend;#' "$SNIP"
# keepalive do upstream exige HTTP/1.1 e Connection vazio (o snippet já usa 1.1)
grep -q 'proxy_set_header Connection' "$SNIP" || echo 'proxy_set_header Connection "";' >> "$SNIP"

if nginx -t; then
  nginx -s reload
  curl -fsS https://api.provadorfit.com.br/health >/dev/null && echo "OK: nginx usa o upstream provador_backend (porta 8000)."
  cp "$REPO/docker-compose.alt.yml" /opt/provador/docker-compose.alt.yml
  echo "OK: reserva copiada. A proxima publicacao ja sai sem queda."
else
  echo "ERRO no nginx: desfazendo"
  cp "/root/provador-proxy.conf.bak-$STAMP" "$SNIP"
  [ -f "/root/provador-upstream.conf.bak-$STAMP" ] && cp "/root/provador-upstream.conf.bak-$STAMP" "$UP" || rm -f "$UP"
  nginx -t && nginx -s reload
  exit 1
fi
