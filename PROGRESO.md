# Progreso — Omni CRM

## 2026-11-13 (sesión 5) · Selección masiva en las listas (barra de acciones del original)

**Construido** (`src/list.js`, común a todas las listas; configurado en `contacts.js`, `companies.js` y `deals.js`)
- Casilla por fila y casilla de encabezado «seleccionar todos los de la página»; las filas seleccionadas quedan resaltadas.
- Con ≥1 fila seleccionada aparece una **barra fija sobre la tabla**: «N contactos seleccionados» (con concordancia: «1 empresa seleccionada»), X para limpiar y las acciones. Al marcar toda la página con más registros en la vista, la barra ofrece «Seleccionar los N contactos de la vista completa» (y después «Los N … están seleccionados · Limpiar selección»).
- Acciones (cada una en un diálogo propio con Aplicar/Cancelar, cierra con Escape):
  - **Asignar**: propietario de una lista → `setField(owner)` por registro (UPDATE en Supabase en modo conectado).
  - **Editar**: propiedad de una lista (las editables del catálogo con sus opciones; sin nombre, correo ni calculadas) y valor nuevo (lista o texto según la propiedad) → `setField` por registro.
  - **Eliminar**: confirmación «Eliminar N contactos» en rojo → `deleteRecords` (DELETE en Supabase), con aviso de que pueden restaurarse.
  - **Crear tareas** (contactos): título, tipo, vencimiento y asignada a → una tarea por contacto, asociada a él (`contactId`).
  - **Agregar a segmento** (contactos, empresas y negocios): segmento estático existente del mismo objeto o uno nuevo con nombre → `addStaticMembers` / `addSegment` con los ids.
  - **Exportar**: CSV de la selección (ya existía).
- Empresas y negocios usan la misma barra con Asignar, Editar, Eliminar, Agregar a segmento y Exportar; el resto de listas conservan Asignar, Editar, Eliminar y Exportar.
- Pruebas: `scripts/smoke-bulk.mjs` (selección, página y vista completa, resaltado, las cinco acciones en contactos, Asignar/Eliminar en empresas y negocios, Escape) + suite completa (29) en verde; `npm run build` OK.

## 2026-11-13 (sesión 5) · «Crear contacto» como panel lateral del original (`exploracion-hubspot/exploracion-2026-11-13.md`)

**Construido**
- `src/create-contact.js` (nuevo) + `src/contacts.js`: «Agregar contactos» ya no abre un menú ni cambia de página: abre un **panel deslizante a la derecha** (450 px, sombra, cabecera oscura, cierra con la X, Cancelar, Escape o el fondo). Campos en el orden del original: Correo (email), Nombre *, Apellidos *, Cargo, Propietario del contacto (lista de propietarios; por defecto el usuario de la sesión, emparejado por nombre, o el primero), Estado o región, País/región (lista), Número de teléfono, Número de móvil, Rol de compra (Persona que toma la decisión, Influenciador, Usuario final, Otro).
- **Crear** y **Crear y agregar otro** quedan deshabilitados hasta que Nombre y Apellidos tengan valor; «Crear y agregar otro» guarda, limpia y deja el panel abierto; «Cancelar» cierra sin guardar.
- **Duplicados en vivo**: el área inferior empieza con «Comienza por escribir el nombre del Contacto, su correo o ambos.»; al escribir correo, nombre o apellidos (300 ms de espera) busca contactos parecidos — en Supabase con `ilike` sobre `name` y `email` (hasta 5), o en los registros locales sin conexión — y muestra «Posibles duplicados» con nombre y correo enlazados a la ficha. Al guardar con un **correo que ya existe** (comparación exacta sin mayúsculas) no se crea: avisa, enlaza al contacto existente («Abrir el existente») y permite cambiar el correo.
- Guardado: `addRecord('contacts', …)` → INSERT en la tabla `contacts` de Supabase con las columnas existentes (`first`, `last`, `name`, `email`, `phone`, `mobilephone`, `owner`, `country`, `job_title`…; `state` y `hs_buying_role` van a `extra`), propietario = usuario actual, estado del lead Nuevo, etapa Lead, fuente «Creación manual»; después cierra el panel, refresca la lista y muestra «Contacto creado». La regla de empresa por dominio del correo (sesión anterior) sigue aplicándose al crear.
- `src/list.js`: opción `addDirect` (botón directo en vez de menú) y `openCreate` (panel propio de la página) también para el «+» de las columnas del tablero; las demás listas conservan el cajón genérico.
- Pruebas: `scripts/smoke-create-contact.mjs` (apertura sin navegar, orden de campos, obligatorios, propietario por defecto, duplicados con espera, crear y agregar otro, correo duplicado, cerrar con Cancelar/Escape/X, refresco de la lista) + suite completa (28) en verde; `npm run build` OK.

