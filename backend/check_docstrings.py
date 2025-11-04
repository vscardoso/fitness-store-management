#!/usr/bin/env python3
"""Script para verificar docstrings balanceadas."""

with open('app/api/v1/endpoints/stock_entries.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

in_docstring = False
docstring_start = None
count = 0

for i, line in enumerate(lines, 1):
    # Verifica se tem aspas triplas
    if '"""' in line:
        # Conta quantas aspas triplas tem na linha
        num_quotes = line.count('"""')
        
        print(f"Linha {i}: {num_quotes} aspas - {'ABRE' if not in_docstring else 'FECHA'}")
        print(f"  Conteúdo: {line.rstrip()[:100]}")
        
        # Se tem 2 aspas triplas na mesma linha, é uma docstring de uma linha
        if num_quotes == 2:
            print("  -> Docstring inline (abre e fecha)")
        elif num_quotes == 1:
            if not in_docstring:
                in_docstring = True
                docstring_start = i
                print(f"  -> Abrindo docstring")
            else:
                in_docstring = False
                print(f"  -> Fechando docstring (aberta na linha {docstring_start})")
                docstring_start = None
        
        print()
        count += num_quotes

print(f"{'='*60}")
print(f"Total de aspas triplas: {count}")
print(f"Status: {'✅ Balanceado' if count % 2 == 0 else '❌ DESBALANCEADO'}")

if in_docstring:
    print(f"\n⚠️  ERRO: Docstring aberta na linha {docstring_start} não foi fechada!")

