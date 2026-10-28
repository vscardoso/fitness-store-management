"""Barra o CI em vulnerabilidade grave de dependência (item 2.5).

Uso:
  pip-audit -r requirements.txt -f json -o pip.json; python audit_gate.py pip pip.json
  npm audit --omit=dev --json > npm.json;           python audit_gate.py npm-mobile npm.json

- npm: barra severidade alta ou crítica (dependências que vão para produção, sem as de desenvolvimento).
- pip: o pip-audit não informa severidade; barra QUALQUER vulnerabilidade conhecida do backend (é o servidor exposto).
- Exceção só pela lista .github/audit-allowlist.json, com motivo. Pacote da lista que não aparece mais é avisado (tirar).
"""
import json
import sys
from pathlib import Path

ALLOW = json.loads((Path(__file__).parent.parent / "audit-allowlist.json").read_text())


def found_pip(data: dict) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for dep in data.get("dependencies", []):
        for v in dep.get("vulns", []):
            fix = ", ".join(v.get("fix_versions") or []) or "sem correção"
            out.setdefault(dep["name"].lower(), []).append(f"{dep['version']} {v['id']} (corrige em: {fix})")
    return out


def found_npm(data: dict) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for name, v in (data.get("vulnerabilities") or {}).items():
        if v.get("severity") not in ("high", "critical"):
            continue
        titles = [x.get("title", "") for x in v.get("via", []) if isinstance(x, dict)] or [f"via {', '.join(map(str, v.get('via', [])))}"]
        out.setdefault(name.lower(), []).append(f"{v['severity']}: {titles[0]}")
    return out


def main() -> int:
    kind, path = sys.argv[1], sys.argv[2]
    data = json.loads(Path(path).read_text() or "{}")
    found = found_pip(data) if kind == "pip" else found_npm(data)
    allow = {k.lower(): r for k, r in ALLOW.get(kind, {}).items()}

    bad = {k: v for k, v in found.items() if k not in allow}
    for k in sorted(set(found) & set(allow)):
        print(f"[exceção] {k}: {allow[k]}")
    for k in sorted(set(allow) - set(found)):
        print(f"[aviso] {k} está na lista de exceções mas não tem mais vulnerabilidade: tire de .github/audit-allowlist.json")
    if bad:
        print(f"\nVULNERABILIDADE GRAVE em {kind}:")
        for k, items in sorted(bad.items()):
            for i in items:
                print(f"  - {k} {i}")
        print("\nAtualize a dependência (o Dependabot costuma abrir o PR) ou, se não houver risco real, registre o motivo em .github/audit-allowlist.json.")
        return 1
    print(f"{kind}: nenhuma vulnerabilidade grave fora das exceções.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
