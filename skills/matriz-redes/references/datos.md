# Datos y validador

Todo es JSON, un archivo por objeto, validado por `redes.py validar` (también corre en GitHub en cada push).

| Carpeta | Objeto | Campos clave |
|---|---|---|
| `ideas/` | Idea | id, fecha_alta, origen (emi, skill, noticia, metrica, peticion, matriz), espacio, pilar, tesis, postura_emi {texto, fuente} (obligatoria en política después de «propuesta»), tipo (noticia, temporada, perenne), caduca, evidencia [{fuente, nivel: oficial/terceros/criterio, tipo}], riesgo_juridico/politico/reputacional {nivel 0-3, motivo}, activos_disponibles, activos_necesarios, costo {minutos_emi, creditos_kie, caracteres_elevenlabs, usd}, estado, pendiente_de_emi |
| `decisiones/` | Decisión | id, fecha, idea, piezas [{red, formato, skill, fecha_objetivo}], alternativas [{opcion, puntuacion}], gano, perdio, razonamiento, decidio (emi o regla), fuente_emi, reemplaza |
| `calendario/` | Semana | semana, tope_minutos_emi, items [{id, idea, fecha con zona, red, skill, titulo, estado, minutos_emi, texto?, aprobado_huella?}] |
| `registro/` | Publicado | id, red, fecha, pilar, metricas {capturado, fuente, valores en las unidades de la red} |
| `lecciones/` | Lección | id, fecha, que_paso, evidencia, regla, alcance (red, espacio, pilar, todas), para, tipo (hipotesis si cruza redes) |
| `experimentos/` | Experimento | id, hipotesis, red, variable, metrica, duracion_min_dias (≥ 14), inicio, estado, resultado, decision |

Estados de una idea: propuesta → decidida → en produccion → aprobada → entregada → publicada → medida → cerrada (o descartada con motivo).

**Indicadores entre redes:** no hay una métrica común. Si se comparan redes, se usan indicadores derivados y documentados (seguidores ganados por publicación, respuestas por cada mil vistas), sabiendo que cada plataforma cuenta distinto.

Ejemplo completo y marcado como ficticio: `ejemplos/semana-ficticia/`.
