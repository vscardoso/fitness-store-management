"""
Vincula um número da Cloud API (phone_number_id da Meta) a uma loja.

Sem esse vínculo o webhook /webhooks/whatsapp-cloud ignora os eventos do número.
Idempotente: rodar de novo com os mesmos dados não muda nada; com outros dados, atualiza.
Recusa se o número já estiver vinculado a OUTRA loja.

Uso (a partir de backend/, ou dentro do container do backend):
    python scripts/wa_cloud_vincular_numero.py --loja 1 --phone-number-id 123 --waba-id 456 \\
        --telefone 553432151035 --nome "W.A Fitness"            # simulação: só mostra o que faria
    python scripts/wa_cloud_vincular_numero.py ... --apply      # grava

Os IDs não são segredo (ver docs/whatsapp-cloud-plano.md). A base usada é a do DATABASE_URL.
"""
import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.core.database import async_session_maker  # noqa: E402
from app.core.rls import bypass_on  # noqa: E402
from app.models.store import Store  # noqa: E402
from app.models.whatsapp_cloud import WhatsAppCloudNumber  # noqa: E402


async def main(a) -> int:
    async with async_session_maker() as db:
        await bypass_on(db)
        store = (await db.execute(select(Store).where(Store.id == a.loja))).scalar_one_or_none()
        if store is None:
            print(f"ERRO: loja {a.loja} não existe")
            return 1
        num = (await db.execute(
            select(WhatsAppCloudNumber).where(WhatsAppCloudNumber.phone_number_id == a.phone_number_id)
        )).scalar_one_or_none()
        if num is not None and num.tenant_id != a.loja:
            print(f"ERRO: phone_number_id {a.phone_number_id} já pertence à loja {num.tenant_id}")
            return 1
        novos = {"waba_id": a.waba_id, "display_phone_number": a.telefone, "verified_name": a.nome, "is_active": True}
        if num is None:
            print(f"Criar vínculo: número {a.phone_number_id} -> loja {store.id} ({store.name}) {novos}")
            if a.apply:
                db.add(WhatsAppCloudNumber(tenant_id=store.id, phone_number_id=a.phone_number_id, **novos))
        else:
            mudancas = {k: v for k, v in novos.items() if v is not None and getattr(num, k) != v}
            if not mudancas:
                print(f"Nada a fazer: número {a.phone_number_id} já vinculado à loja {store.id} ({store.name})")
                return 0
            print(f"Atualizar vínculo do número {a.phone_number_id} (loja {store.id}): {mudancas}")
            if a.apply:
                for k, v in mudancas.items():
                    setattr(num, k, v)
        if a.apply:
            await db.commit()
            print("Gravado.")
        else:
            print("Simulação: nada gravado (use --apply).")
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--loja", type=int, required=True, help="id da loja (stores.id)")
    p.add_argument("--phone-number-id", required=True)
    p.add_argument("--waba-id")
    p.add_argument("--telefone", help="número de exibição, só dígitos")
    p.add_argument("--nome", help="nome verificado na Meta")
    p.add_argument("--apply", action="store_true", help="grava (sem isso é só simulação)")
    sys.exit(asyncio.run(main(p.parse_args())))
