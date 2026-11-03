"""Fotos da galeria sem loja: preenche product_media.tenant_id com a loja do produto.

O upload gravava a foto sem tenant_id (o repositório não passava), então a vitrine pública, que filtra a galeria pela
loja, não mostrava essas fotos. Só preenche o que está vazio; idempotente. Downgrade não desfaz (não há como saber
quais estavam vazias e voltar a deixá-las sem loja seria regredir).

Revision ID: 20261113_media_tenant
Revises: 20261112_catalog_feed
"""
from alembic import op

revision = "20261113_media_tenant"
down_revision = "20261112_catalog_feed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE product_media SET tenant_id = (SELECT p.tenant_id FROM products p WHERE p.id = product_media.product_id) "
        "WHERE tenant_id IS NULL"
    )


def downgrade() -> None:
    pass
