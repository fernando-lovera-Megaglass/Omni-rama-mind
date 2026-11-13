# Progreso — Omni CRM

## 2026-11-13 (sesión 5) · Desduplicación por correo al importar (cola `dedupe-importacion`)

**Construido**
- `src/import-engine.js`:
  - `normalizeEmail` (sin espacios ni mayúsculas, sin `mailto:`/`<>`): el correo de la fila se guarda normalizado y se compara así contra el correo principal, los correos adicionales (`hs_additional_emails`) y el correo alternativo de los contactos existentes (los que `data.js` carga de Supabase).
  - Repetidos dentro del archivo con política elegible (`options.fileDuplicates`): **Conservar la primera fila** (regla del original: las demás fallan con `DUPLICATE_UNIQUE_PROPERTY_VALUE`), **Conservar la última fila**, o **Combinar las filas** (la primera manda y las siguientes rellenan sus valores vacíos; la fila combinada queda como `merged`, no como error). Las filas idénticas siguen siendo `DUPLICATE_ROW_CONTENT`.
  - Los tres modos del original deciden qué pasa con los que ya existen: **Crear y actualizar** (actualiza), **Solo crear** (salta los duplicados con `CREATE_ONLY_IMPORT`), **Solo actualizar** (salta las filas nuevas con `UPDATE_ONLY_IMPORT`).
  - Cada fila del plan lleva `duplicateOf` (`existing` / `file`), el contacto coincidente (`matchId`, `matchName`, `matchValue`), si coincidió por correo adicional (`secondary`) y las propiedades que cambiarían (`changes`). Resumen con `duplicatesExisting`, `duplicatesInFile`, `merged`, `withoutKey`.
  - `analyzeDuplicates(table, mapping, options)`: el informe previo (contra cuántos registros se comprobó, coincidencias con existentes, valores repetidos en el archivo y sus filas, nuevos, filas sin correo, inválidas).
  - El historial de importaciones guarda `duplicates`, `fileDuplicates`, `merged` y `filePolicy`.
- `src/data.js`: `refreshTable(type)` vuelve a leer la tabla de Supabase (y `dbIsLive()`); el asistente la llama al entrar en el paso 3 para que la comprobación use los contactos actuales, no solo los cargados al abrir la app.
- `src/import-wizard.js` (paso 3 «Detalles»): nuevo panel **Duplicados por correo electrónico** con los contadores, las tres opciones para los existentes (modo de importación, con el efecto explicado en cifras), las tres políticas para los repetidos del archivo, la tabla de coincidencias (fila, correo, contacto existente, propiedades que cambian, acción) y la lista de valores repetidos. La vista previa del resultado cuenta las filas combinadas; la revisión muestra «Duplicados actualizados/saltados» y los repetidos del archivo. Funciona igual para empresas (dominio) y para ID de registro.
- Pruebas: `scripts/smoke-dedupe.mjs` (análisis, modos, políticas, ejecución con combinación, segunda pasada, panel del asistente y revisión) + suite completa en verde; `npm run build` OK.

**Notas**
- Contra Supabase se compara con las filas que la app tiene en memoria tras `refreshTable` (lectura completa de la tabla al entrar en el paso 3); no hay consulta fila a fila.

## 2026-11-13 (sesión 5) · Paneles con datos reales (cola `reportes-datos-reales`)

**Construido**
- `src/reports.js` reescrito: desaparecen las series simuladas (`series(seed…)`, factor `scale`). Todo sale de los registros que `src/data.js` ya carga de Supabase (`allContacts/allCompanies/allDeals/allTickets/allTasks` y la nueva `allActivities`), filtrados por el rango elegido (Últimos 7 / 30 / 90 días, Este año) y comparados con el periodo anterior de la misma duración (deltas reales; "Periodo anterior: N" cuando no hay base de comparación). Mismo diseño: 4 KPI arriba y tarjetas de línea, barras, dona y tabla con el menú ⋯.
  - Ventas: negocios creados, ingresos cerrados (ganados por fecha de cierre, en la moneda de la empresa), contactos nuevos, tasa de cierre (ganados / cerrados); ingresos por periodo (línea con total), negocios creados por día/semana/mes, contactos por estado del lead (creados en el periodo), rendimiento por propietario (contactos nuevos, negocios creados, ingresos, tasa de cierre), llamadas registradas (actividades tipo llamada).
  - Marketing: contactos nuevos, leads nuevos (etapa Lead…), correos registrados (actividades tipo correo), empresas nuevas; contactos creados por periodo, leads por fuente, contactos por etapa del ciclo de vida, empresas por sector (empresas nuevas, contactos nuevos, negocios abiertos).
  - Servicio: tickets abiertos (todos los no cerrados), creados, cerrados (cerrados con última actividad en el periodo), tareas completadas (fecha de finalización o vencimiento); tickets creados por periodo, por estado, por prioridad, tareas por tipo (pendientes, vencidas, completadas).
  - Barras por día (7 días), por semana (30 y 90) o por mes (este año); estados vacíos ("Sin registros en el periodo seleccionado") en lugar de ceros falsos; el eje del gráfico de línea muestra los periodos.
