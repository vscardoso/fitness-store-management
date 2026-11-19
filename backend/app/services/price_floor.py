"""Piso de preço: uma peça nunca sai por menos do que custou.

Regra do Victor (18/11/2026): o sistema não aceita venda abaixo do custo, e 100% de desconto é brinde (fluxo próprio).
Vale para a venda do balcão e para a peça nova de uma troca. O custo é o das camadas de estoque (FIFO) que a venda de fato
consumiu, então só dá para conferir DEPOIS que o estoque foi separado (a transação inteira desfaz se a venda for recusada).

Tudo em centavos. O desconto da venda inteira (manual + desconto da forma de pagamento) é rateado entre as linhas pelo valor
de cada uma, porque é o preço que a cliente de fato paga por cada peça que conta. A mensagem não diz quanto a peça custou:
vendedor e caixa não podem ver custo.
"""
from decimal import Decimal, ROUND_HALF_UP

CENT = Decimal("0.01")


def cents(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(CENT, ROUND_HALF_UP)


def allocate_header_discount(nets: list[Decimal], header_discount: Decimal) -> list[Decimal]:
    """Reparte o desconto da venda inteira entre as linhas, proporcional ao valor de cada uma.
    A última linha fica com o que sobrou, então a soma dos pedaços é exatamente o desconto."""
    n = len(nets)
    header = cents(header_discount)
    total = sum((cents(x) for x in nets), Decimal("0"))
    if n == 0 or header <= 0 or total <= 0:
        return [Decimal("0")] * n
    shares: list[Decimal] = []
    acc = Decimal("0")
    for i, net in enumerate(nets):
        share = (header - acc) if i == n - 1 else (header * cents(net) / total).quantize(CENT, ROUND_HALF_UP)
        shares.append(share)
        acc += share
    return shares


def is_below_cost(line_net, line_cost) -> bool:
    """Linha vendida por menos do que custou (valor da linha toda já com todos os descontos, contra o custo das peças)."""
    return cents(line_net) < cents(line_cost)


def below_cost_message(name: str, quantity: int, line_net, *, has_discount: bool) -> str:
    from app.services.sale_receipt_service import brl
    price = brl(cents(line_net))
    if quantity > 1:
        quando = f"{name} ({quantity} peças) sairia por {brl(cents(line_net))} no total, abaixo do que as peças custaram."
    else:
        quando = f"{name} sairia por {price}, abaixo do que a peça custou."
    tail = "Diminua o desconto." if has_discount else "Confira o preço de venda no cadastro do produto."
    return f"{quando} O sistema não vende abaixo do custo. {tail}"
