"""Link https dos PDFs gerados no servidor (ver app/services/pdf_delivery.py). Público: o token assinado na URL é a autorização."""
from fastapi import APIRouter, HTTPException, Query, Response, status

from app.services.pdf_delivery import PdfLinkError, clean_name, read_published_pdf

public_router = APIRouter(prefix="/public", tags=["PDF (link)"])


@public_router.get("/pdf/{token}/{filename}", include_in_schema=False)
async def public_pdf(token: str, filename: str, download: bool = Query(False)):
    """PDF de um link válido (24 h). O nome no fim do endereço só dá nome ao arquivo no navegador."""
    try:
        content = read_published_pdf(token)
    except PdfLinkError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF não encontrado ou vencido.")
    return Response(content=content, media_type="application/pdf",
                    headers={"Content-Disposition": f'{"attachment" if download else "inline"}; filename="{clean_name(filename)}"',
                             "Cache-Control": "private, max-age=300"})
