"""Remove a funcionalidade Viagem (etapa 2, PENDENTE: ainda NÃO está em alembic/versions).

Só aplicar DEPOIS que o servidor sem código de viagem estiver no ar (etapa 1) e a guarda de publicação liberar.
Para ativar: copiar este arquivo para alembic/versions/ (o `down_revision` já aponta para o head atual).

Sobe: remove `trip_id` (FK, índice e coluna) de stock_entries e expenses, e apaga a tabela `trips`.
  - Recusa rodar se ainda houver entrada ou despesa ligada a uma viagem (nada de dado de dinheiro se perde em silêncio).
  - Não mexe no tipo de entrada: o valor 'trip' continua existindo como texto (stock_entries.entry_type é VARCHAR) ou
    como rótulo do enum no Postgres, sem nenhuma linha usando.
  - Postgres: DROP COLUMN ... CASCADE leva junto a FK e o índice, qualquer que seja o nome que cada banco deu a eles
    (create_all: stock_entries_trip_id_fkey / expenses_trip_id_fkey; migração 20261023: fk_expenses_trip).
Desce: recria `trips` VAZIA e as colunas `trip_id` (nulas) com FK e índice.

Revision ID: 20261125_remove_trips
Revises: 20261124_sale_idem_key
"""
import sqlalchemy as sa
from alembic import op

revision = "20261125_remove_trips"
down_revision = "20261124_sale_idem_key"
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    return name in sa.inspect(op.get_bind()).get_table_names()


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return table in insp.get_table_names() and column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    # trava de segurança: nada ligado a viagem pode existir
    for table in ("stock_entries", "expenses"):
        if _has_column(table, "trip_id"):
            linked = bind.execute(sa.text(f"SELECT COUNT(*) FROM {table} WHERE trip_id IS NOT NULL")).scalar()
            if linked:
                raise RuntimeError(
                    f"{linked} linha(s) de {table} ainda ligadas a uma viagem: desligue antes de remover a funcionalidade."
                )

    postgres = bind.dialect.name == "postgresql"
    for table in ("stock_entries", "expenses"):
        if not _has_column(table, "trip_id"):
            continue
        if postgres:
            op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS trip_id CASCADE")   # leva FK e índice junto
        else:
            with op.batch_alter_table(table, recreate="auto") as batch_op:
                try:
                    batch_op.drop_index(f"ix_{table}_trip_id")
                except Exception:
                    pass
                batch_op.drop_column("trip_id")

    if _has_table("trips"):
        if postgres:
            op.execute("DROP TABLE IF EXISTS trips CASCADE")
        else:
            op.drop_table("trips")


def downgrade() -> None:
    if not _has_table("trips"):
        op.create_table(
            "trips",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=True),
            sa.Column("trip_code", sa.String(50), nullable=False),
            sa.Column("trip_date", sa.Date(), nullable=False),
            sa.Column("destination", sa.String(255), nullable=False),
            sa.Column("departure_time", sa.DateTime(timezone=True), nullable=True),
            sa.Column("return_time", sa.DateTime(timezone=True), nullable=True),
            sa.Column("travel_cost_fuel", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
            sa.Column("travel_cost_food", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
            sa.Column("travel_cost_toll", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
            sa.Column("travel_cost_hotel", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
            sa.Column("travel_cost_other", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
            sa.Column("travel_cost_total", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
            sa.Column("status", sa.String(20), nullable=False, server_default="planned"),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.UniqueConstraint("tenant_id", "trip_code", name="uq_trips_tenant_code"),
        )
        op.create_index("ix_trips_trip_code", "trips", ["trip_code"])
    postgres = op.get_bind().dialect.name == "postgresql"
    for table, fk_name in (("stock_entries", "fk_stock_entries_trip"), ("expenses", "fk_expenses_trip")):
        if _has_column(table, "trip_id"):
            continue
        if postgres:
            op.add_column(table, sa.Column("trip_id", sa.Integer(), nullable=True))
            op.create_index(f"ix_{table}_trip_id", table, ["trip_id"])
            op.create_foreign_key(fk_name, table, "trips", ["trip_id"], ["id"], ondelete="SET NULL")
        else:
            with op.batch_alter_table(table, recreate="auto") as batch_op:
                batch_op.add_column(sa.Column("trip_id", sa.Integer(), nullable=True))
                batch_op.create_index(f"ix_{table}_trip_id", ["trip_id"])
                batch_op.create_foreign_key(fk_name, "trips", ["trip_id"], ["id"], ondelete="SET NULL")
