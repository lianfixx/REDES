#!/usr/bin/env python3
"""Arma dist/ para el Worker: panel/, datos.json y crecimiento/*.json. Sin dependencias."""
import shutil
from pathlib import Path

R = Path(__file__).resolve().parents[1]
D = R / "dist"
shutil.rmtree(D, ignore_errors=True)
shutil.copytree(R / "panel", D)
(D / "crecimiento").mkdir()
for p in (R / "crecimiento").glob("*.json"):
    shutil.copy(p, D / "crecimiento" / p.name)
(D / "robots.txt").write_text("User-agent: *\nDisallow: /\n")
print("dist/ listo:", sorted(str(p.relative_to(D)) for p in D.rglob("*") if p.is_file()))
