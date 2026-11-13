# Auditoría independiente · 13/11/2026

Un agente revisor sin el contexto de quien construyó el sistema intentó tumbar cada regla, cálculo y afirmación de `lianfixx/redes` en el commit `58dfe2d`. Corrió `python3 ia/verificar.py ci` (aprobado) y escribió sus propios scripts de ataque contra el Worker y contra `redes.py`. Un primer intento se interrumpió por un reinicio del contenedor; solo dejó una pista (el límite de PBKDF2 en Workers), que se atendió en `58dfe2d`. Este es el informe del segundo intento y lo que se hizo con cada hallazgo.

**[C]** = comprobado ejecutándolo · **[I]** = inferido del código o de la documentación de las plataformas.

| # | Severidad | Hallazgo | Corrección | Prueba que lo cubre |
|---|---|---|---|---|
| 1 | Crítica [C] | El cron guardaba una lista vieja: una pieza ya publicada volvía a «programada» y salía dos veces | `tic` relee y cambia solo la pieza afectada; todo el estado pasa a un Durable Object | `prueba.mjs`: «cron: una atrasada no revive lo ya publicado» |
| 2 | Alta [C] | Se podía volver a aprobar algo publicado o «publicando» | `aprobar` rechaza esos estados; «fallo» exige confirmar que no salió | «aprobación…», «fallo exige confirmar» |
| 3 | Alta [C] | Cambiar red o fecha no invalidaba la aprobación; Claude podía mover una pieza aprobada | La huella cubre texto, red, fecha y archivo; Claude solo edita sus borradores no aprobados | «aprobación: la invalidan texto, red y fecha», «Claude: … mover aprobadas, no» |
| 4 | Alta [C] | Una pieza de Instagram programada tumbaba el cron para siempre | Sin API no se programa; cada publicación del cron va en try/catch | «cron: … Instagram no tumba la pasada» |
| 5 | Alta [I] | Candado no atómico en KV (consistencia eventual) | Estado en Durable Object «PANEL»; candado de «publicando» con relectura | Diseño; no reproducible sin Cloudflare |
| 6 | Alta [I] | El regreso de LinkedIn no traería la cookie (SameSite=Strict) | `/api/linkedin/volver` ya no exige cookie: lo protege el `state` (de un solo uso, 10 min, creado con sesión) | «regreso de LinkedIn sin cookie» |
| 7 | Media [C] | La regla de autoría se esquivaba («Hecho por I.A.», «Lo hizo ChatGPT», «L0 hizo una IA»…) y solo revisaba algunos campos | Expresiones con verbo + IA, letras sueltas unidas, números «leet»; en Python revisa todos los campos de texto de la idea | «regla de autoría» (Worker) y `Auditoria.test_autoria_variantes` |
| 8 | Media [C] | Claude podía borrar piezas de Emi inundando la lista | Máximo 200 borradores abiertos de Claude; el recorte nunca toca piezas de Emi ni activas | «Claude: … inundar, no» |
| 9 | Media [C] | `/api/claude/*` sin límite de intentos | Límite por IP; llave de 32+ caracteres | «Claude: … límite de intentos» |
| 10 | Media [C] | Carrera en el alta de contraseña; el enlace revivía si se borraba la clave | Alta dentro del Durable Object con doble comprobación y marca permanente `alta_usada` | «alta: una sola vez, sin carrera, y no revive» |
| 11 | Media [I] | «publicando» atascado sin salida | Botones «Sí salió» / «No salió» tras 10 min | «pieza atorada en publicando» |
| 12 | Media [C] | Cadencia contada con el desfase del texto, no en hora de México; fechas fuera de su semana; sin separación entre semanas | Todo se convierte a America/Mexico_City; se valida la semana ISO; separación y tope diario con todos los archivos juntos | `test_dia_en_hora_de_mexico`, `test_semana_equivocada`, `test_separacion_entre_archivos` |
| 13 | Media [C] | Un dato malo tumbaba el tablero diario | Errores por objeto van a «Avisos»; `validar_todo` nunca lanza | `test_datos_rotos_no_tumban` |
| 14 | Media [C] | «El validador detecta el mismo texto en dos redes» era cierto a medias | El panel rechaza aprobar un texto casi igual al de otra red; la documentación dice el alcance real | «mismo texto en dos redes» |
| 15 | Media [C] | `requiere_emi` se esquivaba con costos no listados o minutos de más | Cualquier costo > 0 o minutos por encima del tope semanal exigen a Emi | `test_requiere_emi_por_cualquier_costo` |
| 16 | Media [I] | LinkedIn «little text»: paréntesis, @, # y similares pueden cortar el texto | Se escapan; `expires_in` ausente = 60 días | «otras reglas de texto» (escape) |
| B1 | Baja [C] | `TOPE_X_USD` no numérico = sin tope | Si no es número, el tope es 0 | «tope inválido» |
| B2 | Baja [C] | POST sin `Origin` aceptado | `Origin` obligatorio e igual al del panel | «sin Origin no escriben» |
| B3 | Baja | Salir no revocaba sesiones | «Salir de todos lados» (época de sesión) | «salir de todos lados invalida la cookie» |
| B4 | Baja [I] | `media` de Claude servía de baliza; `href` sin filtro de esquema | Imágenes y videos solo de Drive, Google, X y LinkedIn (también en la CSP); `href` solo https | Revisión de código |
| B5 | Baja [C] | Validadores flojos (duración como texto, lección con experimento inexistente o fecha mala, pesos negativos) | Corregidos; puntuación acotada a 0-100 | `test_validadores_flojos` |
| B6 | Baja | Límite de X distinto en Python y en el Worker | Ambos cuentan enlace = 23, emoji = 2, y es error | «un enlace cuenta 23 en X» |
| B7 | Baja [I] | IDs de carpetas de Drive en el repositorio público | Quitados; ahora son enlaces privados del panel | — |
| B8 | Baja | `__pycache__` en git; publicar con `cancel-in-progress` podía cortar entre despliegue y secretos | Quitado; `cancel-in-progress: false` | — |

## Sin corregir, a propósito

- `datos.json` (público, igual que el repositorio) incluye la postura de Emi de la campaña y sus pendientes. Es lo mismo que ya está en GitHub; se dejó así para que el tablero se vea sin contraseña. Si Emi prefiere ocultarlo, se mueve detrás de la sesión.
- `verificar.py` no revisa la línea `IA-Actor` de cada commit (los commits la traen).
- La actualización diaria sube el tablero antes de validar a propósito: si algo no valida, el tablero lo muestra en «Avisos» y el trabajo queda en rojo.
- Costos de la API de X (0.015 y 0.20 USD) vienen de x-viral y no se pudieron verificar aquí.

## Lo que el revisor confirmó sin falla

Firma OAuth 1.0a igual al ejemplo de la documentación de X; ninguna ruta devuelve llaves; Claude no puede aprobar ni publicar; CSP aplicada a todo; todo `innerHTML` pasa por `esc()`; `state` de LinkedIn de un solo uso sin redirección abierta; la huella coincide entre Worker y Python; no hay secretos en archivos ni en el historial.
