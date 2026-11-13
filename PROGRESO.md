# Progreso — Omni CRM

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
