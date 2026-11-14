# Registro de cambios

Lo más reciente arriba. Formato en `ia/PROTOCOLO.md`, sección 3.

## 2026-11-14 · La Matriz puede mover la hora de piezas ya aprobadas
- Agente: Claude Code (sesión en la nube)
- Solicitud: Emi, 14/11/2026, en el chat de la Matriz: opción «B» (que la Matriz mueva horarios de piezas aprobadas sin tocar texto ni video); antes, en x-viral: «HAZLO TÚ, TODO TIENE QUE ESTAR AUTOMATIZADO».
- Cambios: `POST /api/claude/pieza/<id>/fecha {fecha, motivo}` mueve la hora de una pieza aprobada y sin cambios (solo al futuro, máximo 60 días, con motivo obligatorio, no si está en pausa); recalcula la huella con la fecha nueva y lo anota en historial, notas de la pieza y bitácora. El estado de Claude informa si X tiene permiso de archivos. Regla 3 de `AGENTS.md` con la excepción.
- Archivos: `worker/{index.js,prueba.mjs}`, `AGENTS.md`, `skills/matriz-redes/references/panel.md`, `docs/DECISIONES-EMI-2026-11-13.md`, este registro.
- Verificación: `python3 ia/verificar.py ci` → aprobado (28 pruebas del Worker, 1 nueva).
- Pendiente: Emi sube el video del DOF al panel o lo publica desde la app el domingo.

## 2026-11-13 · Ángulos de los cuatro videos, aprobados por Emi
- Agente: Claude Code (sesión en la nube)
- Solicitud: Editor Studio pidió el ángulo de cada video para escribir guiones y ganchos; Emi: «Están perfectos así».
- Cambios: quedan registrados los ángulos de Matriz, DOF, Boletines y Vox (opinión y pregunta final de cada uno) y se enviaron a Editor Studio como decisión de Emi.
- Archivos: `docs/DECISIONES-EMI-2026-11-13.md`, este registro.
- Verificación: `python3 ia/verificar.py ci` → aprobado.
- Pendiente: guiones y ganchos de Editor Studio; Emi fusiona su PR #9 (lianfixx/VIDEOS-IA-SKILL-MILLA) y reconecta X.

## 2026-11-13 · Panel 0.3: imágenes, videos y PDF por API; análisis automático de inspiración; respuestas a Editor Studio
- Agente: Claude Code (sesión en la nube)
- Solicitud: Emi, 13/11/2026: «Construye y haz todo para imágenes y videos por favor. Haz posible lo de análisis de tu inspiración por favor.» y respuestas a las 9 preguntas de Editor Studio.
- Cambios: archivos en el panel (subida desde el teléfono en partes de 4 MiB, vista previa, descarga, biblioteca en Recursos, borrado automático a los 45 días). Las piezas aprobadas suben sus archivos a la red antes de su hora y publican con ellos: X por `/2/media/upload` (imágenes, GIF y video; pide `media.write`, hay que reconectar X una vez) y LinkedIn por Images, Videos y Documents API (video, PDF como carrusel, 1 a 20 imágenes). La huella de aprobación cubre los archivos. Reglas de cada red, reintentos sin duplicar y tope de llamadas por vuelta del cron. LinkedIn pasa a la versión de API 202610 (la 202511 se apaga el 16/11/2026). Inspiración: el panel guarda título, autor, texto y miniatura del enlace; la «llave de Claude automático» (Ajustes) deja que las revisiones programadas la analicen y propongan espacio. Claude puede subir archivos (`/api/claude/archivo`) y Emi los agrega a una pieza desde «O elige uno ya subido…». Tarea programada «Redes: analizar inspiración del panel» (13:17 y 21:17, hora de México). Decisiones de Emi para Editor Studio registradas y enviadas a su sesión.
- Archivos: `worker/{index.js,prueba.mjs}`, `panel/{app.js,estilo.css}`, `wrangler.jsonc`, `skills/matriz-redes/references/panel.md`, `docs/DECISIONES-EMI-2026-11-13.md`, `.gitignore`, este registro.
- Verificación: `python3 ia/verificar.py ci` → aprobado (27 pruebas del Worker, 7 nuevas: partes y Range, reglas por red, X con imagen y con video en proceso, sin aprobación no se sube nada, 3 fallos esperan a Emi, LinkedIn video/PDF con reintento, llave automática, miniatura de inspiración). Panel probado en local (wrangler dev + Chromium): subida de video, vista previa, descarga con Range, llave y biblioteca; oEmbed real de YouTube y Pinterest con miniatura. Subida real a X y LinkedIn → aún no ejecutada (falta reconectar X y conectar LinkedIn).
- Pendiente: Emi reconecta X (permiso de archivos), crea la llave de Claude automático y la pega en el formulario seguro; conectar LinkedIn.

