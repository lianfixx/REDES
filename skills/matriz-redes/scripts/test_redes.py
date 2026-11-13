"""Pruebas de redes.py: python3 -m unittest discover -s skills/matriz-redes/scripts -p 'test_*.py'"""
import copy
import datetime as dt
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import redes as R  # noqa: E402

CFG = R.cargar_config()
RAIZ = Path(__file__).resolve().parents[3]
R0 = {"nivel": 0, "motivo": "prueba"}


def idea(**k):
    d = {"id": "i1", "fecha_alta": "2026-11-13", "origen": "emi", "espacio": "personal", "pilar": "ia-derecho",
         "tesis": "Una tesis de prueba.", "tipo": "perenne", "riesgo_juridico": R0, "riesgo_politico": R0,
         "riesgo_reputacional": R0, "estado": "propuesta"}
    d.update(k)
    return d


def item(i, fecha, red="x", **k):
    d = {"id": i, "fecha": fecha, "red": red, "skill": "s", "estado": "borrador", "titulo": "t"}
    d.update(k)
    return d


class Idea(unittest.TestCase):
    def test_valida(self):
        self.assertEqual(R.validar_idea(idea(), CFG), [])

    def test_enums(self):
        for campo, valor in [("origen", "x"), ("espacio", "castorenita"), ("pilar", "cocina"), ("tipo", "rumor"), ("estado", "lista")]:
            self.assertTrue(R.validar_idea(idea(**{campo: valor}), CFG), campo)

    def test_noticia_sin_caducidad(self):
        self.assertTrue(any("caduca" in e for e in R.validar_idea(idea(tipo="noticia"), CFG)))

    def test_caduca_antes_de_alta(self):
        self.assertTrue(R.validar_idea(idea(tipo="noticia", caduca="2026-11-01"), CFG))

    def test_politica_sin_postura(self):
        self.assertTrue(any("postura_emi" in e for e in R.validar_idea(idea(pilar="politica", estado="decidida"), CFG)))
        self.assertEqual(R.validar_idea(idea(pilar="politica", estado="propuesta"), CFG), [])
        ok = idea(pilar="politica", estado="decidida", postura_emi={"texto": "x", "fuente": "chat"})
        self.assertEqual(R.validar_idea(ok, CFG), [])

    def test_riesgo_fuera_de_rango(self):
        for v in (4, -1, "2", None):
            self.assertTrue(R.validar_idea(idea(riesgo_politico={"nivel": v, "motivo": "m"}), CFG), v)
        self.assertTrue(R.validar_idea(idea(riesgo_politico={"nivel": 1}), CFG))

    def test_derecho_sin_fuente_oficial(self):
        d = idea(evidencia=[{"fuente": "blog", "nivel": "terceros", "tipo": "derecho"}])
        self.assertTrue(any("oficial" in e for e in R.validar_idea(d, CFG)))

    def test_descartada_sin_motivo(self):
        self.assertTrue(R.validar_idea(idea(estado="descartada"), CFG))

    def test_costo_negativo(self):
        self.assertTrue(R.validar_idea(idea(costo={"minutos_emi": -5}), CFG))

    def test_autoria_ia(self):
        self.assertTrue(any("IA" in e for e in R.validar_idea(idea(tesis="Este video lo hizo una IA"), CFG)))
        self.assertEqual(R.validar_idea(idea(tesis="Construí una herramienta con IA"), CFG), [])


