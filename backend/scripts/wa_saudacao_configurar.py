"""
Grava o texto da saudação automática do número oficial de uma loja (e, só se pedido, liga).

Uso (a partir de backend/, ou dentro do container do backend):
    python scripts/wa_saudacao_configurar.py --loja 2 --texto "Oi! ..."            # simulação: só mostra o que faria
    python scripts/wa_saudacao_configurar.py --loja 2 --texto "Oi! ..." --apply    # grava o texto (continua DESLIGADA)
    python scripts/wa_saudacao_configurar.py --loja 2 --ligar --apply              # liga (usa o texto já gravado)
    python scripts/wa_saudacao_configurar.py --loja 2 --desligar --apply

Nada é ligado sem `--ligar`. O mesmo ajuste existe na tela Mais > WhatsApp > Saudação automática (admin).
"""
import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.core.database import async_session_maker  # noqa: E402
from app.core.rls import bypass_on  # noqa: E402
from app.models.whatsapp_cloud import WhatsAppCloudNumber  # noqa: E402
from app.services.whatsapp_cloud_service import GREETING_MAX_CHARS  # noqa: E402


async def main(a) -> int:
    async with async_session_maker() as db:
        await bypass_on(db)
        number = (await db.execute(select(WhatsAppCloudNumber).where(
            WhatsAppCloudNumber.tenant_id == a.loja, WhatsAppCloudNumber.is_active == True,  # noqa: E712
        ).order_by(WhatsAppCloudNumber.id))).scalars().first()
        if number is None:
            print(f"ERRO: a loja {a.loja} não tem número oficial vinculado")
            return 1
        texto = (a.texto if a.texto is not None else number.greeting_text or "").strip()
        if len(texto) > GREETING_MAX_CHARS:
            print(f"ERRO: texto com mais de {GREETING_MAX_CHARS} letras")
            return 1
        ligar = True if a.ligar else False if a.desligar else bool(number.greeting_enabled)
        if ligar and not texto:
            print("ERRO: não dá para ligar sem texto")
            return 1
        print(f"loja {a.loja}: ligada {bool(number.greeting_enabled)} -> {ligar}; texto {'novo' if a.texto is not None else 'igual'}: {texto[:80]!r}")
        if not a.apply:
            print("(simulação; use --apply para gravar)")
            return 0
        number.greeting_enabled = ligar
        number.greeting_text = texto or None
        await db.commit()
        print("gravado")
        return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--loja", type=int, required=True)
    p.add_argument("--texto")
    g = p.add_mutually_exclusive_group()
    g.add_argument("--ligar", action="store_true")
    g.add_argument("--desligar", action="store_true")
    p.add_argument("--apply", action="store_true")
    sys.exit(asyncio.run(main(p.parse_args())))
