"""Script para verificar schema da tabela batches."""
import sqlite3

conn = sqlite3.connect('fitness_store.db')
cursor = conn.cursor()

print("📋 Schema da tabela batches:\n")
cursor.execute("PRAGMA table_info(batches);")
columns = cursor.fetchall()

if not columns:
    print("❌ Tabela 'batches' não existe!")
else:
    print("Colunas:")
    for col in columns:
        print(f"  - {col[1]} ({col[2]})")

conn.close()
