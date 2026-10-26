"""Mensagens de erro em português claro para quem usa o app (nunca SQL, nome de tabela ou rastreio).

O texto original continua indo para o registro de erros (error_logs); só o que volta na resposta é trocado.
"""
import re
from typing import Optional

# Pedaços que só aparecem em erro técnico (banco, driver, rastreio): nunca devem chegar na tela da lojista
TECH_MARKERS = (
    "sqlalchemy", "[sql:", "asyncpg", "psycopg", "traceback", "error creating", "background on this error",
    "[parameters:", "dbapi", "violates", "stringdatarighttruncation", "invalid input syntax", "pydantic",
    "internal server error", "errno", "greenlet", "nonetype", "keyerror", "attributeerror", "typeerror",
)

GENERIC = "Não conseguimos concluir agora. Tente de novo; se continuar, avise o suporte."


def is_technical(text: Optional[str]) -> bool:
    t = (text or "").lower()
    return any(m in t for m in TECH_MARKERS)


def friendly_from_text(text: Optional[str]) -> str:
    """Traduz o texto de um erro técnico para algo que a pessoa entende e sabe resolver."""
    t = (text or "").lower()
    if "value too long" in t or "stringdatarighttruncation" in t:
        m = re.search(r"character varying\((\d+)\)", t)
        limit = f" (o limite é {m.group(1)} letras)" if m else ""
        return f"Algum texto está maior do que o campo aceita{limit}. Encurte o nome, a marca, o material ou a descrição e tente de novo."
    if "duplicate key" in t or "uniqueviolation" in t or "unique constraint" in t or "already exists" in t:
        return "Já existe um cadastro igual a este (mesmo código, nome ou SKU). Confira e tente de novo."
    if "foreign key" in t or "foreignkeyviolation" in t:
        return "Este item está ligado a outros dados e não pode ser mexido desta forma."
    if "null value in column" in t or "not-null" in t or "notnullviolation" in t:
        return "Falta preencher um campo obrigatório. Confira o formulário e tente de novo."
    if "numeric field overflow" in t or "out of range" in t:
        return "Algum valor numérico está grande demais. Confira preços e quantidades."
    if any(k in t for k in ("deadlock", "could not serialize", "timeout", "timed out", "connection", "too many clients", "pool")):
        return "O sistema está ocupado agora. Aguarde alguns segundos e tente de novo."
    return GENERIC


FIELD_LABELS = {
    "name": "Nome", "product_name": "Nome do produto", "brand": "Marca", "product_brand": "Marca", "material": "Material",
    "product_material": "Material", "description": "Descrição", "product_description": "Descrição", "color": "Cor",
    "product_color": "Cor", "size": "Tamanho", "product_size": "Tamanho", "gender": "Gênero", "product_gender": "Gênero",
    "price": "Preço de venda", "product_price": "Preço de venda", "base_price": "Preço de venda", "cost_price": "Custo",
    "unit_cost": "Custo da peça", "quantity": "Quantidade", "quantity_received": "Quantidade", "email": "E-mail",
    "password": "Senha", "phone": "Telefone", "cnpj": "CNPJ/CPF", "cpf": "CPF", "sku": "Código (SKU)",
    "barcode": "Código de barras", "category_id": "Categoria", "product_category_id": "Categoria",
    "supplier_name": "Fornecedor", "supplier_id": "Fornecedor", "entry_code": "Código da entrada", "notes": "Observação",
    "full_name": "Nome completo", "store_name": "Nome da loja", "customer_id": "Cliente", "payment_method": "Forma de pagamento",
}


def field_label(field: str) -> str:
    return FIELD_LABELS.get(field, field.replace("_", " ").capitalize())
