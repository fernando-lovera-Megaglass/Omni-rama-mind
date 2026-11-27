# Evidencia — gap-smoke-import-e2e-conteos (27-nov-2026)

Fallo reportado: `node scripts/smoke-import-e2e.mjs` termina en rojo «tras el cambio de historial a import_jobs
(46b2c78)»; el reporte menciona los conteos 100 filas · 88 nuevos · 3 actualizaciones · 9 no importables ·
15 errores.

## Qué falla de verdad

Los conteos son correctos y la prueba los acepta tal cual (`contacts: preview → 100 filas · 88 registros nuevos ·
3 actualizaciones · 9 filas no se importarán · 15 errores`, y lo mismo en la revisión, el monitor y en empresas,
negocios, tickets y tareas). La aserción que falla es otra, al final, en el escenario (d) «contactos con columna de
empresa»:

```
[import-e2e] FAIL: assoc: an ambiguous company name does not associate (reported as MULTIPLE_COMPANIES_WITH_DOMAIN)
```

Es la misma aserción que la evidencia de `user-importaciones-persisten-en-base` dejó anotada como «previa y ajena»
(fallaba igual con el motor de HEAD antes de 46b2c78, local y en vivo). No tiene que ver con `import_jobs`.

## Veredicto: regresión (del 24-nov), la prueba está bien

- El escenario: dos empresas «gemelas» con el mismo nombre y sin dominio; una fila del archivo trae ese nombre en la
  columna «Nombre de dominio de la empresa». El motor (`src/import-engine.js`, resolución de la columna de empresa)
  encuentra dos candidatas, registra el error `MULTIPLE_COMPANIES_WITH_DOMAIN` («El dominio coincide con varias
  empresas. Empresa no actualizada.») y no fija `companyId`… pero dejaba el texto ambiguo en `data.company`.
- El 24-nov (commit `53493ed`, gap-backend-crear-contacto-empresa-sin-vinculo) `addRecord('contacts', …)` y
  `setField(…, 'company', …)` empezaron a tratar el texto de empresa como una petición de asociación:
  `resolveContactCompanyName()` enlaza por nombre exacto al **primer** id coincidente, sin comprobar que el nombre sea
  único. Desde entonces el contacto importado con nombre ambiguo acababa asociado a una gemela elegida por id, en
  contra del error que el propio motor reporta; y la regla por dominio de correo (que el smoke espera para esa fila:
  «3 por la columna, 2 por la regla») ya no se aplicaba porque el texto explícito la desactiva.
- La prueba se escribió el 22-nov (`c7ea660`) y se afinó el 23-nov (`8e0f3af`) con este mismo escenario en verde;
  dejó de pasar con el cambio del 24-nov.

## Corrección (solo el motor de importación, 9 líneas)

`src/import-engine.js`: cuando la columna de empresa es ambigua, además del error, la fila **deja de llevar** ese
texto (`company` / `associatedcompany`) y la vista previa no lo lista entre los cambios de una actualización. La fila
se comporta como una sin columna de empresa: no se asocia a ninguna gemela (ni al crear ni al actualizar un contacto
existente, donde `setField('company')` habría hecho lo mismo) y la regla por dominio de correo puede aplicarse, que es
lo que ocurría hasta el 23-nov. No se toca `data.js` ni el comportamiento del formulario de alta (ahí el usuario
escribe un solo nombre y la resolución por nombre sigue igual).

## Pruebas (todas con código 0)

```
node scripts/smoke-import-e2e.mjs          → OK (contactos 88/3/91/15, empresas, negocios, tickets, tareas,
                                              asociación: 5 creados, 5 asociaciones, 1 error, la fila ambigua
                                              sin gemela y asociada por la regla de dominio)
node scripts/smoke-import-multifile.mjs    → OK (incluye «ambiguous key linked» = no)
node scripts/smoke-import.mjs              → OK
node scripts/smoke-import-owners.mjs       → OK
node scripts/smoke-import-jobs.mjs         → OK (PGlite, historial en import_jobs)
node scripts/smoke-contact-company-name.mjs → OK (la resolución por nombre del formulario no cambia)
node scripts/smoke-company-auto.mjs        → OK (regla por dominio de correo)
npm run build                              → en verde
```

Solo lógica de importación; sin cambios de UI, `app.css`, DESIGN.md ni capturas base. En vivo no se corrió (la prueba
e2e con `SMOKE_LIVE=1` crea datos «SMOKE» en la base real del usuario; el cambio no toca la base).

## Qué falta / para decidir

- `resolveContactCompanyName()` (`src/data.js`) sigue eligiendo el primer id cuando varias empresas comparten el
  nombre exacto. En el formulario de alta es lo que hay desde el 24-nov; si el usuario prefiere que un nombre ambiguo
  tampoco se enlace ahí (o que avise), es una decisión aparte.
- La cola (`scripts/build-queue.json`) no se edita: el orquestador cierra.
