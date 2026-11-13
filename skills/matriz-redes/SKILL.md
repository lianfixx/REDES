---
name: matriz-redes
description: "Matriz de Redes de Emi: decide en qué red, formato, espacio y fecha sale cada idea; coordina las skills de X, LinkedIn, TikTok, Instagram, historias y video; arma el calendario de todas las redes; junta métricas y lecciones y las devuelve; opera el panel de aprobación y publicación. Usar al pedir qué publicar, dónde o cuándo, la semana o el calendario de redes, el paquete semanal para Emi, un tablero, métricas cruzadas, lecciones entre redes, una crisis o un periodo electoral. No usar para redactar el post final de una red (su skill) ni para producir video (vox-studio, editor-studio, pizarra-studio)."
license: Uso personal de Emiliano García Milla. Sin licencia de reutilización para terceros.
metadata:
  version: "0.1.0"
  release_date: "2026-11-13"
  language: "es-MX"
---

# Matriz de Redes

La capa que decide y coordina por encima de las skills de cada red y de video. No las sustituye: las orquesta, lee su estado y les devuelve lo aprendido. Con terminal, `R` abrevia `python3 skills/matriz-redes/scripts/redes.py` (desde la raíz del repositorio).

## Reglas que no se rompen

1. **Emi decide.** La puntuación ordena y explica; no decide sola lo que tenga riesgo 2 o más, hable de política, gaste créditos o no sea del espacio `personal`. El validador lo hace cumplir.
2. **Ninguna pieza dice que la hizo, la armó o la editó una IA** (Emi, 13/11/2026). Sí se puede decir que Emi construyó herramientas con IA.
3. **Cuenta personal:** nada de Castorena, sus licenciados, INDEP, clientes ni asuntos, ni siquiera anonimizados. Boletines solo con datos inventados y rotulados.
4. **Nadie inicia sesión en las cuentas de Emi.** Solo se publica por la API oficial (X y LinkedIn) lo que Emi aprobó en el panel con esa misma huella de texto.
5. **Cada red, su texto.** Prohibido pegar el mismo texto en dos redes: el panel no deja aprobarlo y el validador lo detecta dentro de cada semana (por parecido de palabras; una paráfrasis cercana puede pasar, así que se revisa también a ojo).
6. **Las reglas de cada red las declara su skill.** Aquí se enlazan, no se copian; una lección de una red pasa a otra solo como hipótesis con experimento.
7. **Nada se inventa:** ni vivencias, ni posturas, ni cifras. Las métricas, en las unidades de cada red.
8. **Repositorio público:** borradores sin publicar, solo en el panel (KV) o en `privado/` (fuera de git).

Lo que Emi decidió y cuándo: [`docs/DECISIONES-EMI-2026-11-13.md`](../../docs/DECISIONES-EMI-2026-11-13.md). Prevalece sobre esta página si cambia.

## Qué leer según el encargo

| Encargo | Leer |
|---|---|
| Decidir dónde y cuándo sale una idea | [decidir.md](references/decidir.md), `data/config.json` |
| Semana, paquete para Emi, ciclos | [ciclos.md](references/ciclos.md) |
| Datos y validador | [datos.md](references/datos.md) |
| Contrato con las skills | [CONTRATO-ESTADO.md](../../docs/CONTRATO-ESTADO.md) |
| Panel (aprobar, publicar, llaves, encargos) | [panel.md](references/panel.md) |
| Crisis, periodo electoral, error de cita, cambio de algoritmo | [protocolos.md](references/protocolos.md) |
| Quién lee y quién escribe cada archivo | [mapa.md](references/mapa.md) |

## Flujo de una idea

1. Registrar la idea en `ideas/` (o la anota Emi en el panel → Ideas). Con riesgo 2+ o política, preguntar a Emi su postura antes de nada.
2. `R puntuar ID` → orden de redes con el porqué de cada criterio. Escribir la decisión en `decisiones/` (qué ganó, qué perdió, quién decidió). Nunca se reescribe: una nueva la reemplaza.
3. Pedir a cada skill su pieza (mensaje entre sesiones + `peticiones/`). La productora de video produce una sola vez; cada red pone su texto.
4. Las piezas llegan al panel (`/api/claude/pieza`) como «lista para aprobar». Emi aprueba; X y LinkedIn salen por API a su hora; TikTok e Instagram se copian a la app.
5. Calendario en `calendario/AAAA-Wnn.json` y `R validar` (cadencia de cada skill, separación, tope de minutos de Emi, textos repetidos).
6. Métricas: X sola a las 48 h y 7 días; las demás, captura de Emi en el panel. Lección en `lecciones/`, a la skill que corresponda.

## Terminado

Una pieza: aprobada por Emi con huella, publicada, medida y con su lección. Un cambio en el repositorio: `python3 ia/verificar.py ci` aprobado y entrada en `CHANGELOG.md` con `Agente:`.
