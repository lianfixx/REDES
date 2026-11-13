# Cómo decide la Matriz

`redes.py puntuar ID` calcula, para cada red activa, una puntuación de 0 a 100 con 8 criterios y dice por qué. **Ordena y explica; no decide sola** lo que tenga riesgo 2 o más, hable de política, gaste créditos o salga de un espacio que no sea `personal`: eso lo decide Emi (`requiere_emi`).

| Criterio | Qué mide | De dónde sale | Peso propuesto | Por qué ese peso |
|---|---|---|---|---|
| encaje | Qué tan bien premia esa red ese formato y tema | Lo que declara **la skill de la red** (nunca deducido aquí); sin dato, 0.5 neutro | 0.20 | Es lo que más cambia el resultado entre redes |
| objetivo | Cuánto aporta a los objetivos de Emi en esa red | Emi: marca personal > influencia política > comunidad; en LinkedIn, autoridad y red/oportunidades | 0.20 | Lo que Emi quiere manda tanto como el algoritmo |
| balance | Déficit del pilar en esa red en 30 días | `registro/` y `red/estado.json` | 0.10 | Evita que una red se vuelva monotema |
| capacidad | Cupos libres en la semana según la cadencia de la skill | `calendario/` + `config.json` | 0.10 | Sin cupo, la pieza se mueve, no se amontona |
| costo | Minutos de Emi y créditos | `costo` de la idea | 0.10 | El tiempo de Emi es el recurso más escaso |
| riesgo | Máximo de los tres riesgos (0-3) | La idea | 0.10 | Además del peso, con 2+ decide Emi |
| novedad | Parecido con lo ya publicado en esa red | Textos publicados | 0.10 | Repetirse cansa a la audiencia y al algoritmo |
| urgencia | Cuánto falta para que caduque | `caduca` | 0.10 | Una noticia vieja no sirve |

**Estado de los pesos: propuesta del 13/11/2026, sin aprobar por Emi** (`pesos_estado` en `config.json`). Cambiarlos requiere su visto bueno y una entrada en `CHANGELOG.md`. La revisión mensual propone ajustes con evidencia.

## Reglas fijas de reparto

- Una idea puede salir en varias redes; cada una con su adaptación y su skill.
- El video lo produce una sola vez la productora (Vox, Editor, Pizarra, MILLA Video). Si una pieza va a varias redes, la Matriz ordena la salida: la cuenta con más público primero; nunca el mismo día en dos redes si el gancho es el mismo.
- Lo de MILLA, Castorena y PAN no sale en las cuentas personales salvo decisión expresa de Emi para esa pieza.
- Toda decisión escribe qué ganó, qué perdió y por qué (`gano`, `perdio`, `razonamiento`); el validador lo exige si hubo alternativas.
