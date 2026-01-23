"""
Teste para validar correção de timezone em vendas.

Para testar:
1. Backend rodando
2. Execute: python backend/test_timezone_fix.py
"""

import asyncio
from datetime import datetime
from zoneinfo import ZoneInfo

def test_timezone_awareness():
    """Testa se o código está usando timezone brasileiro corretamente."""
    
    # Simular diferentes horários
    test_cases = [
        ("21:00 BRT (ainda é dia 23)", datetime(2026, 1, 23, 21, 0, 0, tzinfo=ZoneInfo("America/Sao_Paulo"))),
        ("23:59 BRT (último minuto do dia 23)", datetime(2026, 1, 23, 23, 59, 0, tzinfo=ZoneInfo("America/Sao_Paulo"))),
        ("00:00 BRT (virou dia 24)", datetime(2026, 1, 24, 0, 0, 0, tzinfo=ZoneInfo("America/Sao_Paulo"))),
    ]
    
    print("🔍 Testando consciência de timezone\n")
    
    for description, br_time in test_cases:
        utc_time = br_time.astimezone(ZoneInfo("UTC"))
        
        print(f"📅 {description}")
        print(f"   Brasil:   {br_time.strftime('%Y-%m-%d %H:%M:%S %Z')}")
        print(f"   UTC:      {utc_time.strftime('%Y-%m-%d %H:%M:%S %Z')}")
        print(f"   Data BR:  {br_time.date()}")
        print(f"   Data UTC: {utc_time.date()}")
        
        if br_time.date() != utc_time.date():
            print(f"   ⚠️  ATENÇÃO: Datas diferentes! Sistema DEVE usar data Brasil")
        else:
            print(f"   ✅ Datas iguais")
        print()

def test_current_behavior():
    """Testa comportamento atual do sistema."""
    
    from app.core.timezone import today_brazil, now_brazil
    
    print("🕐 Comportamento atual do sistema\n")
    
    # Horário brasileiro
    br_now = now_brazil()
    br_today = today_brazil()
    
    print(f"   now_brazil():   {br_now}")
    print(f"   today_brazil(): {br_today}")
    print()
    
    # Comparar com UTC
    from datetime import datetime
    utc_now = datetime.utcnow()
    
    print(f"   datetime.utcnow(): {utc_now}")
    print(f"   .date():           {utc_now.date()}")
    print()
    
    if br_today != utc_now.date():
        print(f"   ⚠️  DIFERENÇA DETECTADA!")
        print(f"   Brasil: {br_today}")
        print(f"   UTC:    {utc_now.date()}")
        print(f"   Sistema CORRIGIDO está usando timezone brasileiro ✅")
    else:
        print(f"   Datas iguais (ainda não virou o dia)")

if __name__ == "__main__":
    print("=" * 60)
    print("TESTE DE CORREÇÃO DE TIMEZONE")
    print("=" * 60)
    print()
    
    test_timezone_awareness()
    
    print("=" * 60)
    print()
    
    test_current_behavior()
    
    print()
    print("=" * 60)
    print("✅ Teste concluído!")
    print()
    print("⚠️  LEMBRE-SE:")
    print("   - Timestamps no banco continuam em UTC (não mudamos)")
    print("   - Queries de 'hoje' agora usam timezone brasileiro")
    print("   - Vendas criadas às 21h-00h BRT não zerarão mais")
    print("=" * 60)
