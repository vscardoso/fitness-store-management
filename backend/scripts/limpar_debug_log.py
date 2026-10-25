"""Triagem e limpeza do DEBUG_LOG.txt (trace do app em desenvolvimento).

O app manda cada requisição que falha e cada erro para o backend local (rota /debug), que grava tudo em
DEBUG_LOG.txt na raiz do projeto. Com o tempo o arquivo vira um monte de erros antigos já corrigidos, que
atrapalham a leitura dos erros novos. Este script:

1. agrupa os erros do arquivo por "assinatura" (rota sem os números, status e começo da mensagem);
2. confere cada assinatura com o registro `scripts/debug_log_resolvidos.json`;
3. limpa só o que já está sanado: os erros sanados saem do arquivo e ficam apenas os que continuam abertos ou novos
   (se tudo estiver sanado, o arquivo fica vazio). "Sanado" quer dizer:
   - tem `prova_teste` (um teste pytest que reproduz o problema) e esse teste PASSA agora; ou
   - foi marcado como resolvido à mão (`resolver`), com a nota de como foi corrigido.
   Erro que não está no registro, ou cuja prova falha, continua no arquivo.
4. antes de reescrever, guarda uma cópia inteira em `backend/logs/debug_log_arquivado/` (fora do git).

Uso (na pasta backend):
    python scripts/limpar_debug_log.py                 # relatório (não altera nada)
    python scripts/limpar_debug_log.py limpar          # tira do arquivo os erros sanados e lista o que continua aberto
    python scripts/limpar_debug_log.py limpar --auto   # igual, em silêncio quando não há o que fazer (usado no start do backend em dev)
    python scripts/limpar_debug_log.py resolver "<trecho da assinatura>" --nota "como foi corrigido" [--prova tests/x.py::test_y]
    python scripts/limpar_debug_log.py limpar --tudo   # esvazia o arquivo mesmo com erro aberto (guarda a cópia)

Código de saída: 0 = nada a fazer ou limpo; 1 = ainda há erro aberto/novo.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from collections import OrderedDict
from datetime import datetime
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
RAIZ = BACKEND.parent
ARQUIVO = RAIZ / "DEBUG_LOG.txt"
REGISTRO = Path(__file__).resolve().parent / "debug_log_resolvidos.json"
ARQUIVADOS = BACKEND / "logs" / "debug_log_arquivado"
PROVAS_OK = BACKEND / "logs" / "debug_log_provas_ok.json"   # quando cada teste-prova passou pela última vez
VALIDADE_PROVA = 24 * 3600                                    # no modo --auto, prova que passou há menos de 24 h vale

# [HH:MM:SS] [origem] [tag] mensagem   (linha de cabeçalho; a linha seguinte "Data: {...}" é o detalhe)
CABECALHO = re.compile(r"^\s*\[(\d{2}:\d{2}:\d{2})\]\s*\[([^\]]+)\]\s*(.*)$")
STATUS_NO_FIM = re.compile(r"\s-\s(\d{3})\s*$")
PALAVRAS_ERRO = re.compile(r"\b(erro|error|falha|fail|exception|traceback)\b", re.I)


def normalizar(texto: str) -> str:
    """Tira o que muda de uma ocorrência para outra (números, uuids, aspas) para agrupar o mesmo problema."""
    t = re.sub(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "{uuid}", texto, flags=re.I)
    t = re.sub(r"/\d+", "/{id}", t)
    t = re.sub(r"\b\d+(\.\d+)?\b", "N", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def ler_entradas(caminho: Path) -> list[dict]:
    """Quebra o arquivo em entradas {hora, origem, cabecalho, dados}."""
    entradas: list[dict] = []
    atual: dict | None = None
    if not caminho.exists():
        return entradas
    for linha in caminho.read_text(encoding="utf-8", errors="replace").splitlines():
        m = CABECALHO.match(linha)
        if m:
            atual = {"hora": m.group(1), "origem": m.group(2), "cabecalho": m.group(3).strip(), "dados": "", "linhas": [linha]}
            entradas.append(atual)
        elif atual is not None and linha.strip().startswith("Data:"):
            atual["dados"] = linha.strip()[5:].strip()
            atual["linhas"].append(linha)
        elif atual is not None and linha.strip():
            atual["dados"] += " " + linha.strip()
            atual["linhas"].append(linha)
    return entradas


def e_erro(entrada: dict) -> bool:
    cab, dados = entrada["cabecalho"], entrada["dados"]
    m = STATUS_NO_FIM.search(cab)
    if m and int(m.group(1)) >= 400:
        return True
    if re.search(r"Network Error", cab) or re.search(r'"status":\s*([4-5]\d\d)', dados):
        return True
    return bool(PALAVRAS_ERRO.search(cab))


def assinatura(entrada: dict) -> str:
    """Rota sem números + status + começo da mensagem de erro."""
    cab = normalizar(entrada["cabecalho"])
    detalhe = ""
    m = re.search(r'"detail":\s*"((?:[^"\\]|\\.)*)"', entrada["dados"])
    if m:
        detalhe = normalizar(m.group(1))[:220]
    else:
        m = re.search(r'"message":\s*"((?:[^"\\]|\\.)*)"', entrada["dados"])
        if m:
            detalhe = normalizar(m.group(1))[:220]
    return f"{cab} | {detalhe}" if detalhe else cab


def agrupar(entradas: list[dict]) -> "OrderedDict[str, dict]":
    grupos: "OrderedDict[str, dict]" = OrderedDict()
    for e in entradas:
        if not e_erro(e):
            continue
        sig = assinatura(e)
        g = grupos.setdefault(sig, {"qtd": 0, "primeira": e["hora"], "ultima": e["hora"]})
        g["qtd"] += 1
        g["ultima"] = e["hora"]
    return grupos


def carregar_registro() -> list[dict]:
    if REGISTRO.exists():
        return json.loads(REGISTRO.read_text(encoding="utf-8"))
    return []


def salvar_registro(itens: list[dict]) -> None:
    REGISTRO.write_text(json.dumps(itens, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _provas_ok() -> dict:
    try:
        return json.loads(PROVAS_OK.read_text(encoding="utf-8"))
    except Exception:
        return {}


def teste_passa(no_pytest: str, rodar: bool = True) -> bool:
    """Roda o teste que prova a correção (passou = o problema não volta).
    Com rodar=False (modo --auto, no start do backend) não executa nada: só vale a prova que passou há menos de 24 h."""
    registro = _provas_ok()
    if not rodar:
        quando = registro.get(no_pytest)
        return bool(quando) and (datetime.now() - datetime.fromisoformat(quando)).total_seconds() < VALIDADE_PROVA
    r = subprocess.run(
        [sys.executable, "-m", "pytest", no_pytest, "--no-cov", "-q", "-x", "-p", "no:cacheprovider"],
        cwd=BACKEND, capture_output=True, text=True,
    )
    if r.returncode == 0:
        registro[no_pytest] = datetime.now().isoformat(timespec="seconds")
        PROVAS_OK.parent.mkdir(parents=True, exist_ok=True)
        PROVAS_OK.write_text(json.dumps(registro, indent=2), encoding="utf-8")
    return r.returncode == 0


def classificar(grupos: "OrderedDict[str, dict]", registro: list[dict], rodar_testes: bool = True) -> dict[str, tuple[str, str]]:
    """{assinatura: (status, motivo)} com status sanado | aberto | novo."""
    cache_testes: dict[str, bool] = {}
    out: dict[str, tuple[str, str]] = {}
    for sig in grupos:
        regra = next((r for r in registro if r["assinatura"].lower() in sig.lower()), None)
        if regra is None:
            out[sig] = ("novo", "ainda não analisado (não está em debug_log_resolvidos.json)")
            continue
        prova = regra.get("prova_teste")
        if prova:
            if prova not in cache_testes:
                cache_testes[prova] = teste_passa(prova, rodar_testes)
            if cache_testes[prova]:
                out[sig] = ("sanado", f"teste {prova} passa")
            else:
                out[sig] = ("aberto", f"o teste {prova} FALHA (ou ainda não rodou hoje): rode sem --auto para conferir")
        elif regra.get("resolvido_manual"):
            out[sig] = ("sanado", f"marcado à mão: {regra.get('nota', '')}")
        else:
            out[sig] = ("aberto", regra.get("nota", "registrado como aberto"))
    return out


def relatorio(grupos, status) -> None:
    if not grupos:
        print("DEBUG_LOG.txt sem erros (ou vazio).")
        return
    print(f"{len(grupos)} tipo(s) de erro no DEBUG_LOG.txt:\n")
    for sig, g in grupos.items():
        st, motivo = status[sig]
        marca = {"sanado": "[sanado]", "aberto": "[ABERTO]", "novo": "[NOVO]  "}[st]
        print(f"{marca} {g['qtd']:>3}x  {g['primeira']} a {g['ultima']}  {sig[:150]}")
        print(f"           {motivo}")


def arquivar_copia() -> Path | None:
    if not ARQUIVO.exists() or ARQUIVO.stat().st_size == 0:
        return None
    ARQUIVADOS.mkdir(parents=True, exist_ok=True)
    destino = ARQUIVADOS / f"DEBUG_LOG-{datetime.now():%Y%m%d-%H%M%S}.txt"
    shutil.copy2(ARQUIVO, destino)
    return destino


def reescrever_so_com_abertos(entradas: list[dict], status: dict[str, tuple[str, str]]) -> tuple[int, int]:
    """Reescreve o arquivo só com as ocorrências dos erros que continuam abertos/novos. Devolve (mantidas, removidas)."""
    mantidas: list[str] = []
    qtd_mantidas = 0
    for e in entradas:
        if e_erro(e) and status.get(assinatura(e), ("novo", ""))[0] != "sanado":
            mantidas.extend(e["linhas"])
            qtd_mantidas += 1
    ARQUIVO.write_text(("\n".join(mantidas) + "\n") if mantidas else "", encoding="utf-8")
    return qtd_mantidas, len(entradas) - qtd_mantidas


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("comando", nargs="?", default="relatorio", choices=["relatorio", "limpar", "resolver"])
    ap.add_argument("trecho", nargs="?", help="resolver: trecho da assinatura do erro")
    ap.add_argument("--nota", help="resolver: como foi corrigido")
    ap.add_argument("--prova", help="resolver: teste pytest que prova a correção (ex.: tests/x.py::test_y)")
    ap.add_argument("--auto", action="store_true", help="limpar: silencioso quando não há o que fazer")
    ap.add_argument("--tudo", action="store_true", help="limpar: esvazia o arquivo mesmo com erro aberto (guarda a cópia)")
    a = ap.parse_args()

    if a.comando == "resolver":
        if not a.trecho or not a.nota:
            print("Informe o trecho da assinatura e --nota.")
            return 2
        registro = carregar_registro()
        item = {"assinatura": a.trecho, "nota": a.nota, "resolvido_em": datetime.now().strftime("%Y-%m-%d")}
        if a.prova:
            item["prova_teste"] = a.prova
        else:
            item["resolvido_manual"] = True
        registro = [r for r in registro if r["assinatura"] != a.trecho] + [item]
        salvar_registro(registro)
        print("Registrado:", json.dumps(item, ensure_ascii=False))
        return 0

    entradas = ler_entradas(ARQUIVO)
    grupos = agrupar(entradas)
    status = classificar(grupos, carregar_registro(), rodar_testes=not a.auto)

    if a.comando == "relatorio":
        relatorio(grupos, status)
        return 0 if all(s[0] == "sanado" for s in status.values()) else 1

    if not ARQUIVO.exists() or ARQUIVO.stat().st_size == 0:
        if not a.auto:
            print("Nada a limpar: o arquivo já está vazio.")
        return 0
    pendentes = {k: v for k, v in status.items() if v[0] != "sanado"}
    destino = arquivar_copia()
    if a.tudo:
        ARQUIVO.write_text("", encoding="utf-8")
        print(f"DEBUG_LOG.txt esvaziado. Cópia em {destino}")
        return 0
    mantidas, removidas = reescrever_so_com_abertos(entradas, status)
    print(f"DEBUG_LOG.txt limpo: {removidas} linha(s) de log removida(s), {mantidas} ocorrência(s) de erro em aberto mantida(s). Cópia em {destino}")
    if pendentes and not a.auto:
        print()
        relatorio({k: grupos[k] for k in pendentes}, status)
    return 1 if pendentes else 0


if __name__ == "__main__":
    sys.exit(main())
