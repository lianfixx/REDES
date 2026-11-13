# Panel

Cloudflare Worker (`worker/index.js`) con el panel (`panel/`). Se publica solo con «Publicar panel». Todo el estado (piezas, notas, encargos, enlaces privados, credenciales cifradas, contraseña) vive en un Durable Object («PANEL») que atiende una petición a la vez, con consistencia fuerte: no hay publicaciones dobles por carrera ni listas pisadas.

- **Hoy:** pendientes de Emi, semana, avisos, próximas.
- **Piezas:** cada texto con su vista previa fiel (X en claro y oscuro, LinkedIn con «… más», teléfono para Instagram y TikTok), contador de caracteres de X (enlace = 23, emoji = 2), revisión en vivo, aprobar, publicar, cancelar, copiar, métricas.
- **Calendario, Ideas, Crecer** (qué funciona en cada red, con fuente y certeza; `crecimiento/redes.json`), **Métricas, Recursos** (skills, Drive, pasos de un video, encargos para Claude, bitácora) y **Ajustes** (llaves de X y conexión con LinkedIn).

## Seguridad

- Contraseña de Emi: la crea él una sola vez con un enlace de alta (`ALTA`); se guarda como PBKDF2. Sesión de 30 días en cookie `HttpOnly`, `Secure`, `SameSite=Strict`; 5 fallos por minuto o 20 por hora bloquean la IP (Durable Object).
- Llaves de X y LinkedIn: se pegan una vez en Ajustes, se guardan cifradas (AES-GCM, llave `CIFRADO`) y nunca vuelven al navegador.
- Solo se publica lo aprobado con la misma huella, que cubre **texto, red, fecha y archivo**: si cualquiera cambia, hay que volver a aprobar. El servidor revisa otra vez el texto (autoría de IA con variantes, despacho, anzuelos, largo) y rechaza aprobar un texto casi igual al de otra red.
- No se reaprueba lo publicado. Una pieza en «fallo» solo se reaprueba si Emi confirma que no salió. Si el servidor se corta a la mitad, la pieza queda «publicando» y, pasados 10 minutos, Emi marca «Sí salió» o «No salió».
- El cron publica cada pieza programada una sola vez; si va más de 6 h tarde, la deja «aprobada» para que Emi decida. Instagram y TikTok nunca quedan «programadas» (no hay API): se aprueban y se copian a la app.
- Tope de gasto en la API de X (`TOPE_X_USD`, 10 USD al mes); si el valor no es número, el tope es 0. Sin reintentos en bucle.
- «Salir de todos lados» (Ajustes) invalida todas las sesiones. El enlace de alta sirve una sola vez aunque el secreto siga cargado.
- Enlaces privados (carpetas de Drive) solo se ven con sesión: no están en el repositorio público.
- Claude entra con `CLAUDE_LLAVE` (Bearer, 32+ caracteres; 5 fallos por minuto bloquean) solo a `/api/claude/*`: lee el estado, deja borradores «listos para aprobar» (máximo 200 abiertos), notas, enlaces y respuestas a encargos. Solo edita sus propios borradores mientras no estén aprobados. **Nunca aprueba ni publica.**

## API para Claude

```
GET  /api/claude/estado                       piezas, notas, encargos, bitácora
POST /api/claude/pieza   {red, texto, titulo, fecha (ISO), idea, media, nota}
POST /api/claude/nota    {texto, tipo, red}
POST /api/claude/enlace  {nombre, url (https), grupo}
POST /api/claude/encargo/<id> {estado, respuesta}
```

La llave la guarda cada sesión con el formulario seguro de credenciales (nunca en el chat).
