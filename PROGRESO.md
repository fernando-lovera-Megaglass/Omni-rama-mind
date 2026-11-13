# Progreso — Omni CRM

## 2026-11-12 (sesión 2) · Punto 3: monto ponderado en el tablero de negocios

**Verificación previa:** el punto 2 (tablero Kanban con drag & drop entre etapas) ya estaba implementado en `src/list.js` (`renderBoard`, eventos `dragstart`/`dragover`/`drop` con reglas de pipeline vía `board.canMove`), y el pipeline predeterminado de 7 etapas con probabilidad de cierre ya existía en `DEAL_STAGES` (`src/data.js`) con el "Valor ponderado" en las métricas. Lo que faltaba del punto 3 era el **total ponderado por columna del tablero** (espec §2 y §9).

**Construido**
- `src/list.js`: la cabecera de cada columna del tablero ahora admite `board.weighted(rows)` opcional; se muestra junto al total con tooltip "Cantidad neta (ponderada): importe de la etapa × probabilidad de cierre".
- `src/deals.js`: `board.weighted` calcula el importe en moneda de la empresa × probabilidad de cierre de la etapa de cada negocio (`pond. $X`).
- `src/app.css`: `.kcol__sum--weighted` distingue el ponderado en color de enlace.
- Sin dependencias nuevas.

**Lo que falta del punto 3** (según `especificacion-negocios-pipelines-crm.md`)
- Categorías de previsión por etapa (`Pipeline` / `Mejor caso` / `Comprometido` / `Cierre ganado`) y propiedad `Categoría de previsión` del negocio con automatización al cambiar de etapa (espec §7).
- Propiedad `Probabilidad de la previsión` personalizada por negocio.
- Etiquetas de objeto codificadas por color en las tarjetas del tablero (espec §9).
- Nombre interno de etapas/pipelines y clonado de pipelines al crear (espec §3–4).

## 2026-11-12 · Punto 1: tabla `activities` en Supabase y cronología unificada en la ficha

**Construido**
- Nueva migración `supabase/activities.sql`: tabla `activities` (`type`, `record_type`, `record_id`, `text`, `who`, `occurred_at`, `extra` jsonb) con índice por registro y política RLS abierta igual que las demás tablas.
  - ⚠️ **Acción pendiente del usuario:** ejecutar `supabase/activities.sql` en el SQL Editor de Supabase. Hasta entonces la cronología sigue funcionando en localStorage (fallback automático) y nada se rompe.
- `src/data.js`: store de actividades con el mismo patrón que el resto de tablas (caché en memoria + escritura optimista en background; fallback a localStorage si la tabla no existe). Nuevas funciones: `activitiesFor`, `addActivity`, `historyFor`, `addHistoryEntry`. Migración única e idempotente `migrateLocalActivities()`: al primer arranque con la tabla disponible, vuelca a Supabase todas las notas e historiales guardados en localStorage (`crm:*:notes:*`, `crm:*:history:*`) y limpia esas claves.
- `src/record.js`: la cronología y el historial de propiedades de la ficha ahora leen/escriben vía `data.js` (Supabase cuando está disponible). El historial de propiedades se guarda como actividad `type='prop'` con `{key, from, to}` en `extra`, así una sola fila alimenta tanto la cronología como el modal "Historial de la propiedad" (antes se escribían dos registros separados). Los eventos de ejemplo solo se muestran si el registro no tiene actividad real.
- Sin dependencias nuevas.

**Lo que falta del punto 1** (según `especificacion-actividades-crm.md`)
- Formularios dedicados al registrar llamada/correo/reunión (fecha-hora, resultado, dirección, duración) — hoy se registra texto libre.
- Comentarios dentro de actividades, editar/eliminar actividad y restauración con papelera de 90 días.
- Páginas índice de actividades (listado global por tipo).
- Asociaciones automáticas configurables (p. ej. la actividad de un contacto también visible en su empresa).
- Tarea de seguimiento sugerida al registrar llamada/correo.
- Tipo "mensaje/postal" y subtareas.

## Historial anterior (git)
- `9cc9403` Importación igual para contactos, empresas, negocios, tickets y tareas.
- Sesiones previas sin `PROGRESO.md`: ver `git log`.
