"""Entrega dos PDFs gerados no servidor: UM jeito só para comprovante, relatórios, estoque e o resto.

Abrir ou compartilhar um PDF a partir de um endereço blob: do navegador só existe no aparelho: o WhatsApp e a impressora recebiam o
TEXTO "blob:https://app..." (as etiquetas já tinham sido consertadas com link https; o comprovante, o relatório e o estoque não).
Aqui o PDF vira um link https comum, assinado, que vale 24 horas. Toda rota de PDF usa `pdf_response`:
 - sem `link`: devolve o PDF direto (como sempre foi);
 - com `link=true`: guarda o arquivo e devolve {"url", "filename"} para o app abrir/compartilhar (mobile/services/pdfDelivery.ts).
"""
from __future__ import annotations

import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from fastapi import Response

from app.core.config import settings

LINK_DAYS = 1
TOKEN_TYPE = "pdf-file"


class PdfLinkError(ValueError):
    pass


def _dir() -> Path:
    d = Path(settings.UPLOAD_DIR) / "_pdf"
    d.mkdir(parents=True, exist_ok=True)
    return d


def clean_name(filename: str) -> str:
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", filename or "documento.pdf").strip("-.") or "documento"
    return name if name.lower().endswith(".pdf") else f"{name}.pdf"


def _cleanup(folder: Path) -> None:
    """Apaga o que já venceu (o link só vale LINK_DAYS dias): a pasta não cresce."""
    limit = time.time() - (LINK_DAYS + 1) * 86400
    for f in folder.glob("*.pdf"):
        try:
            if f.stat().st_mtime < limit:
                f.unlink()
        except OSError:
            pass


def publish_pdf(content: bytes, filename: str, tenant_id: int) -> dict:
    """Guarda o PDF e devolve o link https assinado. O token amarra o arquivo à loja que o gerou."""
    folder = _dir()
    _cleanup(folder)
    file_id = uuid.uuid4().hex
    (folder / f"{file_id}.pdf").write_bytes(content)
    exp = datetime.now(timezone.utc) + timedelta(days=LINK_DAYS)
    token = jwt.encode({"typ": TOKEN_TYPE, "f": file_id, "tid": tenant_id, "exp": int(exp.timestamp())},
                       settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    name = clean_name(filename)
    return {"url": f"{settings.PUBLIC_API_URL.rstrip('/')}/api/v1/public/pdf/{token}/{name}", "filename": name}


def read_published_pdf(token: str) -> bytes:
    """Conteúdo de um link válido; link vencido, adulterado ou de arquivo já apagado recusa."""
    try:
        data = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise PdfLinkError("Este link do PDF venceu. Gere o documento de novo.")
    except jwt.PyJWTError:
        raise PdfLinkError("Link do PDF inválido.")
    file_id = data.get("f")
    if data.get("typ") != TOKEN_TYPE or not isinstance(file_id, str) or not re.fullmatch(r"[0-9a-f]{32}", file_id):
        raise PdfLinkError("Link do PDF inválido.")
    path = _dir() / f"{file_id}.pdf"
    if not path.is_file():
        raise PdfLinkError("Este PDF não está mais disponível. Gere o documento de novo.")
    return path.read_bytes()


def pdf_response(content: bytes, filename: str, *, link: bool, tenant_id: int, no_store: bool = False):
    """Resposta padrão de toda rota de PDF (ver o texto no alto do arquivo)."""
    if link:
        return publish_pdf(content, filename, tenant_id)
    headers = {"Content-Disposition": f'inline; filename="{clean_name(filename)}"'}
    if no_store:
        headers["Cache-Control"] = "no-store"
    return Response(content=content, media_type="application/pdf", headers=headers)
