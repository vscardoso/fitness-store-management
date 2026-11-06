"""IA de produto: modelo que deu tempo esgotado fica de fora 10 min (06/11/2026: 30 s por análise esperando
dois modelos fora do ar antes do que respondia em 4 s)."""
import pytest

from app.services.ai_scan_service import AIScanService

genai = pytest.importorskip("google.genai")


class _Resp:
    text = '{"ok": true}'


def test_modelo_fora_do_ar_e_pulado_na_proxima_analise(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "x", raising=False)
    monkeypatch.setattr(settings, "GEMINI_MODEL", "m-lento")
    monkeypatch.setattr(settings, "GEMINI_FALLBACK_MODELS", "m-lento2,m-rapido")
    AIScanService._model_down_until.clear()
    chamados = []

    class _Models:
        def generate_content(self, model, contents, config):
            chamados.append(model)
            if model != "m-rapido":
                raise RuntimeError("504 DEADLINE_EXCEEDED")
            return _Resp()

    class _Client:
        def __init__(self, *a, **k):
            self.models = _Models()

    monkeypatch.setattr(genai, "Client", _Client)
    svc = AIScanService(db=None)
    assert svc._call_gemini(b"img", "image/jpeg", "p") == '{"ok": true}'
    assert chamados == ["m-lento", "m-lento2", "m-rapido"]
    chamados.clear()
    assert svc._call_gemini(b"img", "image/jpeg", "p") == '{"ok": true}'
    assert chamados == ["m-rapido"]            # os dois fora do ar foram pulados
    # todos de fora: tenta todos de novo (não fica sem nenhum)
    assert AIScanService._models_in_order(["a", "b"], now=0) == ["a", "b"]
    AIScanService._model_down_until.clear()