- `src/data.js`: `allActivities()` (todas las actividades de la tabla `activities`; en modo local, las de localStorage).
- "Hoy" para los rangos es la fecha de referencia de la app (`TODAY`), igual que en listas y tareas.
- Pruebas: `scripts/smoke-reports.mjs` recalcula cada KPI desde los mismos registros para los 3 paneles y los 4 rangos, comprueba que las barras suman el total, que no aparece `NaN` y que un negocio ganado nuevo se refleja al instante. Suite completa (22 scripts) en verde; `npm run build` OK.

**Notas**
- Los indicadores que el CRM no guarda (visitas al sitio, tasa de apertura, tiempo de primera respuesta, satisfacción) se sustituyeron por métricas derivables de los registros.
- Los tickets no tienen fecha de cierre propia: se usa la última actividad del ticket cerrado como aproximación.

## 2026-11-13 (sesión 5) · Cola de tareas estilo HubSpot (cola `cola-tareas`)

**Construido**
- `src/task-queue.js` (nuevo): estado de la cola en localStorage (`crm:taskqueue`: ids, posición, completadas, omitidas, nombre de la vista), tramos de vencimiento compartidos (`dueMatches`, `dueText`, `dayDiff`), `completeTask` (estado + `completedAt`), y `mountQueueBar` → barra fija en la parte superior de las fichas mientras hay una cola: "Tarea N de M" con barra de progreso, título (enlace a la tarea), vencimiento (rojo si venció, naranja si es hoy), tipo, prioridad, asignada a, contacto; botones ‹ ›, **Omitir**, **Completar y siguiente** (o "Siguiente" si ya está completada; "Completar y terminar" en la última) y **Salir de la cola**. Si la ficha abierta no es la de la tarea actual, ofrece "Ir a la tarea". Al terminar: "Cola terminada · completaste X de M" con "Trabajar las omitidas (k)", "Volver a tareas" y "Salir".
- `src/tasks.js`: botón **Iniciar N tareas** en la barra de la lista (N = tareas pendientes de la vista actual, con sus filtros y orden; deshabilitado si no hay). Al pulsarlo abre la ficha del contacto asociado a la primera tarea (o la propia tarea si no tiene contacto), como el original. Nuevo filtro rápido **Fecha de vencimiento** (Vencidas, Hoy, Mañana, Esta semana, Próximos 7 días, Más adelante, Sin fecha); las vistas **Vencen hoy / Atrasadas / Próximas** calculan por día natural respecto a la fecha de referencia de la app. Banner "Cola en curso: tarea N de M … Continuar la cola / Salir" cuando hay una cola abierta. La columna de vencimiento colorea las vencidas y las de hoy.
- `src/record.js`: la tarjeta **Tareas** de la ficha (contacto) muestra una casilla por tarea para **completarla o reabrirla ahí mismo** (pendientes primero, "Vence hoy / Venció hace N días / Completada"); al completar se registra en la cronología ("Tarea completada: …") y se refresca la barra de la cola. La ficha de la tarea ("Marcar como completada") también actualiza la barra.
- Pruebas: `scripts/smoke-task-queue.mjs` (3 fases: lista, ficha de contacto con cola, ficha de tarea) + las 20 anteriores en verde. `npm run build` OK. Capturas en `/tmp/cany-shot/tq-*.png`.

**Notas**
- Las colas con nombre del original ("Mis colas", propiedad `hs_queue_membership_ids`) siguen siendo solo una propiedad de la tarea; la cola de trabajo se construye desde cualquier vista.
- "Hoy" es la fecha de referencia de los datos de muestra (`TODAY` en `src/data.js`), no el reloj del equipo.

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
