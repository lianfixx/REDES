# Panel

Cloudflare Worker (`worker/index.js`) con el panel (`panel/`). Se publica solo con «Publicar panel».

- **Hoy:** pendientes de Emi, semana, avisos, próximas.
- **Piezas:** cada texto con su vista previa fiel (X en claro y oscuro, LinkedIn con «… más», teléfono para Instagram y TikTok), contador de caracteres de X (enlace = 23, emoji = 2), revisión en vivo, aprobar, publicar, cancelar, copiar, métricas.
- **Calendario, Ideas, Crecer** (qué funciona en cada red, con fuente y certeza; `crecimiento/redes.json`), **Métricas, Recursos** (skills, Drive, pasos de un video, encargos para Claude, bitácora) y **Ajustes** (llaves de X y conexión con LinkedIn).

## Seguridad

- Contraseña de Emi: la crea él una sola vez con un enlace de alta (`ALTA`); se guarda como PBKDF2. Sesión de 30 días en cookie `HttpOnly`, `Secure`, `SameSite=Strict`; 5 fallos por minuto o 20 por hora bloquean la IP (Durable Object).
- Llaves de X y LinkedIn: se pegan una vez en Ajustes, se guardan cifradas (AES-GCM, llave `CIFRADO`) y nunca vuelven al navegador.
- Solo se publica lo aprobado con la misma huella; el texto se revisa otra vez en el servidor (autoría de IA, despacho, anzuelos, largo). Sin reintentos en bucle: si falla, queda en «fallo» y espera a Emi. Tope de gasto en la API de X (`TOPE_X_USD`, 10 USD al mes).
- Claude entra con `CLAUDE_LLAVE` (Bearer) solo a `/api/claude/*`: lee el estado, deja borradores «listos para aprobar», notas y respuestas a encargos. **Nunca aprueba ni publica.**

## API para Claude

```
GET  /api/claude/estado                       piezas, notas, encargos, bitácora
POST /api/claude/pieza   {red, texto, titulo, fecha (ISO), idea, media, nota}
POST /api/claude/nota    {texto, tipo, red}
POST /api/claude/encargo/<id> {estado, respuesta}
```

La llave la guarda cada sesión con el formulario seguro de credenciales (nunca en el chat).
