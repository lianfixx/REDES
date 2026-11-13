#!/usr/bin/env python3
"""Matriz de Redes de Emi: valida, puntúa, revisa el calendario y genera el tablero.

Sin dependencias (Python 3.9+). Se corre desde la raíz del repositorio:

    python3 skills/matriz-redes/scripts/redes.py validar            # todo el repositorio
    python3 skills/matriz-redes/scripts/redes.py validar --raiz ejemplos/semana-ficticia
    python3 skills/matriz-redes/scripts/redes.py puntuar ID_IDEA     # ordena las redes para una idea
    python3 skills/matriz-redes/scripts/redes.py contrato ARCHIVO    # valida un red/estado.json
    python3 skills/matriz-redes/scripts/redes.py texto ARCHIVO --red x   # revisa un texto (regla de autoría, largo)
    python3 skills/matriz-redes/scripts/redes.py tablero             # genera TABLERO.md y panel/datos.json
    python3 skills/matriz-redes/scripts/redes.py huella "texto"

La puntuación ORDENA y EXPLICA; no decide sola lo que tenga riesgo, cueste o hable de política.
"""
from __future__ import annotations

import argparse
import datetime as dt
import difflib
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

AQUI = Path(__file__).resolve().parent
CONFIG = AQUI.parent / "data" / "config.json"

ESPACIOS = {"personal", "milla", "castorena", "pan"}
PILARES = {"ia-derecho", "lifestyle", "politica", "carrera", "milla"}
ORIGENES = {"emi", "skill", "noticia", "metrica", "peticion", "matriz"}
TIPOS = {"noticia", "temporada", "perenne"}
NIVELES_EVIDENCIA = {"oficial", "terceros", "criterio"}
ESTADOS_IDEA = ["propuesta", "decidida", "en produccion", "aprobada", "entregada", "publicada", "medida", "cerrada", "descartada"]
ESTADOS_PIEZA = {"idea", "borrador", "en produccion", "lista para aprobar", "aprobada", "programada", "publicada", "medida", "cancelada"}
CRITERIOS = ["encaje", "objetivo", "balance", "capacidad", "costo", "riesgo", "novedad", "urgencia"]
DECIDE = {"emi", "regla"}
OFFSET_MX = "-06:00"


class Fallo(Exception):
    pass


# ---------------------------------------------------------------- utilidades

def nfc(t: str) -> str:
    return unicodedata.normalize("NFC", t or "")


def huella(texto: str) -> str:
    """Igual que x-viral: SHA-256 del texto NFC sin espacios a los lados, primeros 12 hex."""
    return hashlib.sha256(nfc(texto).strip().encode("utf-8")).hexdigest()[:12]


LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t"})


