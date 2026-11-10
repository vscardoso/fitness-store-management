"""Fila de impressão de etiquetas: entrar na fila, só o botão "Imprimi" tira da fila e anda a folha, "Não saiu" desfaz."""
from datetime import date
from decimal import Decimal

import pytest

from app.models.entry_item import EntryItem
from app.models.stock_entry import StockEntry
from app.models.user import UserRole
from tests.test_short_codes import _loja, _produto, _sem_override, _tenant_de_verdade, _user  # noqa: F401

pytestmark = pytest.mark.asyncio
D = Decimal
API = "/api/v1/labels"


async def _cenario(db, qtds=(5, 4)):
    t, cat = await _loja(db)
    p, vs = await _produto(db, t, cat, grade=(("Preto", "M"), ("Preto", "G")))
    entry = StockEntry(entry_code=f"ENT-FILA-{t}", entry_date=date.today(), entry_type="local", supplier_name="Fornecedor",
                       tenant_id=t, total_cost=D("0"))
    db.add(entry)
    await db.flush()
    for v, q in zip(vs, qtds):
        db.add(EntryItem(entry_id=entry.id, product_id=p.id, variant_id=v.id, quantity_received=q, quantity_remaining=q,
                         unit_cost=D("30"), tenant_id=t))
    await db.commit()
    h = await _user(db, t, UserRole.SELLER)
    return t, h, entry.id, [v.id for v in vs]


SHEET = {"layout": "sheet", "width_mm": 47, "height_mm": 42}


def _caminho(url: str) -> str:
    """O link é https://api.../api/v1/public/...: o teste chama só o caminho."""
    return "/api/v1" + url.split("/api/v1", 1)[1]


async def test_entrada_na_fila_so_o_que_falta_e_nao_dobra(test_client, async_session):
    _sem_override()
    t, h, entry_id, (va, vb) = await _cenario(async_session)
    r = await test_client.post(f"{API}/queue/entry/{entry_id}", headers=h)
    assert r.status_code == 201 and r.json()["added"] == 9 and r.json()["progress"]["missing"] == 0
    r = await test_client.post(f"{API}/queue/entry/{entry_id}", headers=h)        # de novo: nada a mais
    assert r.json()["added"] == 0
    q = (await test_client.get(f"{API}/queue", headers=h)).json()
    assert q["total"] == 9 and {i["variant_id"]: i["quantity"] for i in q["items"]} == {va: 5, vb: 4}
    assert q["items"][0]["entry_code"] == f"ENT-FILA-{t}"


async def test_gerar_pdf_nao_tira_da_fila_so_o_botao_imprimi(test_client, async_session):
    _sem_override()
    t, h, entry_id, (va, vb) = await _cenario(async_session)
    await test_client.post(f"{API}/queue/entry/{entry_id}", headers=h)
    r = await test_client.post(f"{API}/pdf", json={**SHEET, "items": [{"variant_id": va, "quantity": 5}, {"variant_id": vb, "quantity": 4}]}, headers=h)
    assert r.status_code == 200
    assert (await test_client.get(f"{API}/queue", headers=h)).json()["total"] == 9           # PDF não muda nada
    st = (await test_client.get(f"{API}/print-state", params=SHEET, headers=h)).json()
    assert st["next_position"] == 1 and st["per_sheet"] == 6 and st["sheet"] == []

    body = {**SHEET, "start_position": 1, "from_queue": True, "items": [{"variant_id": va, "quantity": 5}, {"variant_id": vb, "quantity": 4}]}
    r = await test_client.post(f"{API}/prints", json=body, headers=h)                        # "Imprimi, tirar da fila"
    assert r.status_code == 201, r.text
    assert r.json()["total"] == 9 and r.json()["next_position"] == 4                          # 9 = 6 + 3: a 2ª folha parou no 3
    assert (await test_client.get(f"{API}/queue", headers=h)).json()["total"] == 0
    st = (await test_client.get(f"{API}/print-state", params=SHEET, headers=h)).json()
    assert st["next_position"] == 4
    assert [c["position"] for c in st["sheet"]] == [1, 2, 3]                                  # o que já está na folha atual
    assert all(c["code"] for c in st["sheet"])
    prog = (await test_client.get(f"{API}/entry/{entry_id}/progress", headers=h)).json()
    assert prog["printed"] == 9 and prog["queued"] == 0 and prog["missing"] == 0