class Decision(unittest.TestCase):
    def base(self, **k):
        d = {"id": "d1", "fecha": "2026-11-13", "idea": "i1", "razonamiento": "r", "decidio": "regla",
             "piezas": [{"red": "x", "formato": "texto", "skill": "x-viral", "fecha_objetivo": "2026-11-17"}]}
        d.update(k)
        return d

    def test_regla_sin_riesgo(self):
        self.assertEqual(R.validar_decision(self.base(), {"i1": idea()}, CFG), [])

    def test_regla_no_decide_riesgo_politica_costo_espacio(self):
        for i in (idea(riesgo_reputacional={"nivel": 2, "motivo": "m"}), idea(pilar="politica"),
                  idea(costo={"creditos_kie": 8}), idea(espacio="milla")):
            self.assertTrue(any("decide Emi" in e for e in R.validar_decision(self.base(), {"i1": i}, CFG)))

    def test_emi_sin_fuente(self):
        self.assertTrue(R.validar_decision(self.base(decidio="emi"), {"i1": idea()}, CFG))
        self.assertEqual(R.validar_decision(self.base(decidio="emi", fuente_emi="chat"), {"i1": idea()}, CFG), [])

    def test_idea_inexistente_y_red_inexistente(self):
        self.assertTrue(R.validar_decision(self.base(), {}, CFG))
        mal = self.base(piezas=[{"red": "myspace", "formato": "a", "skill": "s", "fecha_objetivo": "x"}])
        self.assertTrue(R.validar_decision(mal, {"i1": idea()}, CFG))

    def test_alternativas_exigen_gano_perdio(self):
        d = self.base(alternativas=[{"opcion": "x", "puntuacion": 50}])
        self.assertTrue(any("ganó" in e for e in R.validar_decision(d, {"i1": idea()}, CFG)))


class Calendario(unittest.TestCase):
    def test_cadencia_x(self):
        cal = {"semana": "2026-W47", "items": [item("a", "2026-11-17T09:00:00-06:00"), item("b", "2026-11-17T11:00:00-06:00")]}
        self.assertTrue(any("separación" in e for e in R.validar_calendario(cal, CFG)))
        cal["items"].append(item("c", "2026-11-17T20:00:00-06:00"))
        self.assertTrue(any("tope diario" in e for e in R.validar_calendario(cal, CFG)))

    def test_separacion_ok(self):
        cal = {"semana": "2026-W47", "items": [item("a", "2026-11-17T09:00:00-06:00"), item("b", "2026-11-17T13:00:00-06:00")]}
        self.assertEqual(R.validar_calendario(cal, CFG), [])

    def test_tope_semanal_linkedin(self):
        its = [item(str(i), f"2026-11-{16 + i}T08:30:00-06:00", red="linkedin") for i in range(3)]
        self.assertTrue(any("tope semanal" in e for e in R.validar_calendario({"semana": "2026-W47", "items": its}, CFG)))

    def test_cancelada_no_cuenta(self):
        its = [item("a", "2026-11-17T09:00:00-06:00"), item("b", "2026-11-17T10:00:00-06:00", estado="cancelada")]
        self.assertEqual(R.validar_calendario({"semana": "2026-W47", "items": its}, CFG), [])

    def test_fecha_sin_zona(self):
        self.assertTrue(any("zona" in e for e in R.validar_calendario({"semana": "2026-W47", "items": [item("a", "2026-11-17T09:00")]}, CFG)))

    def test_minutos_emi(self):
        its = [item("a", "2026-11-17T09:00:00-06:00", minutos_emi=100), item("b", "2026-11-18T09:00:00-06:00", minutos_emi=50)]
        self.assertTrue(any("tope es 120" in e for e in R.validar_calendario({"semana": "2026-W47", "items": its}, CFG)))
        self.assertEqual(R.validar_calendario({"semana": "2026-W47", "tope_minutos_emi": 180, "items": its}, CFG), [])

    def test_mismo_texto_en_dos_redes(self):
        t = "Construí una herramienta que lee el DOF completo cada martes y jueves."
        its = [item("a", "2026-11-17T09:00:00-06:00", texto=t), item("b", "2026-11-18T09:00:00-06:00", red="linkedin", texto=t + " ")]
        self.assertTrue(any("mismo texto" in e for e in R.validar_calendario({"semana": "2026-W47", "items": its}, CFG)))

    def test_texto_cambiado_tras_aprobar(self):
        it = item("a", "2026-11-17T09:00:00-06:00", texto="hola", estado="aprobada", aprobado_huella=R.huella("hola"))
        self.assertEqual(R.validar_calendario({"semana": "2026-W47", "items": [it]}, CFG), [])
        it["texto"] = "hola!"
        self.assertTrue(any("huella" in e for e in R.validar_calendario({"semana": "2026-W47", "items": [it]}, CFG)))

    def test_id_repetido_y_red_mala(self):
        its = [item("a", "2026-11-17T09:00:00-06:00"), item("a", "2026-11-19T09:00:00-06:00"), item("c", "2026-11-19T09:00:00-06:00", red="orkut")]
        errs = R.validar_calendario({"semana": "2026-W47", "items": its}, CFG)
        self.assertTrue(any("repetido" in e for e in errs) and any("orkut" in e for e in errs))

    def test_autoria_en_calendario(self):
        it = item("a", "2026-11-17T09:00:00-06:00", texto="Nadie lo editó: magia")
        self.assertTrue(R.validar_calendario({"semana": "2026-W47", "items": [it]}, CFG))


