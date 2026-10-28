"""
Conferência de estoque salva: o resultado de uma contagem física feita na loja, com data, quem contou e o que
foi encontrado em cada peça.

Os nomes, cores, tamanhos e quantidades do sistema são COPIADOS no momento de salvar (fotografia), para o relatório
continuar igual mesmo que a peça seja renomeada, vendida ou apagada depois. A conferência não altera o estoque.
"""
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import BaseModel


class StockCount(BaseModel):
    __tablename__ = "stock_counts"

    name: Mapped[str | None] = mapped_column(String(120), nullable=True, comment="Nome dado pela loja (ex.: Prateleira 2)")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    category_name: Mapped[str | None] = mapped_column(String(120), nullable=True, comment="Categoria no dia (vazio = todas)")
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(120), nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="finished", server_default="finished", nullable=False,
                                        comment="open = em andamento (pode continuar) | finished = fechada, não muda mais")
    revision: Mapped[int] = mapped_column(Integer, default=1, server_default="1", nullable=False,
                                          comment="Sobe a cada salvamento: impede que dois aparelhos se sobrescrevam sem querer")
    finished_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)

    total_variants: Mapped[int] = mapped_column(Integer, default=0, nullable=False, comment="Variações no escopo no dia")
    counted_variants: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ok_variants: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    diff_variants: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    short_pieces: Mapped[int] = mapped_column(Integer, default=0, nullable=False, comment="Peças que faltam")
    over_pieces: Mapped[int] = mapped_column(Integer, default=0, nullable=False, comment="Peças que sobram")
    system_pieces: Mapped[int] = mapped_column(Integer, default=0, nullable=False, comment="Peças do sistema nas variações contadas")
    counted_pieces: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class StockCountItem(BaseModel):
    __tablename__ = "stock_count_items"

    count_id: Mapped[int] = mapped_column(ForeignKey("stock_counts.id", ondelete="CASCADE"), nullable=False, index=True)
    variant_id: Mapped[int | None] = mapped_column(ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    category_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    color: Mapped[str | None] = mapped_column(String(60), nullable=True)
    size: Mapped[str | None] = mapped_column(String(20), nullable=True)
    sku: Mapped[str | None] = mapped_column(String(100), nullable=True)
    display_code: Mapped[str | None] = mapped_column(String(30), nullable=True)
    system_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    counted_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    difference: Mapped[int] = mapped_column(Integer, nullable=False, comment="contado - sistema (negativo = falta)")
