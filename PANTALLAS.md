# PANTALLAS.md — Estado de aprobación de pantallas

Regla F del proceso (22-nov-2026): **solo el usuario aprueba una pantalla**.
Los constructores no cierran tareas; dejan evidencia en `docs/evidencia/<id>/`
y la tarea pasa a «En revisión». Kimi revisa la evidencia y el usuario aprueba.

Estados: `pendiente` → `en revisión` → `aprobada`.

**No se avanza a la siguiente pantalla hasta que el usuario apruebe la actual.**
Orden acordado: Contactos → ficha de Empresa → Pipeline (Negocios) → resto.

La captura base de Playwright (`tests/*.png`) solo se genera o actualiza
cuando la pantalla queda aprobada. Prohibido `--update-snapshots` para hacer
pasar una prueba.

| # | Pantalla | Estado | Captura base 1440 | Captura base 1280 | Aprobada por | Fecha |
|---|----------|--------|-------------------|-------------------|--------------|-------|
| 1 | Contactos — lista | pendiente | generada sin aprobar¹ | generada sin aprobar¹ | — | — |
| 2 | Contactos — ficha | pendiente | — | — | — | — |
| 3 | Empresas — ficha | pendiente | — | — | — | — |
| 4 | Negocios — pipeline (kanban) | pendiente | — | — | — | — |
| 5 | Empresas — lista | pendiente | — | — | — | — |
| 6 | Negocios — lista | pendiente | — | — | — | — |
| 7 | Tickets — lista | pendiente | — | — | — | — |
| 8 | Tickets — ficha | pendiente | — | — | — | — |
| 9 | Tareas | pendiente | — | — | — | — |
| 10 | Llamadas | pendiente | — | — | — | — |
| 11 | Bandeja (inbox) | pendiente | — | — | — | — |
| 12 | Marketing | pendiente | — | — | — | — |
| 13 | Secuencias | pendiente | — | — | — | — |
| 14 | Plantillas y snippets | pendiente | — | — | — | — |
| 15 | Automatización (workflows) | pendiente² | — | — | — | — |
| 16 | Informes | pendiente | — | — | — | — |
| 17 | Segmentos | pendiente | — | — | — | — |
| 18 | Configuración | pendiente | — | — | — | — |

¹ Las capturas iniciales de Contactos se crearon al estrenar la prueba
(`updateSnapshots: 'missing'`); **no cuentan como aprobadas** hasta que el
usuario valide la pantalla.

² La UI de workflows se construyó antes de este proceso (tarea
`gap-ui-workflows-fidelidad-hubspot`, en revisión): falta la comparación
visual contra HubSpot y la aprobación del usuario.
