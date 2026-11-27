# Evidencia — user-fecha-creacion-real (27-nov-2026)

Decisión del usuario (hallazgo 2 de la auditoría backend 26-nov-0512): la fecha de creación debe ser la real.
Hasta hoy `src/data.js` fija `TODAY = new Date(2026, 10, 7)` (ancla de la siembra demo) y todo registro nuevo
sellaba `created` con esa fecha fija.

## Qué cambió

1. **Registros creados desde la app sellan `created` con el momento real** (`src/data.js`):
   - `addRecord`, rama con base de datos (antes línea 1412) y rama demo (antes 1446): `created: new Date().toISOString()`.
   - `addLineItems` (partidas de un negocio): el sello `created` también usa la hora real.
   - Panel «Crear negocio» (`src/create-deal.js`): el campo «Fecha de creación» venía prellenado con el ancla
     (`dateInput(TODAY)`) y se enviaba tal cual, así que un negocio creado hoy quedaba con 7-nov-2026 aunque
     `addRecord` sellara bien. Ahora el campo se prellena con el día real y, si el usuario no lo toca, el negocio
     sella fecha **y hora** reales; si elige otro día, se respeta ese día (comportamiento existente del campo).
2. **Defaults de importación con fecha real** (`src/import-engine.js`, `newRecordDefaults`): `lastActivity`
   (contactos, empresas, negocios, tickets, tareas) = momento de la importación; `closeDate` de negocios sin
   fecha de cierre = hoy real + 30 días. El motor ya no importa `TODAY`.
3. **La fecha original de HubSpot se conserva**: el catálogo ya incluía `created` («Fecha de creación», datetime)
   en contactos, empresas, negocios y tickets, y el motor ya pasaba cualquier columna mapeada a `created` por
   encima del sello (`{ created: now, ...fields }`), así que un archivo en español se mapeaba solo. Faltaba el
   encabezado de las exportaciones de HubSpot en inglés: se agregó el alias `Create Date` (y `Created Date`,
   `createdate`, `created`) en `COMMON_EN` para que el mapeo automático lo reconozca en todos los objetos.
   Verificado: contacto con «Create Date = 2024-03-15 14:22» queda creado el 15-mar-2024 14:22; empresa con
   «Fecha de creación = 03/02/2022 09:30» queda el 3-feb-2022 09:30; `lastActivity` sigue siendo el momento real
   de la importación; una fila que actualiza un registro existente sin traer fecha no toca su `created`.
4. **No se reescribió ninguna fecha existente**: sin migración ni UPDATE. Los sembrados con 2026-11-07 siguen
   igual (en vivo: contacts 4, companies 4, deals 1, tickets 3, consultado solo con SELECT antes de tocar nada).

### `TODAY` se queda donde la siembra demo lo necesita (revisado antes de tocarlo)

`TODAY` sigue exportado desde `src/data.js` (línea 493) y lo usan 25 archivos (89 usos) para datos de ejemplo y
cálculos relativos. Se dejó intacto todo lo que no pide la tarea:

- Siembra demo: `daysAgo()`, `sampleValue()` (fechas de muestra por registro), `lastActivity` de los sembrados.
- «hace N días» (`data.js:557`) y los filtros relativos «Creados este mes / Últimos 30 días» de las listas
  (`contacts.js:11`, `companies.js:10`, deals, tickets) siguen midiendo contra el ancla, igual que antes.
- Sellos que NO son `created` en los paneles de creación de la app: `lastActivity` en Crear contacto
  (`create-contact.js:79`), Crear empresa (`create-company.js:71`), Crear ticket (`create-ticket.js:209`),
  cajón genérico de contactos/empresas (`contacts.js:138`, `companies.js:105`), empresa automática por dominio
  (`data.js:2301`); en Crear negocio, `closeDate` por defecto = ancla + 30 (`create-deal.js:237`),
  `lastActivity` y `stageEnteredAt` (`:251-252`); vencimiento por defecto de Crear tarea = ancla + 3 días
  (`task-form.js:22,49,50`). La tarea solo pide `created` en la app y `lastActivity`/`closeDate` en la
  importación; estos quedan listados abajo para decidir.

## Capturas (modo demo, reloj fijo de las pruebas 22-nov-2026 09:00; `antes/` = código de `HEAD`, `despues/` = este cambio)

`docs/evidencia/user-fecha-creacion-real/antes|despues/`, a 1440 y 1280:

- `contacto-01-crear-*`: panel «Crear contacto» lleno → `contacto-02-fila-lista-*`: la fila nueva en la lista →
  `contacto-03-ficha-acerca-de-*`: tarjeta «Acerca de este contacto» con **Fecha de creación: 7 nov 2026 (antes)
  → 22 nov 2026 (después)**; `contacto-04-ficha-resumen-*` (resumen generado) y `contacto-05-ficha-*` (ficha
  completa).