async def test_impressao_parcial_deixa_o_resto_na_fila_e_continua_a_folha(test_client, async_session):
    _sem_override()
    t, h, entry_id, (va, vb) = await _cenario(async_session)
    await test_client.post(f"{API}/queue/entry/{entry_id}", headers=h)
    r = await test_client.post(f"{API}/prints", json={**SHEET, "start_position": 1, "from_queue": True,
                                                       "items": [{"variant_id": va, "quantity": 2}]}, headers=h)
    assert r.json()["next_position"] == 3
    q = (await test_client.get(f"{API}/queue", headers=h)).json()
    assert q["total"] == 7 and {i["variant_id"]: i["quantity"] for i in q["items"]} == {va: 3, vb: 4}
    # a próxima impressão já começa do 3 e fecha a folha
    r = await test_client.post(f"{API}/prints", json={**SHEET, "start_position": 3, "from_queue": True,
                                                       "items": [{"variant_id": vb, "quantity": 4}]}, headers=h)
    assert r.json()["next_position"] == 1                                                    # folha cheia: a próxima é nova
    st = (await test_client.get(f"{API}/print-state", params=SHEET, headers=h)).json()
    assert st["next_position"] == 1 and st["sheet"] == []


async def test_nao_saiu_volta_para_a_fila_e_desfaz_a_folha(test_client, async_session):
    _sem_override()
    t, h, entry_id, (va, vb) = await _cenario(async_session)
    await test_client.post(f"{API}/queue/entry/{entry_id}", headers=h)
    job = (await test_client.post(f"{API}/prints", json={**SHEET, "start_position": 1, "from_queue": True,
                                                         "items": [{"variant_id": va, "quantity": 5}]}, headers=h)).json()
    assert job["next_position"] == 6
    st = (await test_client.get(f"{API}/print-state", params=SHEET, headers=h)).json()
    assert st["last_job"]["id"] == job["id"] and st["last_job"]["total"] == 5                  # é essa que o app oferece desfazer
    r = await test_client.post(f"{API}/prints/{job['id']}/undo", headers=h)
    assert r.status_code == 200 and r.json()["returned"] == 5
    q = (await test_client.get(f"{API}/queue", headers=h)).json()
    assert q["total"] == 9
    assert (await test_client.get(f"{API}/print-state", params=SHEET, headers=h)).json()["next_position"] == 1
    assert (await test_client.post(f"{API}/prints/{job['id']}/undo", headers=h)).status_code == 400   # já desfeita
    assert (await test_client.get(f"{API}/print-state", params=SHEET, headers=h)).json()["last_job"] is None


async def test_validacoes_e_isolamento_entre_lojas(test_client, async_session):
    _sem_override()
    t, h, entry_id, (va, vb) = await _cenario(async_session)
    t2, h2, entry2, (vc, _) = await _cenario(async_session)
    r = await test_client.post(f"{API}/prints", json={**SHEET, "start_position": 7, "from_queue": False,
                                                       "items": [{"variant_id": va, "quantity": 1}]}, headers=h)
    assert r.status_code == 400                                                              # a folha só tem 6 posições
    r = await test_client.post(f"{API}/queue", json={"items": [{"variant_id": vc, "quantity": 1}]}, headers=h)
    assert r.status_code == 400                                                              # peça de outra loja
    r = await test_client.post(f"{API}/queue/entry/{entry2}", headers=h)
    assert r.status_code == 400                                                              # entrada de outra loja
    await test_client.post(f"{API}/queue/entry/{entry_id}", headers=h)
    assert (await test_client.get(f"{API}/queue", headers=h2)).json()["total"] == 0          # a fila é de cada loja
    item = (await test_client.get(f"{API}/queue", headers=h)).json()["items"][0]
    assert (await test_client.put(f"{API}/queue/{item['id']}", json={"quantity": 0}, headers=h2)).status_code == 400
    assert (await test_client.put(f"{API}/queue/{item['id']}", json={"quantity": 2}, headers=h)).status_code == 200
    assert (await test_client.get(f"{API}/queue", headers=h)).json()["total"] == 2 + 4


