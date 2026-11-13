# Ciclos (todo se alimenta solo)

| Ciclo | Cuándo | Quién | Qué hace |
|---|---|---|---|
| Diario | 06:47 centro de México | GitHub Actions («Actualización diaria») | Lee `red/estado.json` de cada skill, valida todo, regenera `TABLERO.md` y `panel/datos.json`, publica el panel. Avisa en el tablero: textos repetidos entre redes, red por encima de su cadencia, idea que caduca, pendiente de Emi. |
| Cada 5 minutos | siempre | Worker del panel (cron) | Publica lo aprobado y programado; si se atrasó más de 6 h, no lo publica y espera a Emi. Lee métricas de X a las 48 h y a los 7 días. |
| Semanal | Domingo 19:47 (propuesta, antes de la revisión de la Matriz General de las 20:13) | Tarea programada de Claude (pendiente de crear con el visto bueno de Emi) | Junta lo que propone cada skill (x-viral ya entrega su semana por aquí, desde su recordatorio del lunes 8:00), arma el paquete semanal en el panel con una sola lista de lo que necesita Emi (material, posturas, aprobaciones) y deja las piezas «listas para aprobar». |
| Mensual | Primer domingo | Igual | Resultados por red, espacio y pilar; lecciones transversales como hipótesis; propuestas de cambio de pesos o balance con evidencia, para que Emi decida. |
| Trimestral | Primer domingo de feb, may, ago, nov | Igual | Estrategia: qué red crece, cuál no vale el esfuerzo, qué formato abandonar. |

Coordinación con lo que ya existe (no se duplica): revisión semanal de la Matriz General (dom 20:13), revisión del algoritmo de X (lun 12:47, x-viral), revisión del nicho de historias (dom 18:47, Historias), radar de tendencias de video (dom 21:23, Vox).

## Métricas

Ninguna IA entra a las cuentas de Emi. X se lee por API (con su tope de gasto). Para las demás, Emi abre la pieza en el panel → «Anotar métricas de la app» y pega los números (o manda capturas en el chat el domingo y la Matriz los anota). La Matriz los reparte a cada skill.