class Auditoria(unittest.TestCase):
    """Casos de la auditoría independiente del 13/11/2026."""

    def test_autoria_variantes(self):
        for malo in ["Hecho por I.A.", "Lo hizo la IA", "Escrito con inteligencia artificial", "Redactado por IA", "Lo hizo ChatGPT",
                     "hecho con IA", "creado con IA", "L0 hizo una IA", "Nadie lo editó", "Claude lo escribió"]:
            self.assertTrue(R.autoria_ia(malo), malo)
        for bueno in ["Construí con IA un monitor del DOF.", "Armé una IA que revisa el DOF", "Creo que la IA no reemplaza criterio",
                      "La IA reemplaza tareas, no criterio", "Uso Claude para leer y resumir."]:
            self.assertFalse(R.autoria_ia(bueno), bueno)
        self.assertTrue(R.validar_idea(idea(activos_necesarios=["video hecho por IA"]), CFG), "revisa todos los campos")
        e, _ = R.validar_texto("Trabajo en C.a.s.t.o.r.e.n.a", "x", CFG)
        self.assertTrue(e)

    def test_dia_en_hora_de_mexico(self):
        # 23:30 del 17 en México escrito en UTC es el 18; tres X el mismo día de México deben chocar con el tope de 2.
        its = [item("a", "2026-11-17T08:00:00-06:00"), item("b", "2026-11-17T13:00:00-06:00"), item("c", "2026-11-18T05:30:00Z")]
        self.assertTrue(any("tope diario" in e for e in R.validar_calendario({"semana": "2026-W47", "items": its}, CFG)))

    def test_semana_equivocada(self):
        its = [item("a", "2027-03-01T09:00:00-06:00")]
        self.assertTrue(any("no cae en la semana" in e for e in R.validar_calendario({"semana": "2026-W47", "items": its}, CFG)))

    def test_separacion_entre_archivos(self):
        with tempfile.TemporaryDirectory() as t:
            (Path(t) / "calendario").mkdir()
            (Path(t) / "calendario" / "a.json").write_text(json.dumps({"semana": "2026-W47", "items": [item("a", "2026-11-22T22:00:00-06:00")]}))
            (Path(t) / "calendario" / "b.json").write_text(json.dumps({"semana": "2026-W48", "items": [item("b", "2026-11-23T00:30:00-06:00")]}))
            self.assertTrue(any("separación" in e for e in R.validar_todo(Path(t), CFG)))

    def test_requiere_emi_por_cualquier_costo(self):
        self.assertTrue(R.requiere_emi(idea(costo={"creditos_fish": 500}), CFG))
        self.assertTrue(R.requiere_emi(idea(costo={"minutos_emi": 300}), CFG))
        self.assertEqual(R.requiere_emi(idea(costo={"minutos_emi": 30}), CFG), [])

    def test_datos_rotos_no_tumban(self):
        with tempfile.TemporaryDirectory() as t:
            (Path(t) / "calendario").mkdir()
            (Path(t) / "calendario" / "a.json").write_text(json.dumps({"semana": "2026-W47", "items": [item("a", "mañana", minutos_emi="diez")]}))
            (Path(t) / "decisiones").mkdir()
            (Path(t) / "decisiones" / "d.json").write_text(json.dumps({"id": "d", "fecha": "2026-11-13", "idea": "x", "piezas": ["x"], "razonamiento": "r", "decidio": "emi", "fuente_emi": "f"}))
            errs = R.validar_todo(Path(t), CFG)
            self.assertTrue(errs)
            md, dp = R.generar_tablero(Path(t), CFG, hoy=dt.date(2026, 11, 13))
            self.assertIn("Avisos", md)

    def test_validadores_flojos(self):
        self.assertTrue(R.validar_experimento({"id": "e", "hipotesis": "h", "red": "x", "variable": "v", "metrica": "m", "duracion_min_dias": "3", "inicio": "2026-11-13", "estado": "en curso"}))
        self.assertTrue(R.validar_leccion({"id": "l", "fecha": "ayer", "que_paso": "q", "evidencia": "e", "regla": "r", "alcance": "red", "para": ["x"]}))
        malo = dict(CFG, pesos=dict(CFG["pesos"], encaje=-1))
        with self.assertRaises(R.Fallo):
            R.puntuar(idea(), malo)