async def test_direto_da_entrada_conta_como_impresso_sem_passar_pela_fila(test_client, async_session):
    _sem_override()
    t, h, entry_id, (va, vb) = await _cenario(async_session)
    r = await test_client.post(f"{API}/prints", json={**SHEET, "start_position": 1, "from_queue": False, "entry_id": entry_id,
                                                       "items": [{"variant_id": va, "quantity": 5}]}, headers=h)
    assert r.status_code == 201
    prog = (await test_client.get(f"{API}/entry/{entry_id}/progress", headers=h)).json()
    assert prog["printed"] == 5 and prog["missing"] == 4
    r = await test_client.post(f"{API}/queue/entry/{entry_id}", headers=h)                    # só o que falta
    assert r.json()["added"] == 4


# ── Gerar o PDF = imprimir (sem o passo "Já imprimi"), fila concorrente e seleção ─────────────────────────────────────

async def test_gerar_pdf_ja_salva_a_impressao_e_tira_da_fila(test_client, async_session):
    _sem_override()
    t, h, entry_id, (va, vb) = await _cenario(async_session)
    await test_client.post(f"{API}/queue/entry/{entry_id}", headers=h)
    r = await test_client.post(f"{API}/prints/pdf", json={**SHEET, "start_position": 1, "from_queue": True,
                                                          "items": [{"variant_id": va, "quantity": 5}, {"variant_id": vb, "quantity": 4}]}, headers=h)
    assert r.status_code == 200, r.text
    dados = r.json()
    assert dados["url"].startswith("https://") and "blob:" not in dados["url"] and dados["url"].endswith(".pdf")   # link de verdade
    pdf = await test_client.get(_caminho(dados["url"]))                                       # sem login: o token na URL é a permissão
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF" and pdf.headers["content-type"] == "application/pdf"
    assert (await test_client.get(f"{API}/queue", headers=h)).json()["total"] == 0           # tirou da fila na mesma hora
    st = (await test_client.get(f"{API}/print-state", params=SHEET, headers=h)).json()
    assert st["next_position"] == 4 and st["last_job"]["total"] == 9                          # folha andou, "Não saiu" disponível
    prog = (await test_client.get(f"{API}/entry/{entry_id}/progress", headers=h)).json()
    assert prog["printed"] == 9 and prog["queued"] == 0


async def test_pdf_que_falha_nao_grava_nada(test_client, async_session):
    _sem_override()
    t, h, entry_id, (va, vb) = await _cenario(async_session)
    await test_client.post(f"{API}/queue/entry/{entry_id}", headers=h)
    r = await test_client.post(f"{API}/prints/pdf", json={**SHEET, "start_position": 1, "from_queue": True,
                                                          "items": [{"variant_id": va, "quantity": 5}, {"variant_id": 99999999, "quantity": 1}]}, headers=h)
    assert r.status_code == 400
    assert (await test_client.get(f"{API}/queue", headers=h)).json()["total"] == 9           # fila intacta
    assert (await test_client.get(f"{API}/print-state", params=SHEET, headers=h)).json()["last_job"] is None


