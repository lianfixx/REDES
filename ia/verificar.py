#!/usr/bin/env python3
"""Control del repositorio REDES.

    python3 ia/verificar.py ci   pruebas (Python y Worker), datos, ejemplo ficticio, SKILL.md y puentes,
                                 registro con «Agente:», secretos y borradores privados fuera de git
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
SKILLS = ["skills/matriz-redes", ".claude/skills/matriz-redes", ".agents/skills/matriz-redes"]
SECRETO = re.compile(r"(ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|xox[bp]-[A-Za-z0-9-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)")


def rastreados() -> list[Path]:
    out = subprocess.run(["git", "ls-files"], cwd=RAIZ, capture_output=True, text=True).stdout.split()
    return [RAIZ / p for p in out]


def ci() -> int:
    fallas: list[str] = []

    def correr(nombre: str, cmd: list[str]) -> None:
        r = subprocess.run(cmd, cwd=RAIZ, capture_output=True, text=True)
        print(("✓ " if r.returncode == 0 else "✗ ") + nombre)
        if r.returncode:
            fallas.append(nombre)
            print((r.stdout + r.stderr)[-3000:])

    py = sys.executable
    correr("pruebas de redes.py", [py, "-m", "unittest", "discover", "-s", "skills/matriz-redes/scripts", "-p", "test_*.py"])
    correr("pruebas del Worker", ["node", "worker/prueba.mjs"])
    correr("datos del repositorio", [py, "skills/matriz-redes/scripts/redes.py", "validar"])
    correr("semana ficticia", [py, "skills/matriz-redes/scripts/redes.py", "validar", "--raiz", "ejemplos/semana-ficticia"])
    correr("SKILL.md y puentes", [py, "ia/check_skill.py", *SKILLS])
    desc = {}
    for s in SKILLS:
        m = re.search(r'^description: (.+)$', (RAIZ / s / "SKILL.md").read_text(encoding="utf-8"), re.M)
        desc[s] = m.group(1) if m else ""
    if len(set(desc.values())) != 1:
        fallas.append("las descripciones de la skill y sus puentes no coinciden")
    log = (RAIZ / "CHANGELOG.md").read_text(encoding="utf-8")
    entradas = re.split(r"^## ", log, flags=re.M)[1:]
    sin = [e.splitlines()[0] for e in entradas if "\n- Agente:" not in e]
    if not entradas or sin:
        fallas.append(f"CHANGELOG.md: entradas sin «Agente:»: {sin[:3]}")
    for p in rastreados():
        rel = p.relative_to(RAIZ).as_posix()
        if rel.startswith("privado/"):
            fallas.append(f"{rel}: los borradores privados no se suben")
        if p.is_file() and p.suffix in {".md", ".json", ".js", ".mjs", ".py", ".yml", ".jsonc", ".html", ".css"}:
            if SECRETO.search(p.read_text(encoding="utf-8", errors="ignore")):
                fallas.append(f"{rel}: parece contener un secreto")
    for f in fallas:
        print("✗", f)
    print("✓ control aprobado" if not fallas else f"{len(fallas)} falla(s)")
    return 1 if fallas else 0


if __name__ == "__main__":
    if sys.argv[1:] == ["ci"]:
        sys.exit(ci())
    print(__doc__)
    sys.exit(2)
