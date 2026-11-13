#!/usr/bin/env python3
"""Comprueba que un SKILL.md se pueda subir a claude.ai y que sus enlaces locales existan.

Uso: python3 check_skill.py RUTA/A/LA/CARPETA_DE_LA_SKILL [...]

claude.ai solo acepta en el frontmatter: name, description, license, compatibility,
metadata y allowed-tools; cualquier otro campo hace fallar la subida. Este control no
valida el contenido jurídico ni la calidad del método.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ALLOWED = {"name", "description", "license", "compatibility", "metadata", "allowed-tools"}
NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
RAW: dict[str, str] = {}  # valores tal como aparecen en la primera línea de cada campo
LINK = re.compile(r"\]\(([^)#\s]+)(?:#[^)]*)?\)")


def frontmatter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---\n"):
        raise ValueError("falta el bloque de frontmatter inicial ---")
    end = text.find("\n---", 4)
    if end < 0:
        raise ValueError("el frontmatter no se cierra con ---")
    block, body = text[4:end], text[end + 4:]
    fields: dict[str, str] = {}
    RAW.clear()
    current = None
    for line in block.splitlines():
        if not line.strip():
            continue
        if not line.startswith((" ", "\t")):
            key, _, value = line.partition(":")
            current = key.strip()
            fields[current] = value.strip()
            RAW[current] = value.strip()
        elif current:
            fields[current] = (fields[current] + " " + line.strip()).strip()
    return fields, body


def clean(value: str) -> str:
    value = re.sub(r"^[>|][-+]?\s*", "", value).strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
        value = value[1:-1]
    return value


def check(folder: Path) -> list[str]:
    errors = []
    skill = folder / "SKILL.md"
    if not skill.is_file():
        return [f"{folder}: no existe SKILL.md"]
    try:
        fields, body = frontmatter(skill.read_text(encoding="utf-8"))
    except ValueError as exc:
        return [f"{skill}: {exc}"]
    for key, raw in RAW.items():
        if raw and not raw.startswith((">", "|", '"', "'", "[", "{")) and (": " in raw or " #" in raw or raw.endswith(":")):
            errors.append(f"{skill}: el valor de «{key}» rompe el YAML (contiene «: » o « #»); ponlo entre comillas o usa >-")
    extra = set(fields) - ALLOWED
    if extra:
        errors.append(f"{skill}: campos no admitidos por claude.ai: {', '.join(sorted(extra))}")
    name = clean(fields.get("name", ""))
    if not NAME.match(name) or len(name) > 64:
        errors.append(f"{skill}: name inválido «{name}» (minúsculas, números y guiones; máx. 64)")
    if name.startswith("anthropic") or name.startswith("claude"):
        errors.append(f"{skill}: name reservado «{name}»")
    desc = clean(fields.get("description", ""))
    if not desc:
        errors.append(f"{skill}: falta description")
    elif len(desc) > 1024:
        errors.append(f"{skill}: description de {len(desc)} caracteres (máx. 1024)")
    if re.search(r"[<>]", desc):
        errors.append(f"{skill}: description contiene < o >")
    for target in LINK.findall(body):
        if re.match(r"^[a-z]+:", target):
            continue
        if not (folder / target).exists():
            errors.append(f"{skill}: enlace roto a {target}")
    return errors


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    errors = [e for arg in argv for e in check(Path(arg))]
    for e in errors:
        print(e)
    if not errors:
        print("SKILL.md compatible: " + ", ".join(argv))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
