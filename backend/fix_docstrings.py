#!/usr/bin/env python3
"""Script para simplificar todas as docstrings."""

import re

with open('app/api/v1/endpoints/stock_entries.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Padrão para docstrings multi-linha (não inline)
# Encontrar """...""" mas NÃO quando estiver tudo na mesma linha
pattern = r'(\s+)"""[\s\S]*?"""'

def simplify_docstring(match):
    indent = match.group(1)
    # Retorna uma docstring simples
    return f'{indent}"""Endpoint documentation."""'

# Substituir todas as docstrings multi-linha por versões simples
# EXCETO a docstring do módulo (primeira do arquivo)
lines = content.split('\n')
result = []
in_module_docstring = False
module_docstring_done = False
in_function_docstring = False
docstring_start_line = -1

for i, line in enumerate(lines):
    # Módulo docstring (primeira do arquivo)
    if i == 0 and line.strip() == '"""':
        in_module_docstring = True
        result.append(line)
        continue
    
    if in_module_docstring:
        result.append(line)
        if '"""' in line and i > 0:
            in_module_docstring = False
            module_docstring_done = True
        continue
    
    # Detectar início de docstring de função (após "def")
    if '"""' in line and not in_function_docstring:
        # Verificar se é inline (abre e fecha na mesma linha)
        if line.count('"""') == 2:
            # Inline, manter como está
            result.append(line)
        else:
            # Multi-linha, iniciar rastreamento
            in_function_docstring = True
            docstring_start_line = i
            # NÃO adicionar esta linha ainda
    elif in_function_docstring:
        # Procurar fechamento
        if '"""' in line:
            # Encontrou fechamento, substituir toda a docstring
            indent = ' ' * (len(lines[docstring_start_line]) - len(lines[docstring_start_line].lstrip()))
            result.append(f'{indent}"""Endpoint documentation."""')
            in_function_docstring = False
        # NÃO adicionar linhas dentro da docstring
    else:
        # Linha normal, adicionar
        result.append(line)

# Escrever resultado
with open('app/api/v1/endpoints/stock_entries.py', 'w', encoding='utf-8') as f:
    f.write('\n'.join(result))

print("✅ Docstrings simplificadas com sucesso!")
