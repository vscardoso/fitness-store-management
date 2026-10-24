"""Preço de tabela por item da entrada (entry_items.list_unit_cost): coluna nova, nula, aditiva."""
from alembic import op
import sqlalchemy as sa

revision = "20261029_item_list_price"
down_revision = "20261028_entry_sup_discounts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("entry_items", sa.Column("list_unit_cost", sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("entry_items", "list_unit_cost")