## 2026-11-13 · Recursos: cómo grabar (de Editor Studio)
- Agente: Claude Code (sesión en la nube)
- Solicitud: respuesta de Editor Studio (13/11, aprobada por Emi) con la guía de grabación de los cuatro videos.
- Cambios: Recursos del panel muestra «Cómo grabar» (encuadre, luz, audio, tomas por video, pantallas y dónde subir).
- Archivos: `crecimiento/recursos.json`, `panel/app.js`, este registro.
- Verificación: `python3 ia/verificar.py ci` → aprobado.
- Pendiente: respuestas de Emi a las preguntas de Editor Studio.

## 2026-11-13 · Panel 0.2: Hoy tipo CRM, piezas en vivo con notas y pausa, hora sugerida, ideas por espacio e inspiración
- Agente: Claude Code (sesión en la nube)
- Solicitud: Emi, 13/11/2026: fecha más bonita y sin la leyenda «que se ve muy IA»; «Lo que necesito de ti» por prioridad, por sesión y ubicable; «Próximas» más clara, «tipo CRM perfecto»; piezas en tiempo real y un apartado para notas o confirmaciones antes de publicar; ideas divididas por espacios (la Matriz propone y él confirma) con enlaces de inspiración (Pinterest, videos) analizados (estilo, redacción, edición) y un campo de «qué me llamó la atención»; fondo blanco o negro minimalista; «cuando apruebe algo, tú escojas hora… todo listo en el panel con horas sugeridas».
- Cambios: Hoy con fecha grande, hora de México, pendientes en Alta/Media/Baja con sesión y enlace «Ir →», actividad reciente y tabla «Próximas» por día con hora, red, pieza, estado y siguiente paso (sin repetir lo que ya está en el panel). Piezas agrupadas por lo que toca (aprobar, subir desde la app, programadas, fallo, borradores, publicadas), actualización cada 20 s sin interrumpir lo que escribes, notas y confirmaciones por pieza (las leen las sesiones de Claude), «Pausar/Reanudar» (el cron no publica en pausa). Hora: Claude puede dejar una hora sugerida con su motivo; al aprobar sin fecha, la Matriz pone esa hora o el siguiente hueco libre según hora base y cadencia de cada red. Ideas por espacio (Personal, MILLA, Castorena, PAN, Por confirmar) con propuesta de la Matriz y botón Confirmar o Mover; Inspiración con enlace, plataforma detectada, «qué me llamó la atención» y análisis (estilo, redacción, edición, gancho, formato, ritmo, música, qué tomar, qué evitar). Pendientes de Emi con prioridad, sesión y lugar. Fondo blanco o negro liso.
- Archivos: `worker/{index.js,prueba.mjs}`, `panel/{app.js,estilo.css,index.html}`, `skills/matriz-redes/scripts/{redes.py,test_redes.py}`, `ideas/2026-11-13-lanzamiento.json`, `calendario/2026-W4{6,7}.json`, este registro.
- Verificación: `python3 ia/verificar.py ci` → aprobado (46 pruebas de Python, 20 del Worker); panel revisado en Chromium con datos de prueba a 1280 y 390 px, blanco y negro: sin errores ni desbordes.
- Pendiente: que la tarea semanal analice la inspiración y proponga espacios (se actualiza su encargo); subir imágenes y video por API.