## 2026-11-13 (sesión 5) · Acceso solo para usuarios invitados

**Construido**
- `supabase/invitations.sql` (nueva migración, **ya aplicada** al proyecto con `scripts/apply-migration.mjs`): tabla `public.invitations` (`email citext` única, `invited_by uuid` por defecto `auth.uid()`, `created_at`); RLS de lectura, inserción y borrado solo para `authenticated` (cualquier usuario del equipo puede invitar por ahora); semilla con `fernando-lovera@megaglass.us` y los correos de los propietarios de la muestra (`fernando.l`, `sofia.r`, `diego.g`, `laura.m` @megaglass.us) con `ON CONFLICT DO NOTHING`; disparador `require_invitation_before_insert` BEFORE INSERT en `auth.users` (función `security definer` con `search_path` fijo) que lanza «Solo usuarios invitados: este correo no tiene invitación» si el correo en minúsculas no está invitado — aplica a cualquier vía (registro con contraseña, enlace mágico, API directa). Los usuarios existentes y la sesión actual no se tocan; las políticas `anon full access` de las tablas de datos siguen igual.
- `src/auth.js`: desaparece `signUp`; nuevo `signInWithOtp` (enlace mágico, crea la cuenta solo si el correo está invitado), `INVITE_MESSAGE` e `isNotInvitedError` (Supabase devuelve «Database error saving new user» cuando el disparador rechaza la cuenta; se muestra «Tu correo no tiene invitación. Pide al administrador que te invite.»).
- `src/main.js` (pantalla de inicio): sin «crear una cuenta». Flujo: correo → contraseña (si ya la tiene) con «¿Olvidaste tu contraseña?», «Enviarme un enlace mágico» y «Usar otro correo»; modo **Entrar con enlace mágico** (sin contraseña); restablecer y recuperación como antes. La primera pintura sigue siendo la del original.
- `src/invitations.js` (nuevo): `listInvitations`, `invite` (valida el formato, inserta y envía el enlace mágico; los duplicados se detectan), `revoke`; sin Supabase guarda en el navegador y no envía correo.
- `src/settings.js` › Usuarios y equipos › pestaña **Invitaciones** (sustituye a los usuarios de muestra): lista desde Supabase (correo, fecha, estado — «Aceptada · tú» para el usuario con sesión, «Pendiente» para el resto, porque `auth.users` no es consultable desde el cliente), campo «Invitar» (valida, inserta y envía el enlace), «Reenviar enlace» y «Revocar» (borra la fila; no permite revocarse a uno mismo). Las pestañas Licencias, Equipos y Ajustes preestablecidos siguen igual.
- `scripts/mgmt-sql.mjs` + `scripts/apply-migration.mjs`: aplican un archivo de `supabase/` con el token de gestión guardado en `app/.supabase-mgmt-token` (nunca se imprime) y lo anotan en `scripts/applied-migrations.json`.
- Pruebas: `scripts/smoke-invitations.mjs` — parte 1 (siempre): pantalla de invitaciones con clientes simulados (listar, invitar, formato inválido, duplicado, reenviar, revocar) y el mapeo del error del disparador; parte 2 (`node --env-file=.env …`, contra el proyecto real): disparador instalado y semilla presente, `anon` no puede leer ni insertar invitaciones, el enlace mágico de un correo invitado lo acepta Supabase (hoy solo lo frena la cuota horaria de correos del servicio integrado: «email rate limit exceeded»), inserción directa en `auth.users` de un correo invitado pasa y de uno no invitado lanza el mensaje del disparador, y `signUp` / `signInWithOtp` de un correo NO invitado devuelven «Database error saving new user» (sin crear usuario); limpia las filas y usuarios de prueba al terminar. `scripts/smoke-auth.mjs` actualizado (enlace mágico en vez de registro). Suite completa (27) en verde; `npm run build` OK.

