# Registro de cambios

Lo más reciente arriba. Formato en `ia/PROTOCOLO.md`, sección 3.

## 2026-11-13 · Núcleo de la Matriz: validador, puntuación, calendario y tablero
- Agente: Claude Code (sesión en la nube)
- Solicitud: encargo de la Matriz de Redes (secciones 4 y 5) y Emi, 13/11/2026: «que todo quede en el panel, claro, y que no se pierda en conversaciones».
- Cambios: `skills/matriz-redes/scripts/redes.py` (sin dependencias) valida ideas, decisiones, calendario (cadencia por red, separación, tope de minutos de Emi, texto repetido entre redes, huella de aprobación), registro, lecciones, experimentos y el contrato `red/estado.json`; revisa textos (regla de autoría, despacho, anzuelos); puntúa redes por 8 criterios con pesos en `data/config.json` (PROPUESTA, sin aprobar) y explica cada criterio; genera `TABLERO.md` y `panel/datos.json`. Datos reales de la campaña de lanzamiento (idea, decisión de Emi, calendario W46-W48, sin textos sin publicar). Semana ficticia de 2099 en `ejemplos/`.
- Archivos: `skills/matriz-redes/{scripts/redes.py,scripts/test_redes.py,data/config.json}`, `ideas/`, `decisiones/`, `calendario/`, `ejemplos/semana-ficticia/`, `TABLERO.md`, `panel/datos.json`, este registro.
- Verificación: `python3 -m unittest discover -s skills/matriz-redes/scripts -p 'test_*.py'` → aprobado (39 pruebas); `redes.py validar` y `--raiz ejemplos/semana-ficticia` → aprobado.
- Pendiente: panel con publicación por API (X y LinkedIn), workflows, SKILL.md, auditoría independiente; pesos por aprobar por Emi.

## 2026-11-13 · Regla «nunca decir que lo armó una IA» en las respuestas de las skills
- Agente: Claude Code (sesión en la nube)
- Solicitud: Emi, 13/11/2026, chat de esta sesión.
- Cambios: se anota cómo aplicaron X, Vox e Instagram la regla absoluta de Emi.
- Archivos: `docs/RESPUESTAS-SKILLS-2026-11-13.md`, este registro.
- Verificación: no aplica (solo documentación).
- Pendiente: confirmar con Emi el panel de publicación.

## 2026-11-13 · Arranque de la Matriz de Redes
- Agente: Claude Code (sesión en la nube)
- Solicitud: Emi, 13/11/2026, por medio de la sesión de X: construir la Matriz de Redes; luego, en el chat de esta sesión, la campaña de lanzamiento «lo que construí uniendo IA y Derecho».
- Cambios: estructura inicial; contrato de estado entre skills `redes-estado/0.1.1` (borrador, adoptado por LinkedIn e Instagram); tres rondas de decisiones de Emi; respuestas de X, Instagram, LinkedIn y Vox; peticiones enviadas a seis sesiones; idea de la campaña de lanzamiento.
- Archivos: `README.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `CHANGELOG.md`, `.gitignore`, `ia/PROTOCOLO.md`, `docs/*`, `ideas/*`, `peticiones/*`.
- Verificación: mensajes entre sesiones → entregados (lo confirma la herramienta); saldos de Kie y ElevenLabs → leídos por API el 13/11; esquema, validador y pruebas → no ejecutado (aún no existen).
- Pendiente: esquema JSON y validador con pruebas; puntuación; calendario; tablero; workflows; registro en la Matriz General; confirmar con Emi el panel de publicación por API; respuestas de TikTok y Editor Studio.