## 2026-11-13 · X conectado al panel
- Agente: Claude Code (sesión en la nube)
- Solicitud: Emi, 13/11/2026: «creo ya».
- Cambios: pendiente de conectar X resuelto; queda tener créditos en la consola antes de aprobar el lanzamiento.
- Archivos: `ideas/2026-11-13-lanzamiento.json`, este registro.
- Verificación: bitácora del panel → «Conectó X (OAuth 2.0, app confidencial)» a las 17:36:48 UTC; credencial `x2` presente (sin leer su valor). Publicación real → aún no ejecutada.
- Pendiente: primera publicación real cuando Emi apruebe.

## 2026-11-13 · Corrige la prueba de X como app pública
- Agente: Claude Code (sesión en la nube)
- Solicitud: el commit anterior subió con una prueba mal escrita (buscaba el aviso en la primera línea de la bitácora, que es «regreso correcto»); el control quedó en rojo y el panel no se publicó.
- Cambios: la prueba busca el aviso «app pública» en toda la bitácora.
- Archivos: `worker/prueba.mjs`, este registro.
- Verificación: `python3 ia/verificar.py ci` → aprobado (17 pruebas del Worker) antes de subir.
- Pendiente: ninguno.

## 2026-11-13 · X: token como app confidencial o pública
- Agente: Claude Code (sesión en la nube)
- Solicitud: bitácora del panel, 13/11 17:32: «X no entregó el permiso (401: Missing valid authorization header)» al conectar X.
- Cambios: al pedir o renovar el token, si X rechaza la autenticación Basic (Client ID + Secret, app «Web App»), se reintenta una vez como app pública («Native App»: sin secreto, con PKCE). La bitácora anota el modo y, si ambos fallan, los dos motivos.
- Archivos: `worker/{index.js,prueba.mjs}`, este registro.
- Verificación: `node worker/prueba.mjs` → aprobado (17); conexión real → la reintenta Emi.
- Pendiente: si vuelve a fallar con 401 en ambos modos, el Client Secret pegado no es el de OAuth 2.0 o la app no tiene activada la autenticación de usuario.

## 2026-11-13 · Bitácora de conexiones con X y LinkedIn
- Agente: Claude Code (sesión en la nube)
- Solicitud: Emi (vía x-viral, 13/11): «ya hice ambos y no pasa nada» al conectar X.
- Cambios: la bitácora del panel anota cada intento de conexión (inicio, regreso y el error exacto que devuelve X o LinkedIn) y el motivo cuando las llaves 1.0a no se aceptan; la API de Claude ve qué credenciales existen (solo sí/no, nunca valores) para diagnosticar sin pedirle nada a Emi.
- Archivos: `worker/index.js`, este registro.
- Verificación: `node worker/prueba.mjs` → aprobado.
- Pendiente: que Emi reintente «Conectar X» para leer el motivo.

## 2026-11-13 · Conectar X con OAuth 2.0 + PKCE
- Agente: Claude Code (sesión en la nube)
- Solicitud: aviso de x-viral (13/11): la consola de X de Emi da credenciales de OAuth 2.0 (Client ID, Client Secret, token de acceso y de actualización), y Ajustes solo aceptaba OAuth 1.0a.
- Cambios: Ajustes → X: «Guardar app de X» (Client ID y Secret, cifrados) y «Conectar X» (OAuth 2.0 con PKCE S256, permisos tweet.read, tweet.write, users.read, offline.access; regreso en `/api/x/volver` protegido por `state` de un solo uso). El token de acceso se renueva solo antes de publicar o leer métricas; si X no lo renueva, se borra y pide reconectar (sin gastar). OAuth 1.0a sigue como opción 2.
- Archivos: `worker/{index.js,prueba.mjs}`, `panel/app.js`, `skills/matriz-redes/references/panel.md`, este registro.
- Verificación: `node worker/prueba.mjs` → 16 aprobadas (incluye PKCE, intercambio del código, publicación con Bearer, renovación y falla cerrada, con llamadas simuladas); conexión real → no ejecutada (la hace Emi).
- Pendiente: que Emi conecte X desde Ajustes.

