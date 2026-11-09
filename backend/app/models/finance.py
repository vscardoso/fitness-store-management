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
    # Repasse lançado pelo sistema (não por uma pessoa) e o dia esperado do cartão que ele quitou
    is_auto: Mapped[bool] = mapped_column(default=False, server_default="false", nullable=False)
    card_day: Mapped[Optional[date]] = mapped_column(Date, nullable=True)


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
    # Despesas e contas a pagar são uma coisa só: ao pagar, a despesa da loja vira uma Expense (entra no resultado do mês);
    # compra de mercadoria e dívida de antes da implantação só tiram o dinheiro da conta.
    counts_as_expense: Mapped[bool] = mapped_column(nullable=False, default=False, server_default=text("false"),
                                                    comment="ao pagar, entra no resultado do mês como despesa")
    expense_category_id: Mapped[Optional[int]] = mapped_column(ForeignKey("expense_categories.id"), nullable=True)


# ── Fase 2: dinheiro que entra ou sai da conta sem ser venda nem despesa ─────────────────────────────────────────────
# Mexe no saldo da conta e aparece no Fechamento do mês, mas NÃO entra no Resultado do mês (não é gasto da loja).
ENTRY_OUT_KINDS = {
    "owner_withdrawal": "Retirada de sócio",
    "loan_given": "Empréstimo dado",
    "loan_paid": "Pagamento de empréstimo que a loja pegou",
    "card_bill": "Fatura do cartão da loja",
    "other_out": "Outra saída",
}
ENTRY_IN_KINDS = {
    "owner_contribution": "Dinheiro posto pelo sócio",
    "loan_repaid": "Empréstimo recebido de volta",
    "loan_taken": "Empréstimo que a loja pegou",
    "other_in": "Outra entrada",
}
# ajuste gravado ao fechar o mês: o saldo contado passa a ser o saldo da conta (quebra de caixa). Sinal no valor.
ENTRY_CLOSING_ADJUSTMENT = "closing_adjustment"
ENTRY_KIND_LABELS = {**ENTRY_OUT_KINDS, **ENTRY_IN_KINDS, ENTRY_CLOSING_ADJUSTMENT: "Ajuste do fechamento (quebra)"}


class AccountEntry(BaseModel):
    """Saída ou entrada que não é despesa nem venda: retirada de sócio, empréstimo, fatura do cartão, ajuste do fechamento.

    `amount` é sempre positivo, a direção vem do tipo; só o ajuste do fechamento tem sinal (positivo = sobrou dinheiro).
    """
    __tablename__ = "account_entries"

    account_id: Mapped[int] = mapped_column(ForeignKey("financial_accounts.id"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(24), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False)
    person: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, comment="sócia, quem pegou/emprestou")
    description: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_by_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    closing_id: Mapped[Optional[int]] = mapped_column(ForeignKey("month_closings.id"), nullable=True, index=True)


class MonthClosing(BaseModel):
    """Fotografia do Fechamento do mês: o que deveria ter, o que tinha e a diferença. Não muda depois de fechado."""
    __tablename__ = "month_closings"
    __table_args__ = (
        Index("uq_month_closing", "tenant_id", "year", "month", unique=True,
              postgresql_where=text("is_active = true"), sqlite_where=text("is_active = 1")),
    )

    year: Mapped[int] = mapped_column(nullable=False)
    month: Mapped[int] = mapped_column(nullable=False)
    expected_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    counted_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    difference: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    snapshot: Mapped[str] = mapped_column(Text, nullable=False, comment="JSON com a tela inteira no momento do fechamento")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    closed_by_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    closed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