class Contrato(unittest.TestCase):
    BASE = {"contrato": "redes-estado/0.1", "skill": "linkedin", "actualizado": "2026-11-13"}

    def test_minimo(self):
        self.assertEqual(R.validar_contrato(dict(self.BASE)), [])

    def test_errores(self):
        for mal in ({"contrato": "otro/1"}, {"publicados": {}}, {"cadencia": {"max_por_dia": -1}},
                    {"cadencia": {"certeza": "estudio"}}, {"publicados": [{"id": "a", "fecha": "2026-11-13"}]},
                    {"lecciones": [{"texto": "x", "alcance": "universo"}]}):
            d = dict(self.BASE); d.update(mal)
            self.assertTrue(R.validar_contrato(d), mal)

    def test_completo(self):
        d = dict(self.BASE, cadencia={"max_por_dia": 1, "separacion_min_h": 24, "max_por_semana": 2, "certeza": "criterio"},
                 publicados=[{"id": "a", "fecha": "2026-11-13T08:30:00-06:00", "metricas": {"valores": {"impresiones": 10}}}],
                 lecciones=[{"texto": "x", "alcance": "red"}])
        self.assertEqual(R.validar_contrato(d), [])


class Texto(unittest.TestCase):
    def test_reglas(self):
        e, _ = R.validar_texto("Lo armó una IA en dos minutos", "x", CFG)
        self.assertTrue(e)
        e, _ = R.validar_texto("Trabajo en Castorena", "linkedin", CFG)
        self.assertTrue(e)
        e, _ = R.validar_texto("Comenta DOF y te mando el reporte", "linkedin", CFG)
        self.assertTrue(e)
        e, w = R.validar_texto("Construí con IA un monitor del DOF.", "x", CFG)
        self.assertEqual(e, [])
        e, _ = R.validar_texto("a" * 300, "x", CFG)
        self.assertTrue(e)
        e, _ = R.validar_texto("ver https://emilianomilla.site " + "a" * 250, "x", CFG)
        self.assertEqual(e, [], "un enlace cuenta 23 en X")

    def test_huella_igual_a_xviral(self):
        self.assertEqual(R.huella("  Hola\n"), R.huella("Hola"))
        self.assertEqual(len(R.huella("x")), 12)


