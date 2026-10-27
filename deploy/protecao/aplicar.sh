#!/bin/bash
# Roda NO VPS, com os arquivos em /tmp/protecao: instala, testa (nginx -t) e recarrega; se falhar, volta tudo como estava.
set -e
D=/tmp/protecao
B=/root/nginx-backup-original   # o ORIGINAL fica guardado na primeira execução; rodar de novo não o sobrescreve
mkdir -p /etc/nginx/snippets
TARGET=$(readlink -f /etc/nginx/sites-enabled/provador-api)
APP=$(readlink -f /etc/nginx/sites-enabled/provador-app)
if [ ! -d $B ]; then
  mkdir -p $B
  cp -a "$TARGET" $B/provador-api
  cp -a "$APP" $B/provador-app
  cp -a /etc/nginx/conf.d $B/conf.d
fi

cp $D/provador-protecao.conf /etc/nginx/conf.d/provador-protecao.conf
cp $D/provador-proxy.conf /etc/nginx/snippets/provador-proxy.conf
cp $D/provador-api.site "$TARGET"
# site do app (arquivos estáticos): limite por IP
if ! grep -q prov_web "$APP"; then
  perl -0pi -e 's/(    server_name app\.provadorfit\.com\.br;\n)/$1    limit_req zone=prov_web burst=150 nodelay;\n    limit_conn prov_conn 60;\n/' "$APP"
fi

if nginx -t; then
  systemctl reload nginx && echo "NGINX RECARREGADO"
else
  echo "nginx -t FALHOU, desfazendo"
  cp $B/provador-api "$TARGET"; cp $B/provador-app "$APP"
  rm -f /etc/nginx/conf.d/provador-protecao.conf /etc/nginx/snippets/provador-proxy.conf
  nginx -t && systemctl reload nginx
  exit 1
fi

cp $D/fail2ban-provador.local /etc/fail2ban/jail.d/provador-nginx.local
cp $D/fail2ban-filter-provador-scan.conf /etc/fail2ban/filter.d/provador-scan.conf
fail2ban-client -t && systemctl reload fail2ban && sleep 2 && fail2ban-client status | tail -2
echo "backup em $B"
