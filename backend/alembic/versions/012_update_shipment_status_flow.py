"""update shipment status flow

Revision ID: 012
Revises: 011
Create Date: 2025-12-10

Mudança de fluxo de status dos envios condicionais:
- PARTIAL_RETURN → COMPLETED_PARTIAL_SALE
- COMPLETED → COMPLETED_FULL_SALE
- Adiciona: RETURNED_NO_SALE (novo)
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '012'
down_revision = '011'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Alterar tamanho da coluna status (de 20 para 30 caracteres)
    with op.batch_alter_table('conditional_shipments') as batch_op:
        batch_op.alter_column('status',
                             type_=sa.String(30),
                             existing_type=sa.String(20),
                             nullable=False)

    # 2. Migrar dados existentes para novos status
    connection = op.get_bind()

    # COMPLETED → COMPLETED_FULL_SALE
    connection.execute(
        sa.text("""
            UPDATE conditional_shipments
            SET status = 'COMPLETED_FULL_SALE'
            WHERE status = 'COMPLETED'
        """)
    )

    # PARTIAL_RETURN → COMPLETED_PARTIAL_SALE
    connection.execute(
        sa.text("""
            UPDATE conditional_shipments
            SET status = 'COMPLETED_PARTIAL_SALE'
            WHERE status = 'PARTIAL_RETURN'
        """)
    )

    # CANCELLED e OVERDUE mantêm (se existirem)
    # Não fazemos nada com eles - serão tratados como status legados


def downgrade():
    # 1. Reverter dados para status antigos
    connection = op.get_bind()

    # COMPLETED_FULL_SALE → COMPLETED
    connection.execute(
        sa.text("""
            UPDATE conditional_shipments
            SET status = 'COMPLETED'
            WHERE status = 'COMPLETED_FULL_SALE'
        """)
    )

    # COMPLETED_PARTIAL_SALE → PARTIAL_RETURN
    connection.execute(
        sa.text("""
            UPDATE conditional_shipments
            SET status = 'PARTIAL_RETURN'
            WHERE status = 'COMPLETED_PARTIAL_SALE'
        """)
    )

    # RETURNED_NO_SALE → SENT (não tem equivalente perfeito)
    connection.execute(
        sa.text("""
            UPDATE conditional_shipments
            SET status = 'SENT'
            WHERE status = 'RETURNED_NO_SALE'
        """)
    )

    # 2. Reverter tamanho da coluna
    with op.batch_alter_table('conditional_shipments') as batch_op:
        batch_op.alter_column('status',
                             type_=sa.String(20),
                             existing_type=sa.String(30),
                             nullable=False)