class Puntuacion(unittest.TestCase):
    def test_orden_y_explicacion(self):
        ctx = {"encaje": {"x": 0.9, "linkedin": 0.3}, "objetivo": {"x": 0.8, "linkedin": 0.4}}
        r = R.puntuar(idea(), CFG, ctx, hoy=dt.date(2026, 11, 13))
        self.assertEqual(r[0]["red"], "x")
        self.assertTrue(all(set(x["criterios"]) == set(R.CRITERIOS) for x in r))
        self.assertTrue(all(0 <= x["puntuacion"] <= 100 for x in r))

    def test_riesgo_baja_y_obliga_a_emi(self):
        a = R.puntuar(idea(), CFG, hoy=dt.date(2026, 11, 13))[0]["puntuacion"]
        mala = idea(riesgo_reputacional={"nivel": 3, "motivo": "m"})
        r = R.puntuar(mala, CFG, hoy=dt.date(2026, 11, 13))
        self.assertLess(r[0]["puntuacion"], a)
        self.assertEqual(r[0]["decide"], "emi")

    def test_urgencia(self):
        hoy = dt.date(2026, 11, 13)
        pronto = R.puntuar(idea(tipo="noticia", caduca="2026-11-14"), CFG, hoy=hoy)[0]["criterios"]["urgencia"]["valor"]
        tarde = R.puntuar(idea(tipo="noticia", caduca="2026-12-30"), CFG, hoy=hoy)[0]["criterios"]["urgencia"]["valor"]
        vieja = R.puntuar(idea(tipo="noticia", caduca="2026-11-01"), CFG, hoy=hoy)[0]["criterios"]["urgencia"]["valor"]
        self.assertGreater(pronto, tarde); self.assertEqual(vieja, 0.0)

    def test_novedad_y_balance(self):
        hoy = dt.date(2026, 11, 13)
        ctx = {"textos": {"x": ["Una tesis de prueba."]},
               "publicados": [{"red": "x", "pilar": "ia-derecho", "fecha": "2026-11-10"}, {"red": "x", "pilar": "ia-derecho", "fecha": "2099-01-01"}]}
        c = R.puntuar(idea(), CFG, ctx, hoy=hoy)
        x = next(s for s in c if s["red"] == "x")["criterios"]
        self.assertEqual(x["novedad"]["valor"], 0.0)
        self.assertEqual(x["balance"]["valor"], 0.0)  # el de 2099 no cuenta

    def test_pesos_suman_uno(self):
        self.assertAlmostEqual(sum(CFG["pesos"].values()), 1.0)


class Repositorio(unittest.TestCase):
    def test_repo_y_ejemplo_validan(self):
        self.assertEqual(R.validar_todo(RAIZ, CFG), [])
        self.assertEqual(R.validar_todo(RAIZ / "ejemplos" / "semana-ficticia", CFG), [])

    def test_ejemplo_marcado_ficticio(self):
        for p in (RAIZ / "ejemplos" / "semana-ficticia").rglob("*.json"):
            self.assertTrue(json.loads(p.read_text())["ficticio"], p)

    def test_tablero(self):
        with tempfile.TemporaryDirectory() as t:
            import shutil
            shutil.copytree(RAIZ / "ejemplos" / "semana-ficticia", t, dirs_exist_ok=True)
            md, dp = R.generar_tablero(Path(t), CFG, hoy=dt.date(2099, 1, 6))
            self.assertIn("Pendiente de Emi", md)
            self.assertEqual(len(dp["semana"]), 3)
            self.assertTrue(any("Aprobar" in p["que"] and p["prioridad"] == 1 for p in dp["pendientes_emi"]))

    def test_json_invalido(self):
        with tempfile.TemporaryDirectory() as t:
            (Path(t) / "ideas").mkdir()
            (Path(t) / "ideas" / "x.json").write_text("{malo")
            self.assertTrue(R.validar_todo(Path(t), CFG))


if __name__ == "__main__":
    unittest.main()
