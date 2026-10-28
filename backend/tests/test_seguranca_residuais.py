"""Residuais da reverificacao: IPv4 mapeado em IPv6 na impressora e categoria do corpo nas entradas de estoque."""
import pytest


def test_impressora_rejeita_ipv4_mapeado_em_ipv6():
    from app.core import printer_targets as pt
    for ip in ("::ffff:127.0.0.1", "::ffff:169.254.169.254", "::ffff:8.8.8.8"):
        with pytest.raises(ValueError):
            pt.validate_ip(ip)
    assert pt.validate_ip("::ffff:192.168.0.5")  # LAN mapeada continua valida


@pytest.mark.asyncio
async def test_entrada_de_estoque_recusa_categoria_inexistente_na_loja(db, test_user):
    from app.services.stock_entry_service import StockEntryService
    svc = StockEntryService.__new__(StockEntryService)
    svc.db = db
    with pytest.raises(ValueError, match="Categoria"):
        await svc._assert_category(987654, test_user.tenant_id)