**Notas**
- Supabase rechaza como inválidos los correos de dominios reservados o sin servidor de correo (example.com y dominios inventados): la prueba en vivo usa buzones desechables `*.prueba.<marca>@megaglass.us` que se eliminan al final.
- Para invitar sin la app: `insert into public.invitations (email) values ('persona@empresa.com');` en el SQL Editor. Para quitar la restricción: `drop trigger require_invitation_before_insert on auth.users;`.

## 2026-11-13 (sesión 5) · Datos ficticios de prueba en `activities` y `segments`

**Construido**
- `scripts/seed-demo-activities-segments.mjs` (ejecutar con `node --env-file=.env scripts/seed-demo-activities-segments.mjs`): siembra en Supabase, respetando el esquema actual de ambas tablas:
  - 30 actividades de las últimas 3 semanas, con el prefijo «[Prueba]» y contenido claramente ficticio: 11 llamadas (resultados Conectado / Ocupado / No contesta / Dejó mensaje de voz / Dejó mensaje en directo / Número equivocado, entrantes y salientes, 5–30 min), 7 correos (asunto y dirección), 6 reuniones (duración, lugar, resultado; una programada) y 6 notas, asociadas a contactos (1, 2, 3, 5, 6, 11, 16, 21, 26), empresas (1, 4, 7, 8, 15, 22) y negocios (1, 2, 4, 5, 7, 9) de la muestra. `extra` lleva los mismos campos que escribe la ficha (`outcome`, `direction`, `durationMin`, `locationType`, `subject`).
  - 12 segmentos «Prueba · …» (9 activos y 3 estáticos sobre contactos, empresas y negocios) con `filters` en el formato real del editor (Y dentro del grupo, O entre grupos, `anyof` en listas, `contains` en texto, `gt` en importes), tres carpetas («Pruebas de filtros», «Campañas ficticias») y campañas; los estáticos llevan `member_ids`. El tamaño de cada activo se calcula con el propio `segmentMembers` de la app y se guarda en `size`.
  - Idempotente: cada fila lleva `extra.seed = "omni-demo-2026-11"`; al volver a ejecutar se borran solo las filas de la siembra anterior y se insertan de nuevo. No toca las demás filas.
  - Fase 2 de verificación: carga los módulos de la app (con una sesión simulada para pasar la protección de rutas) y confirma que `segments()` ve los 12 segmentos con miembros y que `activitiesFor` lee las actividades de varios registros. Resultado: `activities` = 42 filas (30 sembradas), `segments` = 12.
- `src/supabaseClient.js`: en Node (`import.meta.env` no existe) lee las claves de `process.env`, así los scripts con `--env-file=.env` usan los mismos módulos que la app. Las pruebas sin `.env` siguen en modo local.

**Notas**
- La siembra usa la clave anónima (políticas `anon full access`); `user_id` queda en NULL en esas filas.

## 2026-11-13 (sesión 5) · Autenticación real con Supabase Auth (cola `auth-supabase`)

