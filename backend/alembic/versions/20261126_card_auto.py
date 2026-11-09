"""Repasse automático da maquininha: interruptor por loja.

Revision ID: 20261126_card_auto
Revises: 20261124_sale_idem_key

Aditiva: três colunas em stores (interruptor desligado por padrão, banco de destino e último dia já lançado, ambos nulos)
e duas em account_transfers (repasse lançado pelo sistema e o dia de cartão que ele quitou).
"""
import sqlalchemy as sa
from alembic import op

revision = "20261126_card_auto"
down_revision = "20261124_sale_idem_key"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("stores") as batch:
        batch.add_column(sa.Column("card_auto_settlement", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("card_auto_account_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("card_auto_through", sa.Date(), nullable=True))
    with op.batch_alter_table("account_transfers") as batch:
        batch.add_column(sa.Column("is_auto", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("card_day", sa.Date(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("account_transfers") as batch:
        batch.drop_column("card_day")
        batch.drop_column("is_auto")
    with op.batch_alter_table("stores") as batch:
        batch.drop_column("card_auto_through")
        batch.drop_column("card_auto_account_id")
        batch.drop_column("card_auto_settlement")
