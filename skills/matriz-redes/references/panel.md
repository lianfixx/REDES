# Panel

Cloudflare Worker (`worker/index.js`) con el panel (`panel/`). Se publica solo con «Publicar panel». Todo el estado (piezas, notas, encargos, enlaces privados, credenciales cifradas, contraseña) vive en un Durable Object («PANEL») que atiende una petición a la vez, con consistencia fuerte: no hay publicaciones dobles por carrera ni listas pisadas.

- **Hoy:** pendientes de Emi, semana, avisos, próximas.
- **Piezas:** cada texto con su vista previa fiel (X en claro y oscuro, LinkedIn con «… más», teléfono para Instagram y TikTok), contador de caracteres de X (enlace = 23, emoji = 2), revisión en vivo, aprobar, publicar, cancelar, copiar, métricas, y **archivos** (imágenes, video o PDF) que se suben desde el teléfono y se ven en la vista previa.
- **Archivos:** se suben al panel en partes de 4 MiB (3 a la vez, con reintentos) y se guardan en el Durable Object en trozos de 1 MiB (máx. 300 MB por video, 100 MB por PDF, 20 MB por imagen; 4 GB en total). Al aprobar, la huella incluye los archivos. Antes de la hora (hasta 6 h antes) el cron los sube a la red: X por `/2/media/upload` (`initialize` → `append` → `finalize` → `STATUS`; pide el permiso `media.write`, por eso hay que reconectar X una vez) y LinkedIn por Images, Videos (partes con ETag y `finalizeUpload`) y Documents API (PDF como carrusel, con el nombre del archivo como título). Luego publica con `media_ids` (X) o `content.media` / `content.multiImage` (LinkedIn). Si la red aún procesa un video, la pieza sale en cuanto termine; si LinkedIn rechaza el post con 400/409/422 (no lo crea), se reintenta hasta 6 veces. Tres errores de subida seguidos la dejan esperando a Emi. Instagram y TikTok: se descargan del panel y se suben desde la app. Reglas por red: X hasta 4 imágenes (5 MB) o un video de hasta 2:20, sin PDF; LinkedIn un video MP4, un PDF o de 1 a 20 imágenes, sin WEBP. Se borran solos 45 días después de que sale la pieza.
- **Inspiración:** al pegar un enlace, el panel guarda su título, autor, texto y miniatura (oEmbed de TikTok, YouTube, Pinterest, Vimeo y X; si no hay, las etiquetas públicas de la página). Claude la analiza en la revisión programada (13:00 y 21:00) o en cualquier sesión.
- **Calendario, Ideas, Crecer** (qué funciona en cada red, con fuente y certeza; `crecimiento/redes.json`), **Métricas, Recursos** (skills, Drive, pasos de un video, encargos para Claude, bitácora) y **Ajustes** (llaves de X y conexión con LinkedIn).

## Seguridad