- `negocio-01-crear-*`: panel «Crear negocio» con el campo «Fecha de creación» prellenado **11/07/2026 (antes) →
  11/22/2026 (después)**, sin tocarlo → `negocio-03-ficha-acerca-de-*`: **Fecha de creación 7 nov 2026 → 22 nov
  2026**; `negocio-04/05`.

Ninguna pantalla cambia de aspecto: solo el valor de la fecha. Sin texto encimado ni cortado; sin errores de
consola (las pruebas de captura usan los fixtures de la suite, que fallan ante cualquier error de consola).

## Pruebas

- **Nuevo** `node scripts/smoke-fecha-creacion.mjs` (jsdom, modo demo): **PASS** — 25 comprobaciones: la siembra
  conserva su ancla y ningún sembrado (420 contactos, 36 empresas, 150 negocios, 84 tickets, 64 tareas) lleva la
  fecha de hoy; `addRecord` de los 5 objetos y `addLineItems` sellan la hora real; un `created` explícito se
  respeta; importación de contactos sin fecha (created y lastActivity reales), de negocios (closeDate = hoy + 30),
  archivo HubSpot EN («Create Date» → created, fecha original conservada), archivo HubSpot ES («Fecha de
  creación»), actualización por importación conserva `created`; nada sembrado cambió.
- **Live** `SMOKE_LIVE=1 node scripts/smoke-create-contact.mjs` (usuario desechable `smoke.createcontact.<sello>`,
  limpiado al final): se agregó la comprobación de que `created` en `public.contacts` es la fecha real:
  ```
  [create-contact:live] contacto «SMOKE Contacto mwzdywq0» en la base (id 424, smoke.mwzdywq0@ejemplo.com)
  [create-contact:live] created en la base: 2026-11-27 19:40:28.101+00 (hace 3 s; ancla demo 2026-11-07)
  [create-contact:live] OK
  [create-contact:live] limpieza: registros SMOKE y usuario eliminados
  ```
- `scripts/smoke-create-deal.mjs`: la aserción del prellenado «created = 2026-11-07» pasa a «created = día real»
  (el resto igual; la fecha elegida a mano 2026-11-05 se sigue respetando). **PASS**.
- Smokes existentes repetidos en verde (local, sin red): smoke-import, smoke-create-contact, smoke-create-deal,
  smoke-create-ticket, smoke-deal-close-date, smoke-record-create, smoke-line-items, smoke-import-undo,
  smoke-import-multifile, smoke-import-transfer, smoke-import-segment, smoke-import-cleanup, smoke-company-auto,
  smoke-last-activity.
- `node scripts/smoke-import-e2e.mjs` (local): igual que antes de esta tarea: falla solo la aserción (d)
  «assoc: an ambiguous company name does not associate», ya reportada como preexistente en la evidencia de
  user-importaciones-persisten-en-base; todo lo demás pasa.
- Suite Playwright completa (`npx playwright test`, 1440 y 1280, sin tocar capturas base, corrida en el árbol de
  trabajo compartido): **164 en verde, 8 fallan, 2 no corren**, ninguna por este cambio:
  - Bandeja ×2 (17 píxeles de la flecha de «Asignar a», pendientes de aprobación del usuario desde la tarea del
    selector de propietario).
  - Contactos-lista ×2 y Contactos-ficha ×2: diferencias visuales de la tarea `user-frontend-contactos`, que otro
    carril está construyendo en este mismo árbol (sus cambios en `src/list.js`, `src/record.js`, `src/app.css`,
    `contacts/index.html` están sin commit; su propia evidencia prevé exactamente esos fallos).
  - `_captura-contactos` y `_captura-inventario` ×1 cada uno (+ 2 que no corren): especificaciones temporales de
    captura de ese mismo carril, sin versionar.
  Este cambio no crea registros en ninguna prueba (todas corren con reloj fijo y datos demo), así que ninguna
  captura base cambia; las capturas de evidencia de arriba se hicieron con una especificación temporal que no se
  versiona.
- `npm run build` en verde.
- `rebuild_check`: no pudo correr en esta tarea («checks/round-0 already exists»: otro carril dejó su comprobación
  de las 14:03 en esa carpeta, que el verificador no sobrescribe). Esa comprobación de las 14:03 es del mismo árbol
  de trabajo con este cambio ya aplicado: la build sirve «Inicio de sesión | Omni» a 1440/768/390 sin
  desplazamiento lateral. Este cambio no toca HTML ni CSS, así que no afecta la comparación visual del
  verificador (90 % en la tarea anterior del mismo día).

## Qué falta / para decidir

- Los demás sellos de los paneles de creación que siguen usando el ancla (lista arriba: `lastActivity`,
  `stageEnteredAt`, `closeDate` por defecto en Crear negocio = 7-dic-2026, vencimiento por defecto de tareas) y
  los filtros relativos «Últimos N días» que miden contra 7-nov-2026. No se tocaron porque la tarea no lo pide.
- Corregir las fechas ya sembradas (contacts 4, companies 4, deals 1, tickets 3 con 2026-11-07): decisión aparte
  del usuario, como indica la tarea.
