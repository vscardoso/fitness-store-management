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


def below_cost_message(name: str, quantity: int, line_net, *, has_discount: bool, general_discount=None,
                       piece_discount: bool = False) -> str:
    """Frase da recusa. `general_discount` (desconto da venda inteira, R$) muda a frase quando é ele que leva a peça abaixo do
    custo: a pessoa deu desconto geral, então a mensagem não pode soar como desconto naquela peça."""
    from app.services.sale_receipt_service import brl
    total = brl(cents(line_net))
    general = cents(general_discount) if general_discount else Decimal("0")
    if quantity > 1:
        quando = f"{name} ({quantity} peças) sairia por {total} no total, abaixo do que as peças custaram."
    else:
        quando = f"{name} sairia por {total}, abaixo do que a peça custou."
    if general > 0 and not piece_discount:
        return (f"Com o desconto geral de {brl(general)}, que se divide entre as peças pelo valor de cada uma, "
                f"{quando[0].lower() + quando[1:]} O sistema não vende abaixo do custo. Diminua o desconto geral.")
    if general > 0 and piece_discount:
        tail = "Diminua o desconto desta peça ou o desconto geral."
    elif has_discount:
        tail = "Diminua o desconto."
    else:
        tail = "Confira o preço de venda no cadastro do produto."
    return f"{quando} O sistema não vende abaixo do custo. {tail}"


def below_cost_sale_message(sale_net, general_discount) -> str:
    """Recusa pelo desconto geral: vale a venda inteira, não uma peça (sem dizer o custo)."""
    from app.services.sale_receipt_service import brl
    return (f"Com o desconto geral de {brl(cents(general_discount))}, a venda inteira sairia por {brl(cents(sale_net))}, "
            "abaixo do que as peças custaram. O sistema não vende abaixo do custo. Diminua o desconto geral.")


def allocate_same_margin(nets: list, costs: list, header_discount) -> list[Decimal]:
    """Divide o desconto geral para todas as peças ficarem com o MESMO lucro em % (regra do Victor, 23/11/2026).

    Cada linha termina valendo custo x k (k igual para todas). Linha que já está abaixo desse alvo (margem menor que a da
    venda) fica sem desconto geral e o resto é refeito entre as outras. Se a venda inteira está acima do custo (conferido
    antes), k >= 1 e nenhuma peça sai abaixo do custo. Sem custo conhecido, cai na divisão pelo valor.
    Tudo em centavos; a soma dos pedaços é exatamente o desconto e nenhum pedaço passa do valor da linha.
    """
    n = len(nets)
    H = cents(header_discount)
    nets_c = [cents(x) for x in nets]
    costs_c = [max(Decimal("0"), cents(c)) for c in costs]
    if n == 0 or H <= 0 or sum(nets_c) <= 0:
        return [Decimal("0")] * n
    H = min(H, sum(nets_c))
    active = set(range(n))
    k = Decimal("0")
    while active:
        s_net = sum(nets_c[i] for i in active)
        s_cost = sum(costs_c[i] for i in active)
        if s_cost <= 0:
            break
        k = (s_net - H) / s_cost
        low = {i for i in active if nets_c[i] < costs_c[i] * k}
        if not low:
            break
        active -= low
    if not active or sum(costs_c[i] for i in active) <= 0:
        # sem custo para equilibrar: divide pelo valor entre as linhas que sobraram (ou todas)
        idx = sorted(active) if active else list(range(n))
        sub = allocate_header_discount([nets_c[i] for i in idx], H)
        out = [Decimal("0")] * n
        for i, s in zip(idx, sub):
            out[i] = s
        return out
    raw = {i: (nets_c[i] - costs_c[i] * k) for i in active}
    out = [Decimal("0")] * n
    for i in active:
        out[i] = max(Decimal("0"), min(nets_c[i], raw[i].quantize(CENT, ROUND_HALF_UP)))
    # centavo que sobra ou falta do arredondamento: vai para a linha com mais folga
    diff = H - sum(out)
    order = sorted(active, key=lambda i: nets_c[i] - out[i] if diff > 0 else out[i], reverse=True)
    for i in order:
        if diff == 0:
            break
        room = (nets_c[i] - out[i]) if diff > 0 else out[i]
        step = min(abs(diff), room)
        out[i] += step if diff > 0 else -step
        diff += -step if diff > 0 else step
    return out


def general_discount_share(line_subtotal, stored_share, sale_subtotal, sale_discount) -> Decimal:
    """Parte do desconto geral numa linha: a gravada na venda (mesmo lucro) ou, em venda antiga, pelo valor da linha."""
    if stored_share is not None:
        return cents(stored_share)
    sub, disc = cents(sale_subtotal), cents(sale_discount)
    if sub <= 0 or disc <= 0:
        return Decimal("0")
    return disc * cents(line_subtotal) / sub