- Contraseña de Emi: la crea él una sola vez con un enlace de alta (`ALTA`); se guarda como PBKDF2. Sesión de 30 días en cookie `HttpOnly`, `Secure`, `SameSite=Strict`; 5 fallos por minuto o 20 por hora bloquean la IP (Durable Object).
- X se conecta con OAuth 2.0 + PKCE (Client ID y Secret de la consola nueva; el panel obtiene y renueva solo el token de acceso, que dura ~2 h, y guarda el de actualización, que rota; si la renovación falla, se borra y pide reconectar) o con las 4 llaves de OAuth 1.0a si la consola las da. URL de retorno: `/api/x/volver`.
- Llaves de X y LinkedIn: se pegan una vez en Ajustes, se guardan cifradas (AES-GCM, llave `CIFRADO`) y nunca vuelven al navegador.
- Solo se publica lo aprobado con la misma huella, que cubre **texto, red, fecha y archivo**: si cualquiera cambia, hay que volver a aprobar. El servidor revisa otra vez el texto (autoría de IA con variantes, despacho, anzuelos, largo) y rechaza aprobar un texto casi igual al de otra red.
- No se reaprueba lo publicado. Una pieza en «fallo» solo se reaprueba si Emi confirma que no salió. Si el servidor se corta a la mitad, la pieza queda «publicando» y, pasados 10 minutos, Emi marca «Sí salió» o «No salió».
- El cron publica cada pieza programada una sola vez; si va más de 6 h tarde, la deja «aprobada» para que Emi decida. Instagram y TikTok nunca quedan «programadas» (no hay API): se aprueban y se copian a la app.
- Tope de gasto en la API de X (`TOPE_X_USD`, 10 USD al mes); si el valor no es número, el tope es 0. Sin reintentos en bucle.
- «Salir de todos lados» (Ajustes) invalida todas las sesiones. El enlace de alta sirve una sola vez aunque el secreto siga cargado.
- Enlaces privados (carpetas de Drive) solo se ven con sesión: no están en el repositorio público.
- Claude entra con `CLAUDE_LLAVE` o con la **llave de Claude automático** que Emi crea en Ajustes (se muestra una vez; se guarda solo su SHA-256; se cambia o revoca ahí) (Bearer, 32+ caracteres; 5 fallos por minuto bloquean) solo a `/api/claude/*`: lee el estado, deja borradores «listos para aprobar» (máximo 200 abiertos), notas, enlaces y respuestas a encargos. Solo edita sus propios borradores mientras no estén aprobados. **Nunca aprueba ni publica.**

## API para Claude

```
GET  /api/claude/estado                       piezas, notas, encargos, inspiración, archivos, bitácora, conexiones
POST /api/claude/pieza   {red, texto, titulo, fecha (ISO), idea, media, nota, archivos: [id, …]}
POST /api/claude/pieza/<id>/comentario  {texto}
POST /api/claude/pieza/<id>/sugerencia  {hora (ISO), motivo}
POST /api/claude/nota    {texto, tipo, red, espacio}
POST /api/claude/enlace  {nombre, url (https), grupo}
POST /api/claude/encargo/<id> {estado, respuesta}
POST /api/claude/inspiracion/<id>        {estilo, redaccion, edicion, gancho, formato, ritmo, musica, que_tomar, evitar, para_que_red, espacio_propuesto}
POST /api/claude/inspiracion/<id>/meta   vuelve a leer título, autor y miniatura del enlace
POST /api/claude/(nota|inspiracion)/<id>/espacio {espacio}
POST /api/claude/archivo {nombre, tipo, bytes, ancho?, alto?, duracion?}  → {id, partes, parte}
PUT  /api/claude/archivo/<id>/<n>        cuerpo binario (application/octet-stream), parte n de 4 MiB (la última, lo que sobre)
GET  /api/claude/archivo/<id>            descarga (admite Range)
POST /api/claude/archivo/<id>/borrar     solo los que subió Claude y no están en una pieza abierta
```

Subir un video terminado (Editor Studio, Vox…) y dejarlo listo para que Emi lo apruebe:

```bash
B=https://redes.milla-abogados.workers.dev; H="Authorization: Bearer $LLAVE"   # con llave inyectada por el proxy, cualquier valor
ID=$(curl -s -X POST $B/api/claude/archivo -H "$H" -H "Content-Type: application/json" \
  -d "{\"nombre\":\"dof.mp4\",\"tipo\":\"video/mp4\",\"bytes\":$(stat -c%s dof.mp4),\"duracion\":58}" | jq -r .id)
split -b 4194304 -d -a 3 dof.mp4 parte.; n=0
for f in parte.*; do curl -s -X PUT $B/api/claude/archivo/$ID/$n -H "$H" -H "Content-Type: application/octet-stream" --data-binary @$f; n=$((n+1)); done
curl -s -X POST $B/api/claude/pieza -H "$H" -H "Content-Type: application/json" -d "{\"red\":\"x\",\"texto\":\"…\",\"archivos\":[\"$ID\"]}"
```

La llave la guarda cada sesión con el formulario seguro de credenciales (nunca en el chat).
