# 🔄 Migrations Automatizadas

## Scripts Disponíveis

### ✅ migrate.py (RECOMENDADO)
```bash
python migrate.py "mensagem da migration"
```
**Faz tudo automaticamente**: gera migration + aplica

**Exemplo:**
```bash
python migrate.py "add email to customer"
```

### 🔄 reset_db.py
```bash
python reset_db.py
```
**Reset completo:**
- Faz backup do banco atual
- Deleta banco
- Recria todas as tabelas
- Cria usuário admin (admin@fitness.com / admin123)

## ❌ NÃO use alembic diretamente
Esses comandos causam erros:
```bash
alembic revision --autogenerate -m "..."  # ❌ NÃO
alembic upgrade head                      # ❌ NÃO
```

Use `migrate.py` sempre!

## 🆘 Troubleshooting

### Migration deu erro?
```bash
python reset_db.py  # Reset completo
```

### Precisa ver revisão atual?
```bash
alembic current
```
