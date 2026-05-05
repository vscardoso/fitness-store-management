#!/usr/bin/env bash
# Restaura um backup do banco de dados Neon/PostgreSQL localmente.
# Uso: ./scripts/restore.sh backup_2026-05-05_03-00.sql.gz

set -euo pipefail

# ── Validações de entrada ──────────────────────────────────────────────────────

if [ $# -ne 1 ]; then
  echo "Uso: $0 <arquivo.sql.gz>"
  echo "Exemplo: $0 backup_2026-05-05_03-00.sql.gz"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Erro: arquivo '$BACKUP_FILE' não encontrado."
  exit 1
fi

if ! gzip --test "$BACKUP_FILE" 2>/dev/null; then
  echo "Erro: arquivo '$BACKUP_FILE' está corrompido ou não é um .gz válido."
  exit 1
fi

# ── Carrega DATABASE_BACKUP_URL ────────────────────────────────────────────────

if [ -z "${DATABASE_BACKUP_URL:-}" ]; then
  # Tenta carregar do .env na raiz do projeto
  ENV_FILE="$(dirname "$0")/../.env"
  if [ -f "$ENV_FILE" ]; then
    # Exporta apenas a variável desejada, ignorando comentários e linhas em branco
    DATABASE_BACKUP_URL=$(grep -E '^DATABASE_BACKUP_URL=' "$ENV_FILE" | head -1 | cut -d'=' -f2-)
  fi
fi

if [ -z "${DATABASE_BACKUP_URL:-}" ]; then
  echo "Erro: variável DATABASE_BACKUP_URL não definida."
  echo ""
  echo "Defina de uma das formas:"
  echo "  1. export DATABASE_BACKUP_URL='postgresql://user:pass@host/db?sslmode=require'"
  echo "  2. Adicione DATABASE_BACKUP_URL=... no arquivo .env na raiz do projeto"
  exit 1
fi

# ── Confirmação ───────────────────────────────────────────────────────────────

SIZE_HUMAN=$(du -sh "$BACKUP_FILE" | cut -f1)

echo ""
echo "======================================================"
echo "  RESTAURAÇÃO DE BANCO DE DADOS"
echo "======================================================"
echo "  Arquivo : $BACKUP_FILE"
echo "  Tamanho : $SIZE_HUMAN"
echo "  Destino : ${DATABASE_BACKUP_URL%%@*}@..."
echo ""
echo "  ATENÇÃO: Esta operação irá SOBRESCREVER os dados"
echo "  existentes no banco de destino."
echo "======================================================"
echo ""

read -r -p "Tem certeza que deseja restaurar? (digite 'sim' para confirmar): " CONFIRM

if [ "$CONFIRM" != "sim" ]; then
  echo "Restauração cancelada."
  exit 0
fi

# ── Restauração ───────────────────────────────────────────────────────────────

echo ""
echo "Iniciando restauração..."

if gunzip -c "$BACKUP_FILE" | psql --no-password "$DATABASE_BACKUP_URL"; then
  echo ""
  echo "======================================================"
  echo "  Restauração concluída com sucesso!"
  echo "======================================================"
else
  echo ""
  echo "======================================================"
  echo "  ERRO: Falha na restauração."
  echo "  Verifique as mensagens acima para detalhes."
  echo "======================================================"
  exit 1
fi
