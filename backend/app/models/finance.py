"""
Financeiro da loja: contas de dinheiro (gaveta, bancos, maquininha a receber), transferências e contas a pagar.

Implantação de uma loja que já funciona: o dono informa a data de corte (`stores.finance_start_date`) e o saldo de
cada conta nesse dia, e lança as contas a pagar que já existem. A partir daí o saldo é calculado NA HORA, igual ao
caixa (nada das vendas é copiado):

    saldo = saldo de partida
          + vendas pagas pela forma que cai nesta conta, desde o corte
          - devoluções e trocas pagas por essa forma
          + suprimentos - sangrias do caixa (só a gaveta)
          + transferências que chegaram - transferências que saíram
          - contas a pagar pagas por esta conta - despesas pagas por esta conta

Para onde vai cada forma de pagamento: dinheiro → gaveta; PIX e transferência → o banco marcado "recebe PIX";
débito, crédito e parcelado → maquininha a receber (até o repasse, que é uma transferência para o banco).
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Index, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from .base import BaseModel

KIND_CASH = "cash"    # gaveta (uma por loja)
KIND_BANK = "bank"    # conta no banco (várias)
KIND_CARD = "card"    # maquininha: cartão vendido que ainda não caiu no banco (uma por loja)
ACCOUNT_KINDS = (KIND_CASH, KIND_BANK, KIND_CARD)

PAYABLE_OPEN = "open"
PAYABLE_PAID = "paid"
PAYABLE_CANCELED = "canceled"


class FinancialAccount(BaseModel):
    __tablename__ = "financial_accounts"
    __table_args__ = (
        # uma gaveta e uma maquininha por loja; um banco que recebe o PIX
        Index("uq_fin_account_one_cash", "tenant_id", unique=True,
              postgresql_where=text("kind = 'cash' AND is_active = true"), sqlite_where=text("kind = 'cash' AND is_active = 1")),
        Index("uq_fin_account_one_card", "tenant_id", unique=True,
              postgresql_where=text("kind = 'card' AND is_active = true"), sqlite_where=text("kind = 'card' AND is_active = 1")),
        Index("uq_fin_account_one_pix", "tenant_id", unique=True,
              postgresql_where=text("receives_pix = true AND is_active = true"),
              sqlite_where=text("receives_pix = 1 AND is_active = 1")),
    )

    name: Mapped[str] = mapped_column(String(60), nullable=False)
    kind: Mapped[str] = mapped_column(String(10), nullable=False, comment="cash | bank | card")
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0, server_default="0",
                                                     comment="saldo no dia do corte (implantação)")
    receives_pix: Mapped[bool] = mapped_column(nullable=False, default=False, server_default=text("false"),
                                               comment="banco onde caem PIX e transferências das vendas")


class AccountTransfer(BaseModel):
    """Dinheiro que passou de uma conta para outra (depósito da gaveta, repasse da maquininha) ou ajuste manual."""
    __tablename__ = "account_transfers"

    from_account_id: Mapped[Optional[int]] = mapped_column(ForeignKey("financial_accounts.id"), nullable=True)
    to_account_id: Mapped[Optional[int]] = mapped_column(ForeignKey("financial_accounts.id"), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_by_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)


class Payable(BaseModel):
    """Conta a pagar: fornecedor, boleto, aluguel. Ao pagar, sai da conta escolhida."""
    __tablename__ = "payables"

    description: Mapped[str] = mapped_column(String(200), nullable=False)
    supplier_id: Mapped[Optional[int]] = mapped_column(ForeignKey("suppliers.id"), nullable=True)
    supplier_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default=PAYABLE_OPEN, server_default=PAYABLE_OPEN)
    paid_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    paid_account_id: Mapped[Optional[int]] = mapped_column(ForeignKey("financial_accounts.id"), nullable=True)
    origin: Mapped[str] = mapped_column(String(12), nullable=False, default="manual", server_default="manual",
                                        comment="implantacao | manual")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
