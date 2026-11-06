"""
Fiado (contas a receber de clientes): cada parcela de uma venda no fiado, ou um saldo antigo lançado na implantação.

- A venda no fiado conta na receita no dia da venda (como hoje). O DINHEIRO só entra numa conta quando a parcela é
  recebida (`receivable_payments`): dinheiro → gaveta (e no caixa aberto), PIX/transferência → banco do PIX,
  cartão → maquininha a receber (mesma regra das vendas, ver `finance.py`).
- Devolução de venda no fiado abate primeiro o que a cliente ainda deve (`sale_returns.receivable_abated`); só o que
  passar volta como dinheiro.
"""
from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import Date, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import BaseModel

RECEIVABLE_OPEN = "open"          # nada recebido
RECEIVABLE_PARTIAL = "partial"    # recebido uma parte
RECEIVABLE_PAID = "paid"
RECEIVABLE_CANCELED = "canceled"  # venda cancelada, devolução que abateu tudo ou lançamento desfeito

ORIGIN_SALE = "sale"
ORIGIN_OPENING = "opening"        # fiado que já existia quando a loja começou a usar o app

# formas aceitas ao receber uma parcela (a mesma conta de destino das vendas)
RECEIVE_METHODS = ("cash", "pix", "bank_transfer", "debit_card", "credit_card")


class Receivable(BaseModel):
    __tablename__ = "receivables"
    __table_args__ = (
        Index("ix_receivables_tenant_status_due", "tenant_id", "status", "due_date"),
    )

    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), nullable=False, index=True)
    sale_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sales.id"), nullable=True, index=True)
    origin: Mapped[str] = mapped_column(String(10), nullable=False, default=ORIGIN_SALE, server_default=ORIGIN_SALE)
    installment_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    installments_total: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    received_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    # abatido por devolução (não é dinheiro recebido): a parcela fica menor
    abated_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default=RECEIVABLE_OPEN, server_default=RECEIVABLE_OPEN)
    description: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)


class ReceivablePayment(BaseModel):
    """Um recebimento (pode ser parcial). Desfazer = is_active False."""
    __tablename__ = "receivable_payments"

    receivable_id: Mapped[int] = mapped_column(ForeignKey("receivables.id"), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(20), nullable=False)
    received_on: Mapped[date] = mapped_column(Date, nullable=False)
    created_by_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
