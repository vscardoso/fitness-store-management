"""Manda um aviso (notificação no celular pelo app instalado, Web Push) para a conta de quem cuida do sistema.

Usado pelo monitor de logs (deploy/monitor_logs.py), que roda no VPS:
    docker exec -w /app -e PYTHONPATH=/app provador-backend python scripts/enviar_alerta.py --title "..." --body "..." --emails a@x.com

Só manda para os aparelhos inscritos das contas ATIVAS pedidas em --emails (aviso técnico não vai para a lojista).
Inscrição recusada pelo serviço do navegador (404/410) é apagada. Sai com 0 se pelo menos um aparelho recebeu; 3 se não havia
aparelho; 2 se o envio está desligado (sem chaves VAPID).
"""
import argparse
import asyncio
import json
import sys

from sqlalchemy import delete, func, select


async def main(args) -> int:
    from app.core.database import async_session_maker
    from app.core.rls import bypass_on
    from app.models.notification import WebPushSubscription
    from app.models.user import User
    from app.services import web_push_service as wp

    if not wp.enabled():
        print("Web Push desligado (sem chaves VAPID).")
        return 2
    emails = [e.strip().lower() for e in args.emails.split(",") if e.strip()]
    if not emails:
        print("Nenhum e-mail informado.")
        return 3
    async with async_session_maker() as db:
        await bypass_on(db)
        rows = (await db.execute(
            select(WebPushSubscription).join(User, User.id == WebPushSubscription.user_id)
            .where(func.lower(User.email).in_(emails), User.is_active == True,  # noqa: E712
                   WebPushSubscription.is_active == True)  # noqa: E712
        )).scalars().all()
        if not rows:
            print("Nenhum aparelho inscrito nessas contas (ligue em Mais > Notificações no celular).")
            return 3
        payload = json.dumps({"title": args.title, "body": args.body, "url": args.url, "tag": args.tag}, ensure_ascii=False)
        results = await asyncio.gather(*(asyncio.to_thread(
            wp._send_one, {"endpoint": s.endpoint, "p256dh": s.p256dh, "auth": s.auth}, payload) for s in rows))
        gone = [s.id for s, st in zip(rows, results) if st in (404, 410)]
        if gone:
            await db.execute(delete(WebPushSubscription).where(WebPushSubscription.id.in_(gone)))
            await db.commit()
        sent = sum(1 for st in results if st is None)
        print(f"enviados {sent} de {len(rows)} aparelho(s); removidos {len(gone)}")
        return 0 if sent else 3


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--title", required=True)
    ap.add_argument("--body", required=True)
    ap.add_argument("--emails", required=True, help="contas que recebem, separadas por vírgula")
    ap.add_argument("--url", default="/")
    ap.add_argument("--tag", default="provador-monitor", help="mesmo tag substitui o aviso anterior no celular")
    sys.exit(asyncio.run(main(ap.parse_args())))
