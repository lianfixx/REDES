# Contrato de estado entre skills de redes · borrador 0.1.1 (13/11/2026)

Lo propone la Matriz de Redes (`lianfixx/REDES`, aún sin crear). Cada skill de red o de video
lo **escribe en su propio repositorio**; la Matriz de Redes solo lo **lee**. Nadie escribe en el
repositorio de otra skill.

## Archivo

`red/estado.json` en la raíz del repositorio de la skill (público: nada de borradores sin
publicar, datos de clientes ni secretos). Si la skill ya tiene archivos propios
(x-viral: `cuenta/publicados.jsonl`, `cuenta/aprendizajes.md`, `puente/para-vox.md`), este archivo
puede ser un índice que los referencie en `fuentes`; no hay que mover nada.

## Campos

```json
{
  "contrato": "redes-estado/0.1",
  "skill": "linkedin",                 // id estable: x-viral, linkedin, tiktok, instagram, vox-studio, historias-studio…
  "red": "linkedin",                   // x | linkedin | tiktok | instagram | instagram-historias | null (skills de video)
  "version_skill": "0.1.0",
  "actualizado": "2026-11-13",
  "cuentas": [{"espacio": "personal", "usuario": "", "activa": false, "notas": ""}],
  "cadencia": {                        // lo que la skill declara; la Matriz lo respeta, no lo inventa
    "max_por_dia": 1, "separacion_min_h": 0, "max_por_semana": 3,
    "dias_preferidos": [], "fuente": "references/....md", "certeza": "oficial | terceros | criterio"
  },
  "formatos": [{"id": "texto", "que_premia": "…", "fuente": "…", "certeza": "oficial | terceros | criterio"}],
  "minutos_emi_por_pieza": {"texto": 10},
  "publicados": [{
    "id": "li-2026-11-20-01", "fecha": "2026-11-20T09:30:00-06:00", "espacio": "personal",
    "pilar": "ia-derecho", "formato": "texto", "url": "", "idea_matriz": "",   // id de idea de REDES si vino de ahí
    "huella_texto": "sha256 de los primeros 280 caracteres normalizados",   // para detectar textos repetidos entre redes
    "metricas": {"capturado": "2026-11-22", "fuente": "captura de Emi", "valores": {"impresiones": 0}}  // en las unidades de la red
  }],
  "lecciones": [{"fecha": "2026-11-22", "texto": "qué pasó y regla que queda", "evidencia": "…", "alcance": "red | espacio | pilar | todas"}],
  "ideas_para_otras": [{"fecha": "2026-11-22", "para": "vox-studio | x-viral | …", "tema": "…", "por_que": "…"}],
  "pendientes_de_emi": [{"que": "…", "desde": "2026-11-13", "bloquea": "…"}],
  "fuentes": {"publicados": "cuenta/publicados.jsonl", "lecciones": "cuenta/aprendizajes.md"}
}
```

Reglas: fechas ISO con zona del centro de México; métricas solo como las da cada red (sin
métrica común inventada); listas vacías válidas; campos desconocidos se ignoran; un cambio de
formato sube `contrato`. La Matriz de Redes publicará el validador (`redes.py contrato validar`).

## Cambios
- 0.1.1 (13/11/2026): `certeza` usa «oficial | terceros | criterio», la escala que ya usan LinkedIn e Instagram. Métricas en `valores` con los nombres de cada red en snake_case.
