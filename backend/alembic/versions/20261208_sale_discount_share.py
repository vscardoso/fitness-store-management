"""Parte do desconto geral por peça (sale_items.sale_discount_share): mesmo lucro em todas as peças.

Regra do Victor (23/11/2026): o desconto geral da venda é dividido para todas as peças ficarem com o mesmo lucro em %
(nenhuma abaixo do custo quando a venda inteira está acima). Vendas novas gravam a parte de cada linha; aqui as vendas
já feitas COM desconto geral e SEM nenhuma devolução ganham a mesma divisão (as com devolução ficam como estavam, pela
divisão por valor, para o que já foi estornado continuar batendo).

Revision ID: 20261208_sale_discount_share
Revises: 20261207_return_is_correction
"""
import importlib.util
import os
from decimal import Decimal

import sqlalchemy as sa
from alembic import op

revision = "20261208_sale_discount_share"
down_revision = "20261207_return_is_correction"
branch_labels = None
depends_on = None


def _allocate():
    path = os.path.join(os.path.dirname(__file__), "..", "..", "app", "services", "price_floor.py")
    spec = importlib.util.spec_from_file_location("_price_floor_mig", os.path.abspath(path))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.allocate_same_margin


def upgrade() -> None:
    op.add_column("sale_items", sa.Column("sale_discount_share", sa.Numeric(10, 2), nullable=True))
    allocate = _allocate()
    conn = op.get_bind()
    sales = conn.execute(sa.text(
        "SELECT s.id, s.discount_amount FROM sales s WHERE s.discount_amount > 0 "
        "AND NOT EXISTS (SELECT 1 FROM sale_returns r WHERE r.sale_id = s.id)"
    )).fetchall()
    for sale_id, disc in sales:
        items = conn.execute(sa.text(
            "SELECT id, subtotal, unit_cost, quantity FROM sale_items WHERE sale_id = :s AND is_active = true ORDER BY id"
        ), {"s": sale_id}).fetchall()
        if not items:
            continue
        nets = [Decimal(str(i.subtotal or 0)) for i in items]
        costs = [Decimal(str(i.unit_cost or 0)) * int(i.quantity or 0) for i in items]
        for it, share in zip(items, allocate(nets, costs, Decimal(str(disc)))):
            conn.execute(sa.text("UPDATE sale_items SET sale_discount_share = :v WHERE id = :i"), {"v": share, "i": it.id})


def downgrade() -> None:
    op.drop_column("sale_items", "sale_discount_share")