def aplanar(t: str) -> str:
    """Igual que el Worker: sin acentos, minúsculas, sin signos, números «leet» a letras y letras sueltas unidas."""
    t = unicodedata.normalize("NFD", nfc(t).lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").translate(LEET)
    t = " ".join(re.sub(r"[^a-z0-9 ]+", " ", t).split())
    return re.sub(r"\b(?:[a-z] ){1,}[a-z]\b", lambda m: m.group(0).replace(" ", ""), t)


IA = r"(?:ia|inteligencia artificial|chatgpt|gpt|claude|gemini|deepseek|copilot|muse|un robot|una maquina)"
HECHO = (r"(?:hizo|hecho|hecha|escrito|escrita|escribio|redacto|redactado|redactada|generado|generada|genero|creado|creada|armo|"
         r"armado|armada|edito|editado|editada|produjo|producido|producida|diseno|disenado|disenada|monto|montado|montada)")
RE_AUTORIA = [
    re.compile(rf"\b{HECHO}\b(?: \w+){{0,3}} (?:por|con|usando|desde|mediante)?(?: \w+){{0,1}} ?{IA}\b"),
    re.compile(rf"\b{HECHO} (?:una |la |el )?{IA}\b"),
    re.compile(rf"\b(?:la |una |el )?{IA} (?:lo |la |me lo |me la |se )?(?:hizo|escribio|redacto|genero|creo|armo|edito|produjo|diseno|monto)\b"),
    re.compile(r"\bnadie lo (?:edito|hizo|escribio)\b"),
    re.compile(r"\btexto de ia\b"),
]


def autoria_ia(texto: str) -> bool:
    p = aplanar(texto)
    return any(r.search(p) for r in RE_AUTORIA)


def parecido(a: str, b: str) -> float:
    a, b = aplanar(a)[:2000], aplanar(b)[:2000]
    if not a or not b:
        return 0.0
    sec = difflib.SequenceMatcher(None, a, b).ratio()
    va, vb = set(a.split()), set(b.split())
    voc = len(va & vb) / max(1, len(va | vb))
    return max(sec, voc)


def fecha_mx(s: str) -> dt.datetime:
    """Acepta AAAA-MM-DDTHH:MM con zona; exige zona explícita para no confundir horas."""
    try:
        d = dt.datetime.fromisoformat(str(s))
    except ValueError as e:
        raise Fallo(f"fecha inválida «{s}»") from e
    if d.tzinfo is None:
        raise Fallo(f"fecha sin zona horaria «{s}» (usa {OFFSET_MX})")
    return d


def dia(s: str) -> dt.date:
    try:
        return dt.date.fromisoformat(str(s)[:10])
    except ValueError as e:
        raise Fallo(f"día inválido «{s}»") from e


def cargar_config(ruta: Path = CONFIG) -> dict:
    return json.loads(ruta.read_text(encoding="utf-8"))


def leer_json(p: Path):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise Fallo(f"{p}: JSON inválido ({e.msg}, línea {e.lineno})") from e


def prohibidas(texto: str, cfg: dict) -> list[str]:
    """Frases que atribuyen la pieza a una IA (regla de Emi). Devuelve un motivo por coincidencia."""
    plano = aplanar(texto)
    hallado = [f for f in cfg.get("frases_prohibidas", []) if aplanar(f) and f" {aplanar(f)} " in f" {plano} "]
    if not hallado and autoria_ia(texto):
        hallado.append("atribuye la pieza a una IA")
    return hallado


def textos_de(d) -> str:
    """Todo el texto de un objeto (para revisar la regla de autoría en cualquier campo)."""
    if isinstance(d, str):
        return d
    if isinstance(d, dict):
        return "\n".join(textos_de(v) for k, v in d.items() if k not in ("id", "fecha", "fuente_emi"))
    if isinstance(d, list):
        return "\n".join(textos_de(v) for v in d)
    return ""


ZONA_MX = None


def a_mx(d: dt.datetime) -> dt.datetime:
    global ZONA_MX
    if ZONA_MX is None:
        try:
            from zoneinfo import ZoneInfo
            ZONA_MX = ZoneInfo("America/Mexico_City")
        except Exception:  # sin base de zonas: el centro de México no tiene horario de verano desde 2022
            ZONA_MX = dt.timezone(dt.timedelta(hours=-6))
    return d.astimezone(ZONA_MX)


def largo_x(texto: str) -> int:
    """Aproximación de x-viral: cada enlace cuenta 23 y cada emoji 2 (el conteo exacto lo da x-viral)."""
    total = 0
    patron = r"https?://\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|mx|org|net|site|dev|io|ai)(?:/\S*)?"
    sin, n = re.subn(patron, "", nfc(texto), flags=re.I)
    total += 23 * n
    for c in sin:
        o = ord(c)
        if o in (0x200D, 0xFE0E, 0xFE0F) or 0x1F3FB <= o <= 0x1F3FF:
            continue
        total += 2 if o > 0x10FF and not (0x2000 <= o <= 0x206F) else 1
    return total


# ---------------------------------------------------------------- validadores

def _req(d: dict, campos, donde: str, err: list):
    for c in campos:
        if c not in d or d[c] in (None, ""):
            err.append(f"{donde}: falta «{c}»")


def validar_idea(d: dict, cfg: dict) -> list[str]:
    err: list[str] = []
    donde = f"idea {d.get('id', '?')}"
    if not isinstance(d, dict):
        return [f"{donde}: no es un objeto"]
    _req(d, ["id", "fecha_alta", "origen", "espacio", "pilar", "tesis", "tipo", "estado"], donde, err)
    if d.get("origen") not in ORIGENES:
        err.append(f"{donde}: origen «{d.get('origen')}» no es uno de {sorted(ORIGENES)}")
    if d.get("espacio") not in ESPACIOS:
        err.append(f"{donde}: espacio «{d.get('espacio')}» no existe")
    if d.get("pilar") not in PILARES:
        err.append(f"{donde}: pilar «{d.get('pilar')}» no es uno de {sorted(PILARES)}")
    if d.get("tipo") not in TIPOS:
        err.append(f"{donde}: tipo «{d.get('tipo')}» no es uno de {sorted(TIPOS)}")
    if d.get("tipo") == "noticia" and not d.get("caduca"):
        err.append(f"{donde}: una noticia necesita «caduca»")
    if d.get("caduca"):
        try:
            if dia(d["caduca"]) < dia(d.get("fecha_alta", "1900-01-01")):
                err.append(f"{donde}: caduca antes de darse de alta")
        except Fallo as e:
            err.append(f"{donde}: {e}")
    try:
        dia(d.get("fecha_alta", ""))
    except Fallo as e:
        err.append(f"{donde}: {e}")
    est = d.get("estado")
    if est not in ESTADOS_IDEA:
        err.append(f"{donde}: estado «{est}» no es uno de {ESTADOS_IDEA}")
    if est == "descartada" and not d.get("motivo_descarte"):
        err.append(f"{donde}: descartada sin «motivo_descarte»")
    # Política: la postura es de Emi, con sus palabras; sin ella no pasa de propuesta.
    if d.get("pilar") == "politica" and est not in (None, "propuesta", "descartada"):
        pe = d.get("postura_emi") or {}
        if not (isinstance(pe, dict) and pe.get("texto") and pe.get("fuente")):
            err.append(f"{donde}: idea política sin «postura_emi» (texto y fuente: dónde la dijo Emi)")
    for r in ("riesgo_juridico", "riesgo_politico", "riesgo_reputacional"):
        v = d.get(r)
        if not isinstance(v, dict) or not isinstance(v.get("nivel"), int) or not 0 <= v["nivel"] <= 3 or not v.get("motivo"):
            err.append(f"{donde}: «{r}» debe ser {{nivel: 0-3, motivo}}")
    for i, ev in enumerate(d.get("evidencia", []) or []):
        if not isinstance(ev, dict) or ev.get("nivel") not in NIVELES_EVIDENCIA or not ev.get("fuente"):
            err.append(f"{donde}: evidencia {i + 1} necesita fuente y nivel {sorted(NIVELES_EVIDENCIA)}")
        elif d.get("pilar") == "ia-derecho" and ev.get("tipo") == "derecho" and ev.get("nivel") != "oficial":
            err.append(f"{donde}: una cita de derecho necesita fuente oficial")
    c = d.get("costo", {})
    if c and (not isinstance(c, dict) or any(not isinstance(v, (int, float)) or v < 0 for v in c.values())):
        err.append(f"{donde}: «costo» debe ser {{concepto: número ≥ 0}}")
    for f in prohibidas(textos_de({k: v for k, v in d.items() if k not in ("evidencia",)}), cfg):
        err.append(f"{donde}: «{f}» rompe la regla de Emi (ninguna pieza dice que la hizo una IA)")
    m = (d.get("costo") or {}).get("minutos_emi", 0) if isinstance(d.get("costo"), dict) else 0
    if not isinstance(m, (int, float)):
        err.append(f"{donde}: costo.minutos_emi debe ser número")
    return err


def riesgo_max(idea: dict) -> int:
    return max(int((idea.get(r) or {}).get("nivel", 0)) for r in ("riesgo_juridico", "riesgo_politico", "riesgo_reputacional"))


def requiere_emi(idea: dict, cfg: dict) -> list[str]:
    motivos = []
    if riesgo_max(idea) >= cfg.get("riesgo_consulta_emi", 2):
        motivos.append(f"riesgo {riesgo_max(idea)}")
    if idea.get("pilar") == "politica":
        motivos.append("habla de política")
    costo = idea.get("costo") if isinstance(idea.get("costo"), dict) else {}
    if any(isinstance(v, (int, float)) and v > 0 for k, v in costo.items() if k != "minutos_emi"):
        motivos.append("gasta créditos o dinero")
    if isinstance(costo.get("minutos_emi"), (int, float)) and costo["minutos_emi"] > cfg.get("minutos_emi_semana", 120):
        motivos.append("pide más minutos de Emi de los que tiene en la semana")
    if idea.get("espacio") != "personal":
        motivos.append(f"espacio {idea.get('espacio')}")
    return motivos


def validar_decision(d: dict, ideas: dict, cfg: dict) -> list[str]:
    err: list[str] = []
    donde = f"decisión {d.get('id', '?')}"
    _req(d, ["id", "fecha", "idea", "piezas", "razonamiento", "decidio"], donde, err)
    idea = ideas.get(d.get("idea"))
    if not idea:
        err.append(f"{donde}: la idea «{d.get('idea')}» no existe")
    if d.get("decidio") not in DECIDE:
        err.append(f"{donde}: «decidio» debe ser emi o regla")
    elif d.get("decidio") == "emi" and not d.get("fuente_emi"):
        err.append(f"{donde}: decidió Emi pero falta «fuente_emi» (dónde y cuándo lo dijo)")
    if idea and d.get("decidio") == "regla":
        motivos = requiere_emi(idea, cfg)
        if motivos:
            err.append(f"{donde}: la regla no puede decidir sola ({', '.join(motivos)}): decide Emi")
    piezas = d.get("piezas") or []
    if not isinstance(piezas, list) or not piezas:
        err.append(f"{donde}: «piezas» vacío")
    for i, p in enumerate(piezas if isinstance(piezas, list) else []):
        if not isinstance(p, dict):
            err.append(f"{donde}: pieza {i + 1} debe ser un objeto")
            continue
        if p.get("red") not in cfg["redes"]:
            err.append(f"{donde}: pieza {i + 1}: red «{p.get('red')}» no existe")
        _req(p, ["red", "formato", "skill", "fecha_objetivo"], f"{donde} pieza {i + 1}", err)
    alts = d.get("alternativas") or []
    if alts and not all(isinstance(a, dict) and "opcion" in a and isinstance(a.get("puntuacion"), (int, float)) for a in alts):
        err.append(f"{donde}: cada alternativa necesita «opcion» y «puntuacion» numérica")
    if alts and not (d.get("gano") and d.get("perdio")):
        err.append(f"{donde}: con alternativas hay que escribir qué ganó («gano») y qué perdió («perdio»)")
    if d.get("reemplaza") and d.get("reemplaza") == d.get("id"):
        err.append(f"{donde}: no puede reemplazarse a sí misma")
    return err


def _items_vigentes(cal: dict, cfg: dict, donde: str, err: list) -> list[tuple]:
    """Elementos no cancelados con su fecha ya en hora del centro de México."""
    out = []
    for i, it in enumerate(cal.get("items") or []):
        if not isinstance(it, dict):
            err.append(f"{donde}: el elemento {i + 1} no es un objeto")
            continue
        if it.get("red") not in cfg["redes"] or it.get("estado") == "cancelada":
            continue
        try:
            out.append((a_mx(fecha_mx(it.get("fecha"))), it))
        except Fallo:
            pass  # el error ya lo anota validar_calendario
    return out


def revisar_cadencia(lista: list[tuple], cfg: dict, donde: str, semanal: bool) -> list[str]:
    """Tope diario y separación (en hora de México); tope semanal solo dentro de un archivo de semana."""
    err: list[str] = []
    por_red: dict[str, list] = {}
    for f, it in lista:
        por_red.setdefault(it["red"], []).append((f, it))
    for red, l in por_red.items():
        cad = cfg["redes"][red]["cadencia"]
        l.sort(key=lambda x: x[0])
        if semanal and len(l) > cad["max_por_semana"]:
            err.append(f"{donde}: {red} lleva {len(l)} piezas y su tope semanal es {cad['max_por_semana']} ({cfg['redes'][red]['fuente_cadencia']})")
        conteo: dict[dt.date, int] = {}
        for f, _ in l:
            conteo[f.date()] = conteo.get(f.date(), 0) + 1
        for d_, n in sorted(conteo.items()):
            if n > cad["max_por_dia"]:
                err.append(f"{donde}: {red} lleva {n} piezas el {d_} (hora de México) y su tope diario es {cad['max_por_dia']}")
        for (f1, a), (f2, b) in zip(l, l[1:]):
            h = (f2 - f1).total_seconds() / 3600
            if h < cad["separacion_min_h"]:
                err.append(f"{donde}: {red}: «{a.get('id')}» y «{b.get('id')}» van a {h:.1f} h y la separación mínima es {cad['separacion_min_h']} h")
    return err


def validar_calendario(cal: dict, cfg: dict) -> list[str]:
    """Cadencia por red, semana correcta, tope de minutos de Emi, textos repetidos entre redes y regla de autoría."""
    err: list[str] = []
    if not isinstance(cal, dict):
        return ["calendario: no es un objeto"]
    donde = f"calendario {cal.get('semana', '?')}"
    _req(cal, ["semana", "items"], donde, err)
    m = re.fullmatch(r"(\d{4})-W(\d{2})", str(cal.get("semana", "")))
    if cal.get("semana") and not m:
        err.append(f"{donde}: «semana» debe ser AAAA-Wnn")
    items = cal.get("items") or []
    if not isinstance(items, list):
        return err + [f"{donde}: «items» debe ser una lista"]
    vistos_id = set()
    minutos = 0
    for i, it in enumerate(items):
        if not isinstance(it, dict):
            err.append(f"{donde}: el elemento {i + 1} no es un objeto")
            continue
        d2 = f"{donde} · {it.get('id', i + 1)}"
        _req(it, ["id", "fecha", "red", "skill", "estado", "titulo"], d2, err)
        if it.get("id") in vistos_id:
            err.append(f"{d2}: id repetido")
        vistos_id.add(it.get("id"))
        red = it.get("red")
        if red not in cfg["redes"]:
            err.append(f"{d2}: red «{red}» no existe")
            continue
        if it.get("estado") not in ESTADOS_PIEZA:
            err.append(f"{d2}: estado «{it.get('estado')}» no es uno de {sorted(ESTADOS_PIEZA)}")
        if it.get("estado") == "cancelada":
            continue
        try:
            f = a_mx(fecha_mx(it.get("fecha")))
        except Fallo as e:
            err.append(f"{d2}: {e}")
            continue
        if m and tuple(f.isocalendar()[:2]) != (int(m.group(1)), int(m.group(2))):
            err.append(f"{d2}: la fecha {f.date()} no cae en la semana {cal.get('semana')}")
        mins = it.get("minutos_emi", 0) or 0
        if not isinstance(mins, (int, float)) or mins < 0:
            err.append(f"{d2}: «minutos_emi» debe ser un número ≥ 0")
        else:
            minutos += mins
        for frase in prohibidas(str(it.get("texto", "")) + "\n" + str(it.get("titulo", "")), cfg):
            err.append(f"{d2}: «{frase}» rompe la regla de Emi (ninguna pieza dice que la hizo una IA)")
        if it.get("texto"):
            errores, _ = validar_texto(it["texto"], red, cfg)
            err += [f"{d2}: {e}" for e in errores if "IA" not in e]
        if it.get("estado") in ("aprobada", "programada", "publicada") and it.get("texto"):
            if it.get("aprobado_huella") != huella(it["texto"]):
                err.append(f"{d2}: el texto cambió después de aprobarse (huella distinta): vuelve a aprobarlo")
    err += revisar_cadencia(_items_vigentes(cal, cfg, donde, []), cfg, donde, semanal=True)
    tope = cal.get("tope_minutos_emi") or cfg.get("minutos_emi_semana", 120)
    if minutos > tope:
        err.append(f"{donde}: pide {minutos} min de Emi y su tope es {tope}")
    con_texto = [it for it in items if isinstance(it, dict) and it.get("texto") and it.get("estado") != "cancelada"]
    for i, a in enumerate(con_texto):
        for b in con_texto[i + 1:]:
            if a.get("red") != b.get("red") and parecido(a["texto"], b["texto"]) >= cfg.get("parecido_max", 0.85):
                err.append(f"{donde}: «{a.get('id')}» ({a.get('red')}) y «{b.get('id')}» ({b.get('red')}) tienen casi el mismo texto: cada red lleva su adaptación")
    return err


def validar_contrato(d: dict) -> list[str]:
    err: list[str] = []
    donde = "red/estado.json"
    _req(d, ["contrato", "skill", "actualizado"], donde, err)
    if not str(d.get("contrato", "")).startswith("redes-estado/0."):
        err.append(f"{donde}: «contrato» debe ser redes-estado/0.x")
    for c in ("cuentas", "publicados", "lecciones", "ideas_para_otras", "pendientes_de_emi"):
        if c in d and not isinstance(d[c], list):
            err.append(f"{donde}: «{c}» debe ser una lista")
    cad = d.get("cadencia")
    if cad is not None:
        if not isinstance(cad, dict):
            err.append(f"{donde}: «cadencia» debe ser un objeto")
        else:
            for k in ("max_por_dia", "separacion_min_h", "max_por_semana"):
                if k in cad and (not isinstance(cad[k], (int, float)) or cad[k] < 0):
                    err.append(f"{donde}: cadencia.{k} debe ser un número ≥ 0")
            if cad.get("certeza") and cad["certeza"] not in NIVELES_EVIDENCIA:
                err.append(f"{donde}: cadencia.certeza debe ser {sorted(NIVELES_EVIDENCIA)}")
    for i, p in enumerate(d.get("publicados") or []):
        if not isinstance(p, dict) or not p.get("id") or not p.get("fecha"):
            err.append(f"{donde}: publicado {i + 1} necesita id y fecha")
            continue
        try:
            fecha_mx(p["fecha"])
        except Fallo as e:
            err.append(f"{donde}: publicado {p['id']}: {e}")
        m = p.get("metricas")
        if m is not None and (not isinstance(m, dict) or not isinstance(m.get("valores", {}), dict)):
            err.append(f"{donde}: publicado {p['id']}: métricas en «valores» con las unidades de la red")
    for i, l in enumerate(d.get("lecciones") or []):
        if not isinstance(l, dict) or not l.get("texto") or l.get("alcance") not in ("red", "espacio", "pilar", "todas"):
            err.append(f"{donde}: lección {i + 1} necesita texto y alcance (red, espacio, pilar o todas)")
    return err


def validar_leccion(d: dict) -> list[str]:
    err: list[str] = []
    donde = f"lección {d.get('id', '?')}"
    _req(d, ["id", "fecha", "que_paso", "evidencia", "regla", "alcance", "para"], donde, err)
    if d.get("alcance") not in ("red", "espacio", "pilar", "todas"):
        err.append(f"{donde}: alcance inválido")
    # Una lección de una red llega a otra solo como hipótesis.
    if d.get("alcance") == "todas" and d.get("tipo") != "hipotesis" and not d.get("experimento"):
        err.append(f"{donde}: una lección para todas las redes es hipótesis (tipo: hipotesis) o necesita un experimento")
    if d.get("fecha"):
        try:
            dia(d["fecha"])
        except Fallo as e:
            err.append(f"{donde}: {e}")
    return err


def validar_experimento(d: dict) -> list[str]:
    err: list[str] = []
    donde = f"experimento {d.get('id', '?')}"
    _req(d, ["id", "hipotesis", "red", "variable", "metrica", "duracion_min_dias", "inicio", "estado"], donde, err)
    dur = d.get("duracion_min_dias")
    if "duracion_min_dias" in d and (not isinstance(dur, (int, float)) or isinstance(dur, bool)):
        err.append(f"{donde}: «duracion_min_dias» debe ser un número")
    elif isinstance(dur, (int, float)) and dur < 14:
        err.append(f"{donde}: menos de 14 días no alcanza para cambiar una regla")
    if d.get("inicio"):
        try:
            dia(d["inicio"])
        except Fallo as e:
            err.append(f"{donde}: {e}")
    if d.get("estado") == "cerrado" and not (d.get("resultado") and d.get("decision")):
        err.append(f"{donde}: cerrado sin resultado y decisión")
    return err


def validar_registro(d: dict, cfg: dict) -> list[str]:
    err: list[str] = []
    donde = f"registro {d.get('id', '?')}"
    _req(d, ["id", "red", "fecha", "metricas"], donde, err)
    if d.get("red") not in cfg["redes"]:
        err.append(f"{donde}: red inválida")
    m = d.get("metricas") or {}
    if not isinstance(m, dict) or not isinstance(m.get("valores"), dict) or not m.get("fuente") or not m.get("capturado"):
        err.append(f"{donde}: métricas = {{capturado, fuente, valores}} en las unidades de la red")
    return err


def validar_texto(texto: str, red: str, cfg: dict) -> tuple[list[str], list[str]]:
    errores, avisos = [], []
    for f in prohibidas(texto, cfg):
        errores.append(f"«{f}»: ninguna pieza dice que la hizo una IA (regla de Emi, 13/11/2026)")
    limites = {"x": 280, "linkedin": 3000, "instagram": 2200, "tiktok": 4000}
    largo = largo_x(texto) if red == "x" else len(nfc(texto))
    if red in limites and largo > limites[red]:
        errores.append(f"pasa de {limites[red]} caracteres en {red} ({largo}; en X el conteo exacto lo da x-viral)")
    if re.search(r"\bcastorena\b|\bindep\b", aplanar(texto)):
        errores.append("nombra al despacho o a un cliente: fuera de la cuenta personal")
    if re.search(r"(comenta|escribe)\s+\S+\s+(y|para)\s+(te|les)\s+(mando|paso|envio)", aplanar(texto)):
        errores.append("anzuelo de interacción («comenta X y te mando…»): lo castigan X, LinkedIn e Instagram")
    return errores, avisos


# ---------------------------------------------------------------- puntuación

def _balance(idea: dict, red: str, publicados: list, cfg: dict, hoy: dt.date) -> tuple[float, str]:
    ultimos = []
    for p in publicados:
        try:
            if p.get("red") == red and 0 <= (hoy - dia(p.get("fecha", "1900-01-01"))).days <= 30:
                ultimos.append(p)
        except Fallo:
            continue
    if not ultimos:
        return 1.0, "sin publicaciones en 30 días: cualquier pilar suma"
    mismo = sum(1 for p in ultimos if p.get("pilar") == idea.get("pilar")) / len(ultimos)
    return round(1 - mismo, 3), f"{mismo:.0%} de lo publicado en 30 días ya es de este pilar"


def puntuar(idea: dict, cfg: dict, contexto: dict | None = None, hoy: dt.date | None = None) -> list[dict]:
    """Devuelve las redes ordenadas, con su puntuación (0-100) y el porqué de cada criterio.

    contexto: {"encaje": {red: 0-1}, "objetivo": {red: 0-1}, "cupos": {red: libres}, "minutos_libres": n,
               "publicados": [...], "textos": {red: [texto,...]}}
    El encaje y el objetivo vienen de las skills y de Emi; si faltan, cuentan 0.5 y se dice.
    """
    contexto = contexto or {}
    hoy = hoy or dt.date.today()
    pesos = cfg["pesos"]
    if set(pesos) != set(CRITERIOS) or any(not isinstance(v, (int, float)) or v < 0 for v in pesos.values()):
        raise Fallo("config.json: los pesos deben ser los 8 criterios, cada uno ≥ 0")
    total_pesos = sum(pesos.values()) or 1
    salida = []
    for red, rc in cfg["redes"].items():
        if not rc.get("activa") and not contexto.get("incluir_inactivas"):
            continue
        p: dict[str, tuple[float, str]] = {}
        enc = (contexto.get("encaje") or {}).get(red)
        p["encaje"] = (enc, "según su skill") if enc is not None else (0.5, "la skill aún no lo declara: neutro")
        obj = (contexto.get("objetivo") or {}).get(red)
        p["objetivo"] = (obj, "según los objetivos de Emi para esta red") if obj is not None else (0.5, "sin objetivo declarado: neutro")
        p["balance"] = _balance(idea, red, contexto.get("publicados", []), cfg, hoy)
        cupos = (contexto.get("cupos") or {}).get(red)
        if cupos is None:
            p["capacidad"] = (0.5, "cupos desconocidos")
        else:
            p["capacidad"] = (1.0 if cupos >= 2 else 0.5 if cupos == 1 else 0.0, f"{cupos} cupos libres esta semana")
        minutos = int((idea.get("costo") or {}).get("minutos_emi", 0))
        libres = contexto.get("minutos_libres", cfg.get("minutos_emi_semana", 120))
        creditos = sum((idea.get("costo") or {}).get(k, 0) for k in ("creditos_kie", "usd"))
        c = 1.0 if minutos <= libres else 0.0
        c -= min(0.5, creditos / 100)
        p["costo"] = (max(0.0, c), f"{minutos} min de Emi de {libres} libres; {creditos} créditos o USD")
        r = riesgo_max(idea)
        p["riesgo"] = (1 - r / 3, f"riesgo máximo {r} de 3")
        textos = (contexto.get("textos") or {}).get(red, [])
        sim = max([parecido(idea.get("tesis", ""), t) for t in textos] or [0.0])
        p["novedad"] = (1 - sim, f"parecido máximo con lo ya publicado: {sim:.0%}")
        if idea.get("caduca"):
            dias = (dia(idea["caduca"]) - hoy).days
            p["urgencia"] = (1.0 if 0 <= dias <= 2 else 0.6 if dias <= 7 else 0.3, f"caduca en {dias} días")
            if dias < 0:
                p["urgencia"] = (0.0, "ya caducó")
        else:
            p["urgencia"] = (0.3, "perenne: sin prisa")
        total = max(0.0, min(100.0, sum(pesos[k] * max(0.0, min(1.0, float(p[k][0]))) for k in CRITERIOS) / total_pesos * 100))
        salida.append({"red": red, "puntuacion": round(total, 1),
                       "criterios": {k: {"valor": round(float(p[k][0]), 3), "peso": pesos[k], "por_que": p[k][1]} for k in CRITERIOS}})
    salida.sort(key=lambda x: -x["puntuacion"])
    motivos = requiere_emi(idea, cfg)
    for s in salida:
        s["decide"] = "emi" if motivos else "regla"
        s["motivos_emi"] = motivos
    return salida


# ---------------------------------------------------------------- repositorio

CARPETAS = {"ideas": "ideas", "decisiones": "decisiones", "calendario": "calendario", "registro": "registro",
            "lecciones": "lecciones", "experimentos": "experimentos"}


def cargar_todo(raiz: Path) -> dict:
    datos = {k: [] for k in CARPETAS}
    for k, carpeta in CARPETAS.items():
        for p in sorted((raiz / carpeta).glob("*.json")):
            datos[k].append((p, leer_json(p)))
    return datos


def validar_todo(raiz: Path, cfg: dict) -> list[str]:
    try:
        return _validar_todo(raiz, cfg)
    except Exception as e:  # noqa: BLE001 — un dato roto no tumba el tablero: se reporta
        return [f"error al validar ({type(e).__name__}): {e}"]


def _validar_todo(raiz: Path, cfg: dict) -> list[str]:
    err: list[str] = []
    try:
        datos = cargar_todo(raiz)
    except Fallo as e:
        return [str(e)]
    ideas = {}
    for p, d in datos["ideas"]:
        if d.get("id") in ideas:
            err.append(f"{p}: id de idea repetido «{d.get('id')}»")
        ideas[d.get("id")] = d
        err += [f"{p.name}: {e}" for e in validar_idea(d, cfg)]
    ids_dec = {}
    for p, d in datos["decisiones"]:
        ids_dec[d.get("id")] = d
        err += [f"{p.name}: {e}" for e in validar_decision(d, ideas, cfg)]
    for p, d in datos["decisiones"]:
        if d.get("reemplaza") and d["reemplaza"] not in ids_dec:
            err.append(f"{p.name}: reemplaza a «{d['reemplaza']}», que no existe")
    for p, d in datos["calendario"]:
        err += [f"{p.name}: {e}" for e in validar_calendario(d, cfg)]
        for it in (d.get("items") or []) if isinstance(d, dict) else []:
            if isinstance(it, dict) and it.get("idea") and it["idea"] not in ideas:
                err.append(f"{p.name}: «{it.get('id')}» apunta a la idea «{it['idea']}», que no existe")
    for p, d in datos["registro"]:
        err += [f"{p.name}: {e}" for e in validar_registro(d, cfg)]
    exps = {d.get("id") for _, d in datos["experimentos"]}
    for p, d in datos["lecciones"]:
        err += [f"{p.name}: {e}" for e in validar_leccion(d)]
        if d.get("experimento") and d["experimento"] not in exps:
            err.append(f"{p.name}: el experimento «{d['experimento']}» no existe")
    todos = []
    for p, d in datos["calendario"]:
        todos += _items_vigentes(d, cfg, p.name, [])
    # Entre semanas contiguas: separación y tope diario con todos los archivos juntos.
    globales = revisar_cadencia(todos, cfg, "calendario (todas las semanas)", semanal=False)
    ya = set(err)
    err += [g for g in globales if not any(g.split(": ", 1)[1] in e for e in ya)]
    for p, d in datos["experimentos"]:
        err += [f"{p.name}: {e}" for e in validar_experimento(d)]
    return err


# ---------------------------------------------------------------- tablero

def generar_tablero(raiz: Path, cfg: dict, hoy: dt.date | None = None, estados: dict | None = None) -> tuple[str, dict]:
    hoy = hoy or dt.date.today()
    datos = cargar_todo(raiz)
    ideas = [d for _, d in datos["ideas"]]
    items = []
    for _, c in datos["calendario"]:
        for it in (c.get("items") or []) if isinstance(c, dict) else []:
            try:
                if isinstance(it, dict):
                    fecha_mx(it.get("fecha"))
                    items.append(dict(it, semana=c.get("semana")))
            except Fallo:
                pass  # el aviso sale del validador
    lunes = hoy - dt.timedelta(days=hoy.weekday())
    semana = [it for it in items if lunes <= a_mx(fecha_mx(it["fecha"])).date() < lunes + dt.timedelta(days=7)]
    proximas = sorted([it for it in items if a_mx(fecha_mx(it["fecha"])).date() >= hoy and it.get("estado") != "cancelada"],
                      key=lambda x: x["fecha"])[:20]
    pendientes = []
    for it in items:
        if it.get("estado") in ("lista para aprobar",):
            pendientes.append(f"Aprobar: {it['titulo']} ({it['red']}, {it['fecha'][:16].replace('T', ' ')})")
    for d in ideas:
        for q in d.get("pendiente_de_emi", []) or []:
            pendientes.append(str(q))
        if d.get("caduca") and d.get("estado") not in ("publicada", "medida", "cerrada", "descartada"):
            try:
                dias = (dia(d["caduca"]) - hoy).days
            except Fallo:
                continue
            if dias <= 3:
                pendientes.append(f"Caduca {'hoy' if dias == 0 else f'en {dias} días' if dias > 0 else 'YA CADUCÓ'}: {d['tesis']}")
    avisos = validar_todo(raiz, cfg)
    datos_panel = {
        "generado": hoy.isoformat(),
        "redes": {k: {kk: v[kk] for kk in ("skill", "repo", "cuenta", "activa", "cadencia", "fuente_cadencia")} for k, v in cfg["redes"].items()},
        "ideas": ideas, "calendario": items, "semana": semana, "proximas": proximas,
        "pendientes_emi": pendientes, "avisos": avisos,
        "lecciones": [d for _, d in datos["lecciones"]], "experimentos": [d for _, d in datos["experimentos"]],
        "registro": [d for _, d in datos["registro"]], "estados_skills": estados or {},
        "pesos": cfg["pesos"], "pesos_estado": cfg.get("pesos_estado"),
    }
    L = [f"# Tablero de la Matriz de Redes", "", f"Generado el {hoy.isoformat()} por `redes.py tablero`. No se edita a mano.", ""]
    L += ["## Pendiente de Emi", ""] + ([f"- [ ] {p}" for p in pendientes] or ["- Nada por ahora."]) + [""]
    L += ["## Esta semana", "", "| Día y hora | Red | Pieza | Skill | Estado |", "|---|---|---|---|---|"]
    L += [f"| {it['fecha'][:16].replace('T', ' ')} | {it['red']} | {it['titulo']} | {it['skill']} | {it['estado']} |"
          for it in sorted(semana, key=lambda x: x['fecha'])] or ["| — | — | Nada programado | — | — |"]
    L += ["", "## Próximas", ""] + [f"- {it['fecha'][:16].replace('T', ' ')} · {it['red']} · {it['titulo']} ({it['estado']})" for it in proximas] + [""]
    L += ["## Ideas abiertas", ""] + [f"- **{d['id']}** · {d['tesis']} · {d['pilar']} · {d['estado']}" for d in ideas
                                      if d.get("estado") not in ("cerrada", "descartada")] + [""]
    L += ["## Avisos del validador", ""] + ([f"- {a}" for a in avisos] or ["- Ninguno."]) + [""]
    if estados:
        L += ["## Estado de cada skill", "", "| Skill | Leído | Publicados | Lecciones |", "|---|---|---|---|"]
        for k, e in estados.items():
            if isinstance(e, dict) and "error" not in e:
                L.append(f"| {k} | {e.get('actualizado', '?')} | {len(e.get('publicados', []))} | {len(e.get('lecciones', []))} |")
            else:
                L.append(f"| {k} | no se pudo leer | — | — |")
        L.append("")
    return "\n".join(L), datos_panel


def leer_estados(cfg: dict, timeout: int = 15) -> dict:
    """Lee red/estado.json de cada skill de red en GitHub (público). Sin red, deja el error anotado."""
    import urllib.request
    out = {}
    for red, rc in cfg["redes"].items():
        repo = rc.get("repo", "")
        url = f"https://raw.githubusercontent.com/{repo}/main/red/estado.json"
        try:
            with urllib.request.urlopen(url, timeout=timeout) as r:
                d = json.loads(r.read().decode("utf-8"))
            errs = validar_contrato(d)
            out[red] = d if not errs else {"error": "; ".join(errs[:3])}
        except Exception as e:  # noqa: BLE001 — se anota y se sigue con las demás
            out[red] = {"error": f"{type(e).__name__}: {e}"[:200]}
    return out


# ---------------------------------------------------------------- CLI

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="orden", required=True)
    v = sub.add_parser("validar"); v.add_argument("--raiz", default=".")
    pu = sub.add_parser("puntuar"); pu.add_argument("idea"); pu.add_argument("--raiz", default="."); pu.add_argument("--contexto")
    co = sub.add_parser("contrato"); co.add_argument("archivo")
    tx = sub.add_parser("texto"); tx.add_argument("archivo"); tx.add_argument("--red", required=True)
    ta = sub.add_parser("tablero"); ta.add_argument("--raiz", default="."); ta.add_argument("--leer-skills", action="store_true")
    ta.add_argument("--hoy")
    hu = sub.add_parser("huella"); hu.add_argument("texto")
    a = ap.parse_args(argv)
    cfg = cargar_config()
    if a.orden == "validar":
        errs = validar_todo(Path(a.raiz), cfg)
        for e in errs:
            print("✗", e)
        print("✓ todo en orden" if not errs else f"{len(errs)} error(es)")
        return 1 if errs else 0
    if a.orden == "puntuar":
        datos = cargar_todo(Path(a.raiz))
        idea = next((d for _, d in datos["ideas"] if d.get("id") == a.idea), None)
        if not idea:
            print(f"✗ no existe la idea {a.idea}"); return 1
        ctx = json.loads(Path(a.contexto).read_text(encoding="utf-8")) if a.contexto else {}
        ctx.setdefault("publicados", [d for _, d in datos["registro"]])
        print(json.dumps(puntuar(idea, cfg, ctx), ensure_ascii=False, indent=2))
        return 0
    if a.orden == "contrato":
        errs = validar_contrato(leer_json(Path(a.archivo)))
        for e in errs:
            print("✗", e)
        print("✓ contrato válido" if not errs else f"{len(errs)} error(es)")
        return 1 if errs else 0
    if a.orden == "texto":
        errores, avisos = validar_texto(Path(a.archivo).read_text(encoding="utf-8"), a.red, cfg)
        for e in errores:
            print("✗", e)
        for w in avisos:
            print("⚠", w)
        print("✓ sin errores" if not errores else f"{len(errores)} error(es)")
        return 1 if errores else 0
    if a.orden == "tablero":
        raiz = Path(a.raiz)
        estados = leer_estados(cfg) if a.leer_skills else None
        md, dp = generar_tablero(raiz, cfg, dia(a.hoy) if a.hoy else None, estados)
        (raiz / "TABLERO.md").write_text(md + "\n", encoding="utf-8")
        (raiz / "panel").mkdir(exist_ok=True)
        (raiz / "panel" / "datos.json").write_text(json.dumps(dp, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print("✓ TABLERO.md y panel/datos.json")
        return 0
    if a.orden == "huella":
        print(huella(a.texto)); return 0
    return 2


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Fallo as e:
        print("✗", e)
        sys.exit(1)
