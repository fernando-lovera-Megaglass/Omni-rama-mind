# Progreso — Omni CRM

## 2026-11-12 (sesión 4) · Segmentos (espec `especificacion-segmentos-propiedades-crm.md`, PARTE A)

**Construido**
- Nueva migración `supabase/segments.sql`: tabla `segments` (`name`, `object`, `type` activo/estático, `description`, `folder`, `creator`, `updated_by`, `filters` jsonb, `member_ids` jsonb, `size`, `used_in`, `campaign`, `access` jsonb, `import_id`, `processed_at`, `extra`) con índice por objeto y la misma política RLS abierta.
  - ⚠️ **Acción pendiente del usuario:** ejecutar `supabase/segments.sql` en el SQL Editor de Supabase. Hasta entonces los segmentos viven en localStorage (`crm:segments`, fallback automático); al existir la tabla se vuelcan en ella (muestra inicial de 142 segmentos o los guardados localmente) y las escrituras van a Supabase.
- `src/data.js`: store de segmentos con el mismo patrón que `activities` (caché en memoria, escritura optimista en background, fallback a localStorage): `listSegments`, `insertSegment`, `patchSegment`, `deleteSegments`, `seedSegments`, `segmentsAreLive`.
- `src/filter-editor.js` (nuevo, compartido): editor de grupos de condiciones (Y dentro del grupo, O entre grupos, clonar/eliminar grupos, límite de 250 filtros y 60 de objetos asociados) y evaluador `recordMatches`. Categorías **Propiedades** (del propio registro o de registros asociados, con etiqueta de asociación), **Afiliaciones** (pertenencia a otro segmento) y **Eventos** (no disponible). Valores por tipo: listas con casillas, texto/numérico con varios valores separados por `;`, fechas con calendario. `suggestConditions` propone filtros desde una descripción en lenguaje natural (sin servicio externo).
- `src/list.js`: los "Filtros avanzados" de todas las listas usan ahora el editor compartido (misma lógica que antes, menos código duplicado). `src/filter-ops.js`: `wantedList` acepta `;` como separador.
- `src/segments-data.js`: segmentos activos (miembros calculados en vivo con `recordMatches`, incluida la afiliación a segmentos) y estáticos (foto `memberIds` al procesar, alta/baja manual), `processSegment` ("Guardar y procesar"), clonar, convertir en estático, carpetas, descripción generada.
- Nueva página `segments/editor/` (`src/segment-editor.js`): elección de objeto (contactos, empresas, negocios, tickets), nombre editable con lápiz, "Añadir a carpeta", panel de filtros a la izquierda y vista previa en vivo a la derecha (recuento + primeros 25 registros), diálogo de guardado con tipo Activo/Estático, descripción (✦ generar), campaña y pestaña **Acceso** (ver/editar: todos, solo yo, equipos); al guardar se procesa y muestra el recuento. Menú **Usar segmento** (correo de marketing solo contactos, workflow, audiencia de anuncios contactos/empresas, encuesta solo estáticos de contactos, clonar). En segmentos estáticos: buscador para añadir registros y "Quitar" por fila.
- `src/segments.js`: la lista de Segmentos enlaza con el editor (crear, creación rápida por objeto, abrir); Acciones clona, convierte en estático, mueve a carpeta y elimina.
- Navegación: CRM › **Segmentos** (es el nombre actual de "Listas" en el original y el que muestra la captura del usuario).
- Pruebas: `scripts/smoke-segments.mjs` (lista, editor, filtros propios/asociados/afiliación, guardado y procesado, estáticos, importación) y el resto de la suite (20 scripts) en verde. `npm run build` OK.

**Lo que falta de la PARTE A**
- Filtros de la categoría Eventos (interacciones con CTA) y generación de filtros/descripciones con un modelo de IA real (hoy heurística local).
- Inscripción real en workflows, envío de correo y audiencias de anuncios (solo se deja constancia).
- Vistas guardadas de la lista de segmentos (hasta 50) y permisos por equipo aplicados en la UI.

## 2026-11-12 (sesión 4) · Segmentos según `especificacion-segmentos-propiedades-crm.md` PARTE A