## 2026-11-13 · X sin candado
- Agente: Claude Code (sesión en la nube)
- Solicitud: Emi, 13/11/2026: «listo» (quitó la protección de su cuenta de X).
- Cambios: se quita el pendiente del candado y la condición de las piezas de X del calendario; queda el pendiente del acento en el nombre y del sitio web.
- Archivos: `ideas/2026-11-13-lanzamiento.json`, `calendario/2026-W47.json`, este registro.
- Verificación: perfil público de @emilianomilla_ visto desde box sin sesión (13/11, ~16:25 UTC) → ya no dice «These posts are protected»; x-viral lo confirmará.
- Pendiente: ninguno nuevo.

## 2026-11-13 · LinkedIn e Instagram ya exponen su estado
- Agente: Claude Code (sesión en la nube)
- Solicitud: mensajes de las sesiones de LinkedIn, Instagram y Vox (13/11).
- Cambios: `red/estado.json` de `lianfixx/linkedin` y `lianfixx/Instagram` validados con el contrato (válidos); TikTok aún no lo publica. Nombre exacto del repositorio de LinkedIn en la configuración y en Recursos. `redes.py` ya no muestra un error de Python ante un JSON inválido: dice el motivo. Crecer anota que los demos técnicos de Vox del 10 y 11/11 no se publican (dicen que los editó una IA).
- Archivos: `skills/matriz-redes/{scripts/redes.py,data/config.json}`, `crecimiento/{redes.json,recursos.json}`, `peticiones/2026-11-13-{linkedin,instagram}.md`, este registro.
- Verificación: `redes.py contrato` sobre ambos archivos remotos → válido; `python3 ia/verificar.py ci` → aprobado.
- Pendiente: estado de TikTok.

## 2026-11-13 · Piezas que se publican desde la app y texto de LinkedIn de Emi
- Agente: Claude Code (sesión en la nube)
- Solicitud: Emi, 13/11/2026: eligió su versión B para LinkedIn (video del DOF) y no encontraba en el panel dónde escoger el post de X.
- Cambios: las piezas pueden marcarse «lleva video o archivo» (`solo_app`): nunca salen por API ni se programan; Emi las copia, las sube desde la app y marca «Ya la publiqué» (también para Instagram y TikTok). Decisiones de Emi de la cuarta ronda; calendario e idea al día.
- Archivos: `worker/{index.js,prueba.mjs}`, `panel/app.js`, `calendario/2026-W46.json`, `ideas/2026-11-13-lanzamiento.json`, `docs/DECISIONES-EMI-2026-11-13.md`, este registro.
- Verificación: `python3 ia/verificar.py ci` → aprobado (15 pruebas del Worker).
- Pendiente: cargar en el panel las piezas de LinkedIn (DOF) y de X (lanzamiento A y B, DOF).

## 2026-11-13 · Instagram: etiqueta de IA y Reel de Vox con la voz de Emi
- Agente: Claude Code (sesión en la nube)
- Solicitud: mensajes de la sesión de Instagram (13/11), con su auditoría independiente.
- Cambios: Crecer anota que Instagram exige la etiqueta de IA para voz realista generada con IA (no para imágenes fijas) y que el formato con más alcance está en disputa; el Reel 4 (Vox) queda narrado con la voz de Emi; la petición a Instagram registra su 1.0.1 y su `red/estado.json`.
- Archivos: `crecimiento/redes.json`, `calendario/2026-W48.json`, `peticiones/2026-11-13-campana-instagram.md`, este registro.
- Verificación: `python3 ia/verificar.py ci` → aprobado.
- Pendiente: que Emi confirme la voz del Reel 4.