async def test_segunda_pessoa_imprimindo_a_mesma_fila_nao_duplica(test_client, async_session):
    """A abriu a fila, B imprimiu tudo; quando A manda imprimir, a fila já não tem aquelas etiquetas: recusa e não grava nada."""
    _sem_override()
    t, h, entry_id, (va, vb) = await _cenario(async_session)
    h_b = await _user(async_session, t, UserRole.SELLER)
    await test_client.post(f"{API}/queue/entry/{entry_id}", headers=h)
    corpo = {**SHEET, "start_position": 1, "from_queue": True, "items": [{"variant_id": va, "quantity": 5}, {"variant_id": vb, "quantity": 4}]}
    assert (await test_client.post(f"{API}/prints/pdf", json=corpo, headers=h_b)).status_code == 200      # B imprime primeiro
    r = await test_client.post(f"{API}/prints/pdf", json=corpo, headers=h)                                # A, com a tela velha
    assert r.status_code == 400 and "A fila mudou" in r.json()["detail"]
    prog = (await test_client.get(f"{API}/entry/{entry_id}/progress", headers=h)).json()
    assert prog["printed"] == 9                                                                           # impresso uma vez só
    jobs = (await test_client.get(f"{API}/print-state", params=SHEET, headers=h_b)).json()
    assert jobs["last_job"]["total"] == 9


async def test_so_quem_imprimiu_desfaz_e_so_a_ultima(test_client, async_session):
    _sem_override()
    t, h, entry_id, (va, vb) = await _cenario(async_session)
    h_b = await _user(async_session, t, UserRole.SELLER)
    await test_client.post(f"{API}/queue/entry/{entry_id}", headers=h)
    job = (await test_client.post(f"{API}/prints", json={**SHEET, "start_position": 1, "from_queue": True,
                                                         "items": [{"variant_id": va, "quantity": 5}]}, headers=h)).json()
    assert (await test_client.get(f"{API}/print-state", params=SHEET, headers=h_b)).json()["last_job"] is None   # B nem vê o botão
    r = await test_client.post(f"{API}/prints/{job['id']}/undo", headers=h_b)
    assert r.status_code == 400 and "outra pessoa" in r.json()["detail"]
    assert (await test_client.get(f"{API}/queue", headers=h)).json()["total"] == 4                       # nada voltou
    assert (await test_client.post(f"{API}/prints/{job['id']}/undo", headers=h)).status_code == 200      # quem imprimiu desfaz


async def test_so_o_que_foi_escolhido_vai_para_a_fila(test_client, async_session):
    """Entrada com várias variações: pôr 1 delas na fila não leva as outras (o botão antigo levava a entrada inteira)."""
    _sem_override()
    t, h, entry_id, (va, vb) = await _cenario(async_session)
    r = await test_client.post(f"{API}/queue", json={"items": [{"variant_id": va, "quantity": 2}], "entry_id": entry_id}, headers=h)
    assert r.status_code == 201 and r.json()["added"] == 2
    q = (await test_client.get(f"{API}/queue", headers=h)).json()
    assert {i["variant_id"]: i["quantity"] for i in q["items"]} == {va: 2}
    prog = (await test_client.get(f"{API}/entry/{entry_id}/progress", headers=h)).json()
    assert prog["queued"] == 2 and prog["missing"] == 7                                                   # o resto continua "faltando"


# ── Últimos PDFs gerados: reabrir por 24 horas ────────────────────────────────────────────────────────────────────────

