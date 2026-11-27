# Evidencia — user-importaciones-persisten-en-base (27-nov-2026)

Decisión del usuario (hallazgo 3 de la auditoría backend 26-nov-0512): el historial de importaciones debe quedar
en la base de datos (tabla `import_jobs`), no en localStorage; los registros importados conservan su sello; se
migra lo que haya en el navegador; se limpia el residuo de la papelera.

## Estado encontrado

- `import_jobs`: 0 filas; `user_settings`/`account_settings`: 0 claves `crm:imports*`; 0 registros activos con sello
  `hs_import_ids`; 2 empresas en la papelera (ids 47 y 56, residuo de corridas de prueba del 23-nov) con sello
  huérfano (sin fila en `import_jobs`).
- El código ya tenía `src/import-jobs.js` (escritura durable a `import_jobs` con cola de pendientes, reintentos y
  migración perezosa de `crm:imports` local/settings en `init()`), pero `importHistory()` —lo que lee el monitor
  de Integración de datos— seguía leyendo **solo** localStorage + settings. La única razón de las 0 filas es que
  la cuenta real no ha importado desde que existe esa escritura (las corridas de prueba se borran con su usuario
  desechable; `team_members` del usuario real está activo, con `team = ''`, y el disparador/RLS de
  `import_jobs` lo aceptan).

## Qué cambió

1. **El monitor lee la base** (`src/import-engine.js`): `importHistory()` parte de las filas de `import_jobs`
   cargadas al iniciar (`importJobs.rows`) y las combina con la copia local (solo aporta lo pendiente de
   sincronizar) y con la de settings (fallback heredado); para un mismo id gana el estado más avanzado (`newer`),
   así un navegador desconectado nunca esconde una corrida terminada. `importDetail()` toma la cronología y el
   ledger de deshacer de `importJobs.details` cuando la copia local no existe.
2. **Cada corrida inserta/actualiza su fila**: ya ocurría (`registerImport` → `persistJob`, `updateImport` y
   `setState` en cada cambio de estado) con usuario (`user_id` lo fija el disparador), archivo (`nombre`), objeto,
   estado, `new_count`, `updated_count`, `errors_count`, ledger (`undo_ledger`) y detalle. Verificado en vivo (abajo).
3. **Sellos `hs_import_ids`**: el motor ya los escribe en `extra` al crear (`stamp`) y al actualizar
   (`setField(..., 'hs_import_ids', ...)`); verificado en vivo con SQL (`extra->>'hs_import_ids'` en los 91 contactos
   de la corrida) para que «Ver segmento» y «Deshacer importación» apunten a registros reales.
4. **Migración perezosa**: `importJobs.init()` sube a `import_jobs` lo que haya en `crm:imports` del navegador y
   en settings (idempotente, `ignoreDuplicates`: una copia vieja nunca pisa una corrida durable). Cubierto por
   `scripts/smoke-import-jobs.mjs` (PGlite). Se ejecuta sola la próxima vez que el usuario abra la app con sesión.
5. **Residuo de la papelera**: migración `supabase/import-stamps-residue.sql`, aplicada con
   `node scripts/apply-migration.mjs` (anotada en `scripts/applied-migrations.json`):
   - **Respaldo previo**: tabla `public.companies_import_stamp_backup_20261127` (copia íntegra de las filas
     afectadas; permite revertir el UPDATE). No se borra ninguna fila.
   - UPDATE que retira solo la clave `hs_import_ids` de `extra` en empresas de la papelera cuyo sello no tiene fila
     en `import_jobs`.
   ```
   antes:   [{id:47, stamp:"1795365487574"}, {id:56, stamp:"1795413053517"}]
   después: huérfanos_restantes 0 · respaldo_filas 2 · filas_siguen_en_papelera 2 · respaldo_sellos "56:1795413053517, 47:1795365487574"
   ```
   Las dos empresas siguen en la papelera (borrarlas físicamente sería DELETE: requiere aprobación escrita).

Lo que **no** cambió: las copias en `user_settings` (`crm:imports*`) se siguen escribiendo como fallback (no se
pidió retirarlas); el flujo de importación, el asistente y el monitor no cambian de aspecto.

## Pruebas

- `node scripts/smoke-import-jobs.mjs` (PGlite, sin red): **PASS** — migración SQL idempotente, conteos, sesión
  fresca, ledger, reintentos y RLS por equipo.
- `SMOKE_LIVE=1 node scripts/smoke-import-e2e.mjs` (proyecto Supabase con usuario desechable `smoke.<sello>…`,
  limpiado al final): la corrida de 100 contactos termina **DONE** con 88 creados, 3 actualizados, 91
  asociaciones, 15 errores; en vivo se comprobó que los 91 contactos llevan el sello en `extra`, que el ledger
  existe, y la aserción nueva:
  ```
  live: import_jobs row 1795807022088 → DONE, «Contactos 100 mwzd4ked», new 88, updated 3, errors 15, ledger 88, user ok; importHistory() shows DONE with 88 new
  ```
  Tras la limpieza: 0 contactos smoke, 0 usuarios smoke, 0 filas en `import_jobs` (se van con su usuario), 0
  sellos huérfanos.
- `node scripts/smoke-import-e2e.mjs` (local, jsdom): contactos, empresas, negocios, tickets y tareas pasan
  (88/3/91/15, etc.).
- **Aserción previa que falla, ajena a esta tarea** (ya fallaba con el código de `HEAD` antes de tocar nada; se
  comprobó intercambiando `src/import-engine.js`): escenario (d) «assoc: an ambiguous company name does not
  associate (reported as MULTIPLE_COMPANIES_WITH_DOMAIN)», tanto local como en vivo. El motor asocia hoy un
  contacto a una empresa por nombre ambiguo cuando el smoke espera que no lo haga. Queda para triaje (parece
  relacionado con los cambios recientes de asociación contacto–empresa); no se tocó porque no es parte de esta
  decisión.
- Suite Playwright completa (modo demo, `npx playwright test`): 160 pruebas; fallan solo las dos visuales de
  Bandeja (17 píxeles, pendientes de aprobación del usuario desde la tarea del selector de propietario). Durante la
  pasada otro carril corría Playwright en la misma carpeta y tres visuales (Plantillas 1440, Empresas-ficha 1280,
  Tareas-ficha 1280) difirieron por antialiasing del texto (p. ej. 403 píxeles sueltos sobre las letras); repetidas
  solas pasan 6/6. En demo no hay cliente Supabase y `importHistory()` se comporta igual que antes.
- `npm run build` en verde.

## Qué falta / para decidir

- Si se retiran las copias `crm:imports*` de `user_settings` ahora que `import_jobs` es la fuente.
- Triaje de la aserción (d) del smoke e2e (asociación por nombre ambiguo).
- Si se borran físicamente las 2 empresas smoke de la papelera (requiere aprobación: DELETE).
