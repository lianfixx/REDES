# REDES · Matriz de Redes de Emi

La capa de decisión por encima de las skills de cada red (X, LinkedIn, TikTok, Instagram) y de video (Vox Studio, Pizarra Studio, Editor Studio, MILLA Video Studio, Historias Studio). Registra las ideas, decide en qué red y formato sale cada una, arma el calendario de todas las redes, junta los resultados y lecciones y se los devuelve a cada skill.

No escribe el post final de ninguna red, no produce video y no entra a ninguna cuenta de Emi. Es un sistema hijo de la Matriz General (`lianfixx/MATRIZ`), en el cerebro «Contenido y video».

**Estado: 0.1.0 (13/11/2026).** Probado: validador, puntuación, calendario, tablero (39 pruebas) y el Worker del panel con llamadas simuladas (11 pruebas). **No probado todavía contra las redes reales:** publicar en X y LinkedIn por API depende de que Emi pegue sus llaves y conecte LinkedIn en el panel.

| Ruta | Qué es |
|---|---|
| [`skills/matriz-redes/SKILL.md`](skills/matriz-redes/SKILL.md) | La skill: reglas, flujo y a dónde ir |
| [`TABLERO.md`](TABLERO.md) | Lo pendiente de Emi, la semana, ideas y avisos (generado cada día) |
| `panel/`, `worker/` | Panel con contraseña: ver, editar, aprobar y publicar piezas; ideas, crecimiento, métricas, recursos |
| `ideas/`, `decisiones/`, `calendario/`, `registro/`, `lecciones/`, `experimentos/` | Los datos de la Matriz ([datos.md](skills/matriz-redes/references/datos.md)) |
| `crecimiento/` | Qué funciona en cada red, con fuente y certeza; recursos y pasos |
| `docs/` | Contrato con las skills, decisiones de Emi, respuestas de las skills, auditorías |
| `peticiones/` | Lo que se pidió a cada skill y su estado |
| `ejemplos/semana-ficticia/` | Semana inventada de punta a punta que pasa el validador |
| `ia/` | Protocolo, reglas y control (`python3 ia/verificar.py ci`) |
| `privado/` | Borradores sin publicar. **No se sube**: el repositorio es público |

```bash
python3 skills/matriz-redes/scripts/redes.py validar      # todo en orden
python3 skills/matriz-redes/scripts/redes.py puntuar ID   # ordena las redes para una idea, con el porqué
python3 skills/matriz-redes/scripts/redes.py tablero      # TABLERO.md y panel/datos.json
python3 ia/verificar.py ci                                # control completo
```