async def test_reabrir_ultimo_pdf_sem_salvar_nada_e_so_os_3_ultimos_ficam(test_client, async_session):
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import update
    from app.models.label_queue import LabelPrintJob

    _sem_override()
    t, h, entry_id, (va, vb) = await _cenario(async_session)
    await test_client.post(f"{API}/queue/entry/{entry_id}", headers=h)
    r = await test_client.post(f"{API}/prints/pdf", json={**SHEET, "start_position": 2, "from_queue": True,
                                                          "items": [{"variant_id": va, "quantity": 5}, {"variant_id": vb, "quantity": 4}]}, headers=h)
    assert r.status_code == 200
    original = (await test_client.get(_caminho(r.json()["url"]))).content
    rec = (await test_client.get(f"{API}/prints/recent", headers=h)).json()
    assert len(rec) == 1 and rec[0]["total"] == 9 and rec[0]["start_position"] == 1   # posição automática: folha nova = 1

    antes = (await test_client.get(f"{API}/print-state", params=SHEET, headers=h)).json()
    again = await test_client.get(f"{API}/prints/{rec[0]['id']}/pdf", headers=h)
    assert again.status_code == 200 and again.content[:4] == b"%PDF"                   # mesmo PDF, na mesma posição da folha
    from tests.test_short_codes import _pages, _pdf_text
    texto = _pdf_text(again.content)
    assert texto.strip() and "SKU" not in texto                                         # tem as etiquetas (e nada interno)
    assert texto == _pdf_text(original) and _pages(again.content) == _pages(original)  # o mesmo conteúdo do PDF de quando imprimiu
    depois = (await test_client.get(f"{API}/print-state", params=SHEET, headers=h)).json()
    assert antes == depois                                                              # reabrir não salva nem anda a folha
    assert (await test_client.get(f"{API}/queue", headers=h)).json()["total"] == 0
    assert len((await test_client.get(f"{API}/prints/recent", headers=h)).json()) == 1  # continua um só

    # só os 3 últimos: com mais 3 impressões, o primeiro some da lista e o link dele deixa de abrir
    for _ in range(3):
        r_n = await test_client.post(f"{API}/prints/pdf", json={**SHEET, "start_position": 1, "from_queue": False, "entry_id": entry_id,
                                                                 "items": [{"variant_id": va, "quantity": 1}]}, headers=h)
        assert r_n.status_code == 200, r_n.text
    lista = (await test_client.get(f"{API}/prints/recent", headers=h)).json()
    assert len(lista) == 3 and rec[0]["id"] not in [j["id"] for j in lista]
    gone = await test_client.get(f"{API}/prints/{rec[0]['id']}/pdf", headers=h)
    assert gone.status_code == 400 and "3 últimos" in gone.json()["detail"]
    assert (await test_client.get(_caminho(rec[0]["url"]))).status_code == 404                  # o link antigo também
    assert (await test_client.get(_caminho(lista[0]["url"]))).status_code == 200                # o mais novo abre


async def test_ultimos_pdfs_sao_da_loja_e_o_desfeito_some(test_client, async_session):
    _sem_override()
    t, h, entry_id, (va, vb) = await _cenario(async_session)
    t2, h2, _, _ = await _cenario(async_session)
    await test_client.post(f"{API}/queue/entry/{entry_id}", headers=h)
    await test_client.post(f"{API}/prints/pdf", json={**SHEET, "start_position": 1, "from_queue": True,
                                                      "items": [{"variant_id": va, "quantity": 5}]}, headers=h)
    job_id = (await test_client.get(f"{API}/prints/recent", headers=h)).json()[0]["id"]
    assert (await test_client.get(f"{API}/prints/recent", headers=h2)).json() == []                   # outra loja não vê
    assert (await test_client.get(f"{API}/prints/{job_id}/pdf", headers=h2)).status_code == 400       # nem abre
    await test_client.post(f"{API}/prints/{job_id}/undo", headers=h)                                   # "não saiu": desfeita
    assert (await test_client.get(f"{API}/prints/recent", headers=h)).json() == []
    assert (await test_client.get(f"{API}/prints/{job_id}/pdf", headers=h)).status_code == 400