**Construido**
- `src/auth.js` (nuevo): sesión con correo y contraseña sobre Supabase Auth (la sesión persiste y se renueva sola en localStorage): `getSession`, `currentUser`, `requireSession` (protección de rutas: sin sesión manda a la pantalla de inicio con `?next=` para volver después), `signIn`, `signUp` (con confirmación por correo si el proyecto la exige), `resetPassword`, `updatePassword`, `signOut`, `onAuthChange`, mensajes en español (`authMessage`). Sin Supabase (modo local y pruebas) todo queda desactivado y la app funciona como antes.
- `src/data.js`: antes de cargar cualquier dato, `initFromSupabase` exige sesión (`requireSession`). Si hay sesión pero las tablas parecen vacías mientras la clave anónima sí ve filas, muestra un aviso a pantalla completa pidiendo ejecutar `supabase/auth.sql` (y no intenta sembrar datos).
- `index.html` + `src/main.js` (pantalla de inicio): la primera pintura es la del original (solo el correo). «Continuar» muestra el paso de contraseña (con «¿Olvidaste tu contraseña?» y «Usar otro correo»); «crear una cuenta» pasa al registro (contraseña y confirmación, mínimo 6 caracteres); restablecer contraseña envía el enlace; el enlace de recuperación abre el formulario de contraseña nueva. Los errores y avisos se muestran en la caja de alerta existente. Con sesión activa, la pantalla entra directamente. Sin Supabase, «Continuar» entra como antes.
- `src/shell.js`: el menú de cuenta de la barra superior muestra la inicial, el nombre o correo del usuario y su correo, y el botón **Cerrar sesión** cierra la sesión y vuelve a la pantalla de inicio (también si la sesión se cierra en otra pestaña).
- `supabase/auth.sql` (nueva migración, instrucciones dentro): PASO 1 seguro — mantiene las políticas `anon full access` (no rompe el acceso actual), añade `authenticated full access` en companies, contacts, deals, tickets, tasks, activities y segments (sin ellas un usuario con sesión vería el CRM vacío), añade `user_id uuid default auth.uid()` con índice en cada tabla, y crea `profiles` con disparador al registrarse. PASO 2 opcional y comentado — aislar por usuario (`owner only`, quita el acceso anónimo) con las instrucciones para asignar las filas existentes.
  - ⚠️ **Acción pendiente del usuario:** 1) en Supabase › Authentication › Providers activar Email (y decidir «Confirm email»); 2) en URL Configuration poner la URL de la app; 3) ejecutar `supabase/auth.sql` en el SQL Editor; 4) abrir la app, «crear una cuenta» y entrar. Hasta ejecutar el SQL, tras iniciar sesión se ve el aviso explicativo.
- Pruebas: `scripts/smoke-auth.mjs` (helpers, protección de rutas, pantalla de inicio en todos sus modos, menú de cuenta y cierre de sesión con un cliente de prueba) + suite completa (26) en verde; `npm run build` OK. Comprobado contra el proyecto real: `/contacts/` sin sesión redirige a la pantalla de inicio y una contraseña incorrecta devuelve «Correo o contraseña incorrectos».

**Notas**
- Las claves (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) siguen en `app/.env`; la anon key es pública por diseño y la seguridad real la dan las políticas RLS del PASO 2 cuando se active.

## 2026-11-13 (sesión 5) · Pipeline de soporte con estados propios y empresa del contacto en tickets (cola `pipeline-tickets-default`, espec `especificacion-tickets-crm.md`)

**Construido**
- `src/data.js`: los pipelines de tickets ahora tienen **sus propios estados** (`ticketPipelineDefs()`: `{ id, name, stages: [[clave, nombre, 'open' | 'closed']] }`, clave `crm:pipelines:tickets`; las listas antiguas de solo nombres se migran solas). El **Pipeline de soporte** predeterminado existe desde el principio con los cuatro estados de la especificación: Nuevo, En espera de contacto, En espera de nosotros (abiertos) y Cerrado (cerrado); los demás pipelines de muestra y los nuevos nacen con esos mismos cuatro. Helpers: `ticketStatusesFor`, `allTicketStatuses`, `ticketStatusLabel`, `ticketStatusIsClosed`, `isTicketOpen`, `firstOpenTicketStatus`, `ticketPipelineCounts` (abiertos/cerrados por pipeline). La muestra reparte los tickets entre los cuatro estados.
- **Empresa principal del contacto** (§1): al crear un ticket con contacto (formulario, ficha, importación) o al asociarle un contacto después, `autoAssociateTicketCompany` lo asocia a la empresa principal de ese contacto y deja nota en la cronología; no toca tickets que ya tienen empresa. Interruptor en Configuración › Objetos › Tickets («Asociar los Tickets a la empresa principal del Contacto», activo por defecto, clave `crm:settings:obj-tickets.autoCompany`).
- `src/tickets.js`: el tablero usa los estados del pipeline elegido (todos los pipelines → unión de estados; los cerrados marcados con ✓), el selector de pipelines muestra «N abiertos · M cerrados» por pipeline (indicador de §7), vistas Tickets abiertos / cerrados por tipo de estado, columna Empresa asociada, y al crear: primer pipeline y su primer estado abierto como valores por defecto (un estado que no pertenezca al pipeline se corrige).
- `src/record.js`: la ficha del ticket muestra los estados de su pipeline (con tipo abierto/cerrado y nota del pipeline), el selector de estado solo ofrece los de su pipeline, tarjeta **Empresas** (asociación manual sincronizada con `companyId`), y la ficha de la empresa lista también los tickets asociados por `companyId`. Crear un ticket desde la ficha de un contacto lo asocia al contacto (y por tanto a su empresa).
- `src/settings.js` › Objetos › Tickets › Pipelines: tabla con estados, abiertos y cerrados por pipeline, «Predeterminado» en el primero; **Administrar** edita nombre y tipo de cada estado, reordena, agrega (los abiertos quedan antes que los cerrados), elimina (no si tiene tickets; siempre queda al menos un abierto y un cerrado), renombra el pipeline (los tickets lo siguen) y clona; no se elimina un pipeline con tickets.
- `src/import-engine.js`: el estado importado se valida contra los estados del pipeline de la fila (por clave o nombre); si no existe → `INVALID_DEAL_STAGE`.
- `src/reports.js`: abiertos/cerrados por tipo de estado. `src/list.js`: el selector de pipelines admite un detalle por pipeline.
- Pruebas: `scripts/smoke-ticket-statuses.mjs` + suite completa (25) en verde; `npm run build` OK.

