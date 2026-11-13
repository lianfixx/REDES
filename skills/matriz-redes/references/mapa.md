# Quién lee y quién escribe cada archivo

| Archivo | Escribe | Lee |
|---|---|---|
| `ideas/`, `decisiones/`, `calendario/`, `lecciones/`, `experimentos/` | La Matriz (sesión de Claude) con lo que decide Emi | Validador, tablero, panel |
| `registro/` | La Matriz, con métricas del panel o de Emi | Puntuación (balance), tablero |
| `docs/DECISIONES-EMI-*.md` | La Matriz, con las palabras de Emi | Todas las IA |
| `docs/CONTRATO-ESTADO.md` | La Matriz | Skills de red y video |
| `red/estado.json` (en el repositorio de cada skill) | Cada skill, en su repositorio | La actualización diaria de la Matriz |
| `peticiones/` | La Matriz | Cualquier IA (qué se pidió y a quién) |
| `crecimiento/redes.json` | La Matriz, con lo que declara cada skill | Panel → Crecer |
| `crecimiento/recursos.json` | La Matriz | Panel → Recursos |
| `TABLERO.md`, `panel/datos.json` | Actualización diaria (generados) | Emi, panel |
| KV del panel (piezas, notas, encargos, credenciales cifradas) | Emi en el panel; Claude con su llave (solo borradores y notas) | Panel, cron |
| `skills/matriz-redes/data/config.json` | A mano, con visto bueno de Emi | Validador, puntuación |

Nadie escribe en el repositorio de otra skill. La única excepción prevista: pedir a `lianfixx/MATRIZ` que registre este repositorio en el cerebro «Contenido y video».