async def test_link_do_pdf_e_https_sem_login_assinado_e_vence_em_24h(test_client, async_session):
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import update
    from app.models.label_queue import LabelPrintJob

    _sem_override()
    t, h, entry_id, (va, vb) = await _cenario(async_session)
    await test_client.post(f"{API}/queue/entry/{entry_id}", headers=h)
    dados = (await test_client.post(f"{API}/prints/pdf", json={**SHEET, "start_position": 1, "from_queue": True,
                                                                "items": [{"variant_id": va, "quantity": 5}]}, headers=h)).json()
    url = dados["url"]
    assert url.startswith("https://") and "/public/label-files/" in url and url.endswith(dados["filename"])
    assert (await test_client.get(f"{API}/prints/recent", headers=h)).json()[0]["url"].startswith("https://")   # a lista também traz o link
    caminho = _caminho(url)
    ok = await test_client.get(caminho)
    assert ok.status_code == 200 and ok.content[:4] == b"%PDF" and "inline" in ok.headers["content-disposition"]

    # adulterado ou de outra impressão: 404
    token = caminho.split("/label-files/")[1].split("/")[0]
    ruim = token[:-3] + ("AAA" if not token.endswith("AAA") else "BBB")
    assert (await test_client.get(f"{API}/public/label-files/{ruim}/etiquetas.pdf")).status_code == 404
    assert (await test_client.get(f"{API}/public/label-files/abc/etiquetas.pdf")).status_code == 404

    # desfeita ("não saiu"): o link para de abrir
    await test_client.post(f"{API}/prints/{dados['id']}/undo", headers=h)
    assert (await test_client.get(caminho)).status_code == 404


async def test_imprimir_pela_entrada_ou_produto_tira_a_peca_da_fila(test_client, async_session):
    """Caso real (10/11/2026): peças na fila, impressas pela tela da entrada (fora da fila) e a fila continuava com elas."""
    _sem_override()
    t, h, entry_id, (va, vb) = await _cenario(async_session)
    await test_client.post(f"{API}/queue/entry/{entry_id}", headers=h)                                  # fila: va 5, vb 4
    r = await test_client.post(f"{API}/prints/pdf", json={**SHEET, "start_position": 1, "from_queue": False, "entry_id": entry_id,
                                                          "items": [{"variant_id": va, "quantity": 5}]}, headers=h)
    assert r.status_code == 200, r.text
    q = (await test_client.get(f"{API}/queue", headers=h)).json()
    assert {i["variant_id"]: i["quantity"] for i in q["items"]} == {vb: 4}                              # va saiu da fila, vb continua
    # imprimiu mais do que havia na fila e uma peça que nem estava nela: não dá erro e a fila não fica negativa
    r = await test_client.post(f"{API}/prints", json={**SHEET, "start_position": 1, "from_queue": False, "entry_id": entry_id,
                                                       "items": [{"variant_id": vb, "quantity": 9}, {"variant_id": va, "quantity": 2}]}, headers=h)
    assert r.status_code == 201, r.text
    assert (await test_client.get(f"{API}/queue", headers=h)).json()["total"] == 0
    prog = (await test_client.get(f"{API}/entry/{entry_id}/progress", headers=h)).json()
    assert prog["queued"] == 0


async def test_toda_impressao_comeca_na_primeira_posicao_sem_espaco_em_branco(test_client, async_session):
    """Cada impressão começa numa folha nova (posição 1), mesmo se o app mandar outra posição e mesmo depois de impressões anteriores."""
    _sem_override()
    t, h, entry_id, (va, vb) = await _cenario(async_session)
    h_b = await _user(async_session, t, UserRole.SELLER)

    async def imprimir(headers, qtd, start_enviado):
        r = await test_client.post(f"{API}/prints/pdf", json={**SHEET, "start_position": start_enviado, "from_queue": False, "entry_id": entry_id,
                                                              "items": [{"variant_id": va, "quantity": qtd}]}, headers=headers)
        assert r.status_code == 200, r.text
        return (await test_client.get(f"{API}/prints/recent", headers=headers)).json()[0]

    assert (await imprimir(h, 2, 6))["start_position"] == 1           # o app mandou 6: ignorado
    assert (await imprimir(h_b, 3, 1))["start_position"] == 1         # a folha anterior ficou com 4 vagas, mas esta começa em folha nova
    assert (await imprimir(h, 1, 5))["start_position"] == 1
    assert (await imprimir(h, 7, 3))["start_position"] == 1           # 7 etiquetas: 2 folhas, a primeira cheia desde a posição 1