**Notas**
- Reglas de pipeline (impedir retroceso, acceso por estado, propiedades condicionales) y automatizaciones por estado para tickets quedan como en la ronda anterior (solo negocios); los pipelines de tickets viven en localStorage, los tickets en Supabase (`companyId` y `company` en `extra`).

## 2026-11-13 (sesión 5) · Empresas automáticas por dominio del correo (cola `empresas-auto-dominio`, espec `especificacion-empresas-crm.md` §2)

**Construido**
- `src/data.js` (regla central, se ejecuta en cualquier alta de contacto: formulario, ficha, clonado, importación; y al cambiar el correo o el sitio web de un contacto):
  - `companyDomainFor(contact)`: dominio del correo; si es un correo gratuito (`FREE_EMAIL_DOMAINS`: gmail, yahoo, hotmail, outlook, icloud…), se usa la URL del sitio web del contacto **solo para asociar** a una empresa que ya exista (nunca crea una a partir del sitio web). Los subdominios cuentan como dominios distintos; `www.` se ignora.
  - `autoAssociateCompany(contacto)`: no hace nada si la opción está apagada, si el contacto ya tiene empresa (las asociaciones existentes no se tocan), si el dominio está en `Dominios excluidos` o si no hay dominio. Si existe una empresa con ese dominio (varias → la de id menor), asocia; si no, **crea** la empresa (nombre a partir del dominio, propietario del contacto, etapa del ciclo de vida del contacto, marcada `hs_created_by_automation`) y asocia. Deja nota en la cronología del contacto y de la empresa.
  - `applyCompanyAutomation({ dryRun })`: pasada retroactiva sobre los contactos sin empresa (vista previa o aplicación real).
  - Ajustes: `crm:settings:obj-companies.autoCreate` (activo por defecto) y `crm:companies:excluded-domains` (hasta 1.000 dominios).
- `src/settings.js` › Objetos › Empresas › Automatización: la casilla **Crea y asocia Empresas con Contactos** ya funciona; al activarla se pregunta si aplicar también a los contactos existentes con una vista previa (cuántos se asociarían, cuántas empresas se crearían, cuántos quedan igual por correo gratuito o sin correo) y botón «Aplicar ahora a los contactos existentes»; lista de dominios excluidos con validación y tope de 1.000.
- `src/import-engine.js`: las filas importadas que traen asociación (columna «Empresa» o «Nombre de la empresa» con una empresa existente) la conservan; las demás reciben su empresa por dominio; el resultado cuenta `autoCompanies`.
- Pruebas: `scripts/smoke-company-auto.mjs` (creación, mismo dominio, subdominio, correo gratuito con y sin sitio web, asociación previa, exclusiones, interruptor, cambio de correo, pasada retroactiva, importación, página de ajustes) + suite completa (24) en verde; `npm run build` OK.

**Notas**
- La regla solo crea empresas desde el dominio del correo; el sitio web del contacto sirve únicamente para asociar (la muestra de datos genera sitios web ficticios para todos los contactos y, si no, se habrían creado decenas de empresas falsas).

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
