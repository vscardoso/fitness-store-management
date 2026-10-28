"""
Regressao dos 6 medios da 1a rodada (docs/security-audit/REPORT.md).
"""
import inspect
from types import SimpleNamespace

import pytest

from app.core.config import settings


# 1) webhook legado do WhatsApp: fail-closed + token certo
@pytest.mark.asyncio
async def test_baileys_sem_config_503_token_errado_401_certo_200(test_client, monkeypatch):
    body = {"from_number": "5534999990000", "body": "menu"}
    monkeypatch.setattr(settings, "WHATSAPP_BOT_TOKEN", "")
    monkeypatch.setattr(settings, "WHATSAPP_BOT_TENANT_ID", 0)
    assert (await test_client.post("/webhooks/whatsapp", json=body)).status_code == 503
    monkeypatch.setattr(settings, "WHATSAPP_BOT_TOKEN", "tok-teste")
    monkeypatch.setattr(settings, "WHATSAPP_BOT_TENANT_ID", 1)
    assert (await test_client.post("/webhooks/whatsapp", json=body, headers={"X-Bot-Token": "x"})).status_code == 401
    ok = await test_client.post("/webhooks/whatsapp", json=body, headers={"X-Bot-Token": "tok-teste"})
    assert ok.status_code == 200


def test_baileys_escapa_curingas_do_like():
    from app.webhooks.whatsapp import _escape_like
    assert _escape_like("a%b_c") == "a\%b\_c"


# 2) impressora: destinos validados
def test_impressora_rejeita_destinos_perigosos():
    from app.core import printer_targets as pt
    for ip in ("127.0.0.1", "169.254.169.254", "postgres", "8.8.8.8", "0.0.0.0"):
        with pytest.raises(ValueError):
            pt.validate_ip(ip)
    assert pt.validate_ip("192.168.0.10") == "192.168.0.10"
    with pytest.raises(ValueError):
        pt.validate_port(5432)
    assert pt.validate_port(9100) == 9100
    for dev in ("/app/uploads/x.jpg", "/etc/passwd", "../x"):
        with pytest.raises(ValueError):
            pt.validate_usb(dev)
        with pytest.raises(ValueError):
            pt.validate_serial(dev)
    assert pt.validate_usb("/dev/usb/lp0") and pt.validate_serial("COM3") and pt.validate_serial("/dev/ttyUSB0")


def test_schema_da_impressora_aplica_validadores():
    from pydantic import ValidationError
    from app.schemas.label_printer import LabelPrinterCreate
    with pytest.raises(ValidationError):
        LabelPrinterCreate(name="x", ip_address="127.0.0.1")
    assert LabelPrinterCreate(name="x", ip_address="192.168.1.50").port == 9100


# 3) venda: ids da propria loja
@pytest.mark.asyncio
async def test_venda_recusa_cliente_e_produto_de_fora(db, test_user):
    from app.services.sale_service import SaleService
    svc = SaleService(db)
    item = SimpleNamespace(product_id=987654, variant_id=None)
    with pytest.raises(ValueError, match="Cliente"):
        await svc._validate_refs(SimpleNamespace(customer_id=987654, items=[item]), test_user.tenant_id)
    with pytest.raises(ValueError, match="Produto"):
        await svc._validate_refs(SimpleNamespace(customer_id=None, items=[item]), test_user.tenant_id)


# 4) wishlist: refs da propria loja
@pytest.mark.asyncio
async def test_wishlist_recusa_ids_de_fora(db, test_user):
    from fastapi import HTTPException
    from app.schemas.wishlist import WishlistCreate
    from app.services.wishlist_service import WishlistService
    with pytest.raises(HTTPException) as e:
        await WishlistService().add(db, test_user.tenant_id, WishlistCreate(customer_id=987654, product_id=987655))
    assert e.value.status_code == 404


# 5) midia: reorder escopado pelo produto
def test_midia_reorder_exige_produto():
    from app.repositories.product_media_repository import ProductMediaRepository
    assert "product_id" in inspect.signature(ProductMediaRepository.reorder).parameters


# 6) sugestoes: tags e produtos da propria loja
@pytest.mark.asyncio
async def test_sugestoes_escopadas_por_tenant(db, test_user):
    from app.schemas.product_tag import ProductTagCreate
    from app.services.suggestion_service import SuggestionService
    svc = SuggestionService()
    assert await svc.get_tags(db, 987654, test_user.tenant_id) == []
    assert await svc.delete_tag(db, 987654, test_user.tenant_id) is False
    with pytest.raises(ValueError):
        await svc.add_tag(db, test_user.tenant_id, ProductTagCreate(product_id=987654, tag_type="color", tag_value="preto"))