**Construido**
- `src/filter-editor.js` (nuevo): editor y evaluador de filtros **compartido**. Sale del código que vivía dentro de `mountList` en `src/list.js` (que ahora lo usa vía `createFilterEditor`) y se apoya en `src/filter-ops.js` (operadores por tipo, evaluación) y `src/assoc-filters.js` (filtros de objetos asociados). Añade: categorías `Propiedades` / `Afiliaciones` (pertenencia a otros segmentos) / `Eventos` (marcada como no disponible), clonar grupo, límites 250 filtros / 60 asociados, valores múltiples separados por `;`, `matcherFor()` (matcher compilado) y `suggestConditions()` (propuesta de filtros a partir de texto, editable después).
- `src/segments-data.js`: segmentos activos (miembros calculados por filtros, también sobre registros asociados y afiliación a otros segmentos) y estáticos (foto fija en `memberIds`, edición manual), carpetas, clonar, convertir en estático, `processSegment` ("Guardar y procesar": recuento y foto), descripción generada. Muestra de 142 segmentos con nombres neutros.
- `src/data.js`: store de segmentos con el patrón de `activities` (caché + escritura optimista, fallback a localStorage `crm:segments` si la tabla no existe, siembra de la muestra la primera vez que la tabla está disponible). Nueva migración **`supabase/segments.sql`** (tabla `segments` con `filters`/`member_ids` jsonb, `access`, `campaign`, `import_id`, RLS abierta).
  - ⚠️ **Acción pendiente del usuario:** ejecutar `supabase/segments.sql` en el SQL Editor de Supabase. Hasta entonces los segmentos viven en localStorage.
- `segments/editor/` + `src/segment-editor.js` (nuevo): elegir objeto (contactos, empresas, negocios, tickets) → nombre editable (lápiz), `Añadir a carpeta`, panel izquierdo de filtros (editor compartido), vista previa en vivo con recuento, diálogo de guardado con tipo Activo/Estático, descripción (✦ generar), campaña y pestaña `Acceso` (ver/editar: todos, solo yo, equipos) → `Guardar y procesar segmento`. Segmento estático: añadir/quitar registros a mano. Menú `Usar segmento` con los usos de §4 (correo de marketing solo contactos, workflow, audiencia de anuncios solo contactos/empresas, encuesta solo estáticos de contactos, clonar).
- `segments/` + `src/segments.js`: la lista de la ronda anterior ahora abre el editor (crear, creación rápida, nombre/tamaño), y conserva carpetas, mover, clonar, convertir en estático y eliminar. Entrada de navegación: CRM › **Segmentos** (el nombre actual de "Listas" en el original).
- Los segmentos creados desde una importación (`src/import-engine.js`) se registran como segmentos activos sobre `hs_import_ids`.
- Pruebas: `scripts/smoke-segments.mjs` (lista, editor, filtros propios/asociados/afiliación, grupos O, estático manual, importación, editor compartido en listas).

**Lo que falta de la PARTE A** (según la espec)
- Categoría `Eventos` (interacción con CTA, inscripción en workflows) — no hay eventos en el modelo.
- Acceso real por usuario/equipo (hoy se guarda la configuración; no hay autenticación).
- Envío de correo de marketing, workflows, audiencias y encuestas como herramientas reales (hoy el menú `Usar segmento` lo explica y, en clonar, actúa).
- PARTE B (propiedades personalizadas: editor completo con reglas, datos sensibles, acceso, vista previa, clonación) sigue pendiente.

## 2026-11-12 (sesión 3) · Punto 1 (cierre): formularios dedicados para registrar actividades desde la ficha

**Construido** (espec `especificacion-actividades-crm.md` §1–2)
- `src/record.js`: nuevo `openLogModal(kind)` con formulario dedicado por tipo, con **fecha y hora** en que ocurrió (hora local, sin desfase UTC):
  - **Llamada**: dirección (Entrante/Saliente), resultado (los 6 predeterminados de HubSpot: Conectado, Ocupado, Dejó mensaje en directo, Dejó mensaje de voz, No contesta, Número equivocado), duración (5–60 min) y notas.
  - **Reunión**: título, duración, ubicación (Llamada telefónica / Videoconferencia / Dirección), descripción y —solo al registrar, no al programar— resultado.
  - **Correo**: asunto, dirección y cuerpo. **Mensaje** (LinkedIn / WhatsApp / SMS): dirección y texto.
  - **Tarea de seguimiento** (§2): al registrar llamada o correo, checkbox que crea una tarea real en `tasks` (vencimiento por defecto en 2 días laborables) y deja constancia en la cronología.
- Los botones rápidos **Llamar** y **Reunión** y el menú Más › *Registrar actividad* / *Programar una reunión* abren estos formularios (antes grababan texto enlatado sin formulario).
- Los datos estructurados viajan en la columna `extra` (jsonb) de `activities` (`outcome`, `direction`, `durationMin`, `locationType`, `channel`, `subject`); la cronología los muestra como etiquetas y con hora además de fecha. Nuevo tipo `message` con su chip de filtro «Mensajes».
- `src/app.css`: `.timeline__tags`, `.log-follow`.
- Sin migraciones nuevas (`extra` ya existía en `supabase/activities.sql`). Sin dependencias nuevas.

**Lo que falta del punto 1** (según la espec)
- Comentarios dentro de actividades, editar/eliminar actividad y restauración con papelera de 90 días.
- Páginas índice de actividades (listado global por tipo) y filtros por propiedad de actividad en la cronología.
- Asociaciones automáticas configurables y selector de asociaciones dentro del editor.
- Asistentes en reuniones, `Tipo de llamada`, recordatorios/cola en tareas, correo postal y subtareas.

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