## 2026-11-13 · Auditoría independiente: 16 hallazgos y 8 menores corregidos
- Agente: Claude Code (sesión en la nube); revisor: agente independiente sin el contexto de quien construyó.
- Solicitud: encargo de la Matriz de Redes (auditoría adversarial); Emi, 13/11/2026: «que sea perfecta».
- Cambios: todo el estado del panel pasa a un Durable Object «PANEL» (consistencia fuerte; KV solo para migrar); la aprobación cubre texto, red, fecha y archivo; no se reaprueba lo publicado; «fallo» exige confirmar que no salió; «publicando» atascado se resuelve tras 10 min; cron sin publicaciones dobles y resistente a errores; regreso de LinkedIn protegido por `state` sin cookie; regla de autoría de IA con variantes en Worker y Python; topes y límites para Claude; alta de contraseña sin carrera y sin revivir; «Salir de todos lados»; Origin obligatorio; enlaces privados (Drive fuera del repositorio); medios solo de dominios permitidos; cadencia en hora de México, semana ISO y separación entre semanas; validadores robustos; detalle en `docs/AUDITORIA-2026-11-13.md`.
- Archivos: `worker/index.js`, `worker/prueba.mjs`, `panel/app.js`, `wrangler.jsonc`, `skills/matriz-redes/scripts/{redes.py,test_redes.py}`, `skills/matriz-redes/{SKILL.md,references/panel.md}`, `crecimiento/recursos.json`, `.github/workflows/publicar-panel.yml`, `docs/AUDITORIA-2026-11-13.md`, este registro; se quita `__pycache__` del repositorio.
- Verificación: `python3 ia/verificar.py ci` → aprobado (46 pruebas de Python, 14 del Worker); despliegue → en este push.
- Pendiente: probar con llaves reales de X y LinkedIn (las pone Emi).

## 2026-11-13 · Crecer: correcciones de Instagram con fuente oficial
- Agente: Claude Code (sesión en la nube)
- Solicitud: mensaje de la sesión de Instagram (13/11), tras leer el Centro de ayuda oficial.
- Cambios: Instagram en `crecimiento/redes.json`: señales principales (tiempo de visualización, me gusta, envíos), prueba con no seguidores, límite de 3 min para recomendaciones, 720p/30 fps y portada 420×654, «trial reels» (200 seguidores en cuenta profesional), programación hasta 30 días antes, descripciones largas sin relación no se recomiendan; corrige que las cuentas personales públicas también ven estadísticas.
- Archivos: `crecimiento/redes.json`, este registro.
- Verificación: JSON válido; `python3 ia/verificar.py ci` → aprobado. Las fuentes son las que citó la sesión de Instagram; esta sesión no las releyó.
- Pendiente: ninguno.

## 2026-11-13 · Contraseña del panel: PBKDF2 a 100 000 vueltas
- Agente: Claude Code (sesión en la nube)
- Solicitud: hallazgo de la auditoría independiente (interrumpida por un reinicio del contenedor antes de entregar su informe).
- Cambios: PBKDF2 baja de 210 000 a 100 000 vueltas, el máximo que Cloudflare Workers admite en producción; con más, el alta de la contraseña podía fallar.
- Archivos: `worker/index.js`, este registro.
- Verificación: `node worker/prueba.mjs` → aprobado; prueba en workerd local (Miniflare 3) → acepta 100 000 y también 210 000, así que el límite de producción no se pudo reproducir aquí: se baja por seguridad.
- Pendiente: repetir la auditoría completa.

## 2026-11-13 · Tablero más limpio y petición a la Matriz General
- Agente: Claude Code (sesión en la nube)
- Solicitud: encargo de la Matriz de Redes, sección 9; revisión visual del panel publicado.
- Cambios: los pendientes de Emi ya no repiten el id de la idea; petición para que la revisión semanal de la Matriz General registre `redes`, `LinkedIn`, `TikTok` e `Instagram` en «Contenido y video».
- Archivos: `skills/matriz-redes/scripts/redes.py`, `TABLERO.md`, `panel/datos.json`, `peticiones/2026-11-13-matriz-general.md`, este registro.
- Verificación: `python3 ia/verificar.py ci` → aprobado; panel publicado en https://redes.milla-abogados.workers.dev revisado en Chromium a 1280 y 390 px, claro y oscuro: sin errores de consola ni desbordes.
- Pendiente: auditoría independiente en curso.

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
