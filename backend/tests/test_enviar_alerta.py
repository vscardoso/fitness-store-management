"""Aviso do monitor por Web Push (scripts/enviar_alerta.py): só vai para as contas pedidas, apaga aparelho que sumiu e diz o que houve."""
import argparse
import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario
from tests.test_web_push import _PushServer, _browser_keys, _vapid

pytestmark = pytest.mark.asyncio
SPEC = importlib.util.spec_from_file_location("enviar_alerta", Path(__file__).resolve().parents[1] / "scripts" / "enviar_alerta.py")
alerta = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(alerta)


def _args(emails, title="Provador: teste", body="corpo"):
    return argparse.Namespace(title=title, body=body, emails=emails, url="/", tag="provador-monitor")


async def test_so_manda_para_a_conta_pedida_e_apaga_aparelho_que_sumiu(async_session, test_user, test_engine, monkeypatch, capsys):
    from app.core import config, database
    from app.models.notification import WebPushSubscription
    from app.models.user import User

    t_id, *_ = await _cenario(async_session, test_user)
    pub, priv = _vapid()
    monkeypatch.setattr(config.settings, "VAPID_PUBLIC_KEY", pub)
    monkeypatch.setattr(config.settings, "VAPID_PRIVATE_KEY", priv)
    monkeypatch.setattr(database, "async_session_maker", sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False))

    srv = _PushServer()
    p256dh, auth = _browser_keys()
    outra = (await async_session.execute(select(User).where(User.tenant_id == t_id, User.id != test_user.id))).scalars().first()
    donos = [(test_user, "ok"), (test_user, "gone")]
    if outra is not None:
        donos.append((outra, "outra-pessoa"))
    for i, (u, path) in enumerate(donos):
        async_session.add(WebPushSubscription(user_id=u.id, tenant_id=t_id, endpoint=f"{srv.url}/{path}", endpoint_hash=f"h-{i}",
                                              p256dh=p256dh, auth=auth))
    await async_session.commit()

    code = await alerta.main(_args(test_user.email.upper()))   # e-mail sem diferenciar maiúscula
    assert code == 0
    assert "enviados 1 de 2 aparelho(s); removidos 1" in capsys.readouterr().out
    caminhos = sorted(x["path"] for x in srv.received)
    assert caminhos == ["/gone", "/ok"]                         # nada foi para a outra pessoa da loja
    async_session.expire_all()
    restantes = (await async_session.execute(select(WebPushSubscription.endpoint_hash).where(WebPushSubscription.tenant_id == t_id))).scalars().all()
    assert "h-1" not in restantes and "h-0" in restantes        # o que sumiu (410) foi apagado


async def test_sem_aparelho_sem_chaves_e_sem_email(async_session, test_user, test_engine, monkeypatch, capsys):
    from app.core import config, database

    monkeypatch.setattr(database, "async_session_maker", sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False))
    # sem chaves VAPID: desligado (2)
    monkeypatch.setattr(config.settings, "VAPID_PUBLIC_KEY", "")
    monkeypatch.setattr(config.settings, "VAPID_PRIVATE_KEY", "")
    assert await alerta.main(_args(test_user.email)) == 2
    pub, priv = _vapid()
    monkeypatch.setattr(config.settings, "VAPID_PUBLIC_KEY", pub)
    monkeypatch.setattr(config.settings, "VAPID_PRIVATE_KEY", priv)
    # conta sem aparelho inscrito (3) e e-mail vazio (3)
    assert await alerta.main(_args(test_user.email)) == 3
    assert "Nenhum aparelho inscrito" in capsys.readouterr().out
    assert await alerta.main(_args(" , ")) == 3
