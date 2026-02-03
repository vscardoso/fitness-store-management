"""
Script de referência para configuração de descontos por forma de pagamento.

⚠️  IMPORTANTE: Este script NÃO insere valores no banco de dados.
    Os descontos devem ser configurados pelo ADMIN através da interface mobile.

SUGESTÕES de configuração (não são valores padrão):
- PIX: 8-12% (sem taxa de transação)
- Dinheiro: 10-15% (sem taxa, mas precisa de controle)
- Débito: 3-5% (taxa ~2%)
- Crédito: 0-2% (taxa ~3-5%, não compensar demais)
- Transferência: 5-8% (sem taxa, mas mais lento)

💡 COMO CONFIGURAR:
    1. Acesse o app mobile como ADMIN
    2. Vá em "Mais" → "Descontos de Pagamento"
    3. Crie os descontos conforme a estratégia da sua loja

📖 DOCUMENTAÇÃO DA API:
    GET    /api/v1/payment-discounts/          - Listar descontos
    POST   /api/v1/payment-discounts/          - Criar desconto (ADMIN)
    PUT    /api/v1/payment-discounts/{id}      - Atualizar (ADMIN)
    DELETE /api/v1/payment-discounts/{id}      - Deletar (ADMIN)
    POST   /api/v1/payment-discounts/calculate - Calcular desconto

Uso (apenas para visualizar sugestões):
    python backend/populate_payment_discounts.py
"""


def show_suggestions():
    """Exibe sugestões de configuração de descontos."""
    
    print("\n" + "="*80)
    print("💡 SUGESTÕES DE DESCONTOS POR FORMA DE PAGAMENTO")
    print("="*80 + "\n")
    
    print("⚠️  ATENÇÃO: Estes são apenas valores sugeridos!")
    print("   Configure os descontos através da interface mobile (ADMIN)\n")
    
    suggestions = [
        {
            "method": "PIX",
            "range": "8-12%",
            "reason": "Sem taxa de transação, recebimento imediato",
            "suggested": "10%"
        },
        {
            "method": "Dinheiro",
            "range": "10-15%",
            "reason": "Sem taxa, mas exige controle de caixa",
            "suggested": "12%"
        },
        {
            "method": "Débito",
            "range": "3-5%",
            "reason": "Taxa bancária ~2%, recebimento rápido",
            "suggested": "5%"
        },
        {
            "method": "Crédito",
            "range": "0-2%",
            "reason": "Taxa alta (3-5%), parcelamento possível",
            "suggested": "0% (não dar desconto)"
        },
        {
            "method": "Transferência",
            "range": "5-8%",
            "reason": "Sem taxa, mas confirmação mais lenta",
            "suggested": "7%"
        },
    ]
    
    print("┌─────────────────┬──────────┬──────────────┬───────────────────────────────────────┐")
    print("│ Forma Pagamento │ Sugestão │ Faixa        │ Justificativa                         │")
    print("├─────────────────┼──────────┼──────────────┼───────────────────────────────────────┤")
    
    for s in suggestions:
        print(f"│ {s['method']:<15} │ {s['suggested']:<8} │ {s['range']:<12} │ {s['reason']:<37} │")
    
    print("└─────────────────┴──────────┴──────────────┴───────────────────────────────────────┘\n")
    
    print("📱 COMO CONFIGURAR NO APP:\n")
    print("   1. Abra o app como ADMIN")
    print("   2. Vá em 'Mais' → 'Descontos de Pagamento'")
    print("   3. Toque em 'Novo Desconto'")
    print("   4. Escolha a forma de pagamento")
    print("   5. Digite o percentual e descrição")
    print("   6. Ative/desative conforme necessário\n")
    
    print("💰 ESTRATÉGIA RECOMENDADA:\n")
    print("   • Incentive PIX e dinheiro (sem taxas)")
    print("   • Dê desconto moderado no débito")
    print("   • Evite desconto no crédito (ou muito baixo)")
    print("   • Ajuste conforme sua margem de lucro\n")
    
    print("📊 EXEMPLO DE CÁLCULO:\n")
    print("   Produto: R$ 100,00")
    print("   Pagamento: PIX (10% desconto)")
    print("   Valor final: R$ 90,00")
    print("   Economia para cliente: R$ 10,00")
    print("   Lucro para loja: Sem taxa bancária!\n")
    
    print("="*80 + "\n")


if __name__ == "__main__":
    show_suggestions()
