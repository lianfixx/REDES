# Registro de cambios

Lo más reciente arriba. Formato en `ia/PROTOCOLO.md`, sección 3.

## 2026-11-13 · Panel conectado a Cloudflare
- Agente: Claude Code (sesión en la nube)
- Solicitud: Emi, 13/11/2026: construir y publicar el panel.
- Cambios: KV «redes» creado en la cuenta de Cloudflare de Emi con la llave «Proyectos de Emi (cf y wrangler)» de su computadora virtual; secretos de Actions del repositorio (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CIFRADO, ALTA, CLAUDE_LLAVE) puestos por API desde la computadora virtual, sin imprimir ningún valor; copia de CIFRADO, ALTA y CLAUDE_LLAVE en `~/.config/matriz/redes-*` (solo lectura de su usuario). `wrangler.jsonc` con el id del KV.
- Archivos: `wrangler.jsonc`, este registro.
- Verificación: API de Cloudflare → KV creado; API de GitHub → 5 secretos creados; despliegue → lo hace el workflow «Publicar panel» con este push.
- Pendiente: comprobar el despliegue; enlace de alta para Emi.

## 2026-11-13 · Matriz de Redes 0.1.0: panel con aprobación y publicación, skill y control
- Agente: Claude Code (sesión en la nube)
- Solicitud: Emi, 13/11/2026, en el chat de esta sesión: construir el panel (sí), publicar desde ahí en X y, si se puede, LinkedIn (sí), llaves pegadas una vez (sí); que el panel tenga recursos, pasos, seguimiento, métricas, ideas, cosas por red, Drive, skills, encargos para continuar, y todo lo de crecimiento (cuándo publicar, horas, post de emergencia, hashtags) alimentándose de lo que sirve.
- Cambios: Worker de Cloudflare (`worker/index.js`): sesión con contraseña creada por Emi con enlace de un solo uso (PBKDF2), límite de intentos, piezas con vista previa, aprobación por huella, publicación por API de X (OAuth 1.0a) y LinkedIn (OAuth 2.0, «Share on LinkedIn»), cron cada 5 min para lo programado y métricas de X a 48 h y 7 días, tope de gasto de X, credenciales cifradas (AES-GCM), notas, encargos y API para Claude que nunca aprueba ni publica. Panel (`panel/`): Hoy, Piezas, Calendario, Ideas, Crecer, Métricas, Recursos, Ajustes; vidrio esmerilado, claro y oscuro. `crecimiento/` con reglas por red y su certeza. Skill `matriz-redes` con referencias (decidir, ciclos, datos, panel, protocolos, mapa) y puentes. Control: `ia/verificar.py`, workflows «Control», «Publicar panel» y «Actualización diaria».
- Archivos: `worker/{index.js,prueba.mjs,package.json}`, `panel/*`, `crecimiento/*`, `tools/{armar.py,despliegue/*}`, `wrangler.jsonc`, `skills/matriz-redes/**`, `.claude/skills/matriz-redes/SKILL.md`, `.agents/skills/matriz-redes/SKILL.md`, `ia/{verificar.py,check_skill.py,REGLAS.md}`, `.github/workflows/*`, `README.md`, `.gitignore`, este registro.
- Verificación: `python3 ia/verificar.py ci` → aprobado (39 pruebas de Python, 11 del Worker con llamadas simuladas, incluida la firma OAuth 1.0a contra el ejemplo de la documentación de X recalculado en Python); publicación real en X y LinkedIn → no ejecutado (faltan llaves de Emi); despliegue en Cloudflare → pendiente en esta misma sesión.
- Pendiente: crear el KV y los secretos, publicar el panel, enlace de alta para Emi, llave de Claude para las sesiones, auditoría independiente, registrar en la Matriz General, aprobación de pesos por Emi.

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
