# gap-backend-crear-contacto-empresa-sin-vinculo

## Reapertura 24-nov-2026 — validación local

La resolución por nombre/dominio y el SQL de reparación ya estaban presentes en este checkout al comenzar. La evidencia anterior no acreditaba aplicación en producción. Se respeta la instrucción actual «No despliegues nada a producción; solo código local»: no se ejecutó `mgmt-sql.mjs`, no se modificó la base remota y no se afirma que el contacto 421 vivo esté reparado. La reparación y el conteo siguientes corresponden exclusivamente a PostgreSQL local PGlite. El estado vivo reportado por el usuario continúa pendiente de reparación fuera del alcance local.

Cambios nuevos en backend: `addRecord('contacts', ...)` normaliza los espacios del texto de empresa, evitando almacenar una empresa formada solo por espacios. La resolución ignora correos y sitios web de ejemplo añadidos por `augment()`; usa los datos reales para dedupe por dominio. La nueva prueba falló antes de este último cambio: un alta sin correo se asociaba incorrectamente con `Concurrent SA` por un dominio de ejemplo compartido. Después de corregirlo crea la empresa solicitada y su asociación primaria.

Pruebas de reapertura (sin red):

- `node scripts/smoke-contact-company-name.mjs`: PASS. Ejecuta los hooks reales de datos con un adaptador SQL local. Incluye el camino sin `waitForSave` del formulario genérico y verifica mediante JOIN `contacts.company_id`, empresa y `contact_companies.is_primary=true`. La consulta exacta `SELECT count(*) FROM contacts WHERE coalesce(company,'')<>'' AND company_id IS NULL` da **1 antes y 0 después** de ejecutar el SQL de reparación sobre una reproducción local del contacto 421. Reparación repetida sin duplicados. Log: `reapertura-company-name.log`.
- `node scripts/smoke-create-contact.mjs`: PASS. Además del panel habitual, envía el formulario genérico real `#create-form` de `src/list.js` con `cfg.createFields` de contactos en JSDOM y comprueba empresa e identificación de asociación primaria en modo localStorage. Log: `reapertura-smoke-create-contact.log`. Esta prueba DOM y la prueba SQL son complementarias; no constituyen una prueba del formulario contra Supabase vivo.
- `node scripts/smoke-company-auto.mjs` y `node scripts/smoke-import-multifile.mjs`: PASS; logs `reapertura-smoke-company-auto.log` y `reapertura-smoke-import-multifile.log`.
- `npm run build`: PASS, 1.51 s; log `reapertura-build.log`.

No se modificaron archivos de UI, ni la cola, ni el estado de cierre. No hace falta cambio visual. **Carril UI:** existe Playwright; ejecutar `tests/contactos.spec.js` y validar el alta genérica con empresa nueva/existente y sus fichas, ya que cambian los datos visibles. No se ejecutó Playwright en esta reapertura. Persisten las limitaciones de concurrencia entre sesiones y de escrituras no transaccionales descritas abajo. El orquestador debe mantener separadas la validación local y cualquier aplicación o verificación posterior en vivo.

## Evidencia de la implementación anterior

Fecha: 2026-11-24. Implementación local; revisión y cierre corresponden al orquestador.

## Cambio

- `src/data.js`: las altas con `company` no vacío y sin `companyId`, y las ediciones de `company` sin asociación principal, resuelven primero el nombre exacto sin distinguir mayúsculas y eliminando espacios exteriores. No se interpretan `%` o `_` como comodines.
- Si no hay nombre coincidente, busca por dominio principal/adicional (texto de dominio, correo empresarial o sitio web). Excluye dominios gratuitos y los configurados como excluidos. Si tampoco encuentra empresa, la crea con el nombre escrito.
- La solicitud explícita funciona incluso con la automatización por correo desactivada o `skipAutoCompany`. Una asociación explícita existente se conserva. Los contactos sin texto conservan la automatización por correo anterior.
- En Supabase consulta las empresas vigentes, paginadas, sin depender de una caché parcial. La empresa se inserta antes de escribir el vínculo, incluyendo la espera del reintento de id existente. Comparte las empresas pendientes entre altas concurrentes de la misma sesión.
- Usa `setField` y la sincronización existente para escribir `contacts.company_id`, el nombre canónico y `contact_companies.is_primary=true`. `waitForSave` drena las escrituras derivadas antes de devolver el registro.
- No se modificó UI ni se añadieron cambios visuales a Claude. No se modificó la cola ni se marcó la tarea como terminada.

## Pruebas

Todas con salida 0:

| Comando | Resultado |
| --- | --- |
| `node scripts/smoke-contact-company-name.mjs` | PASS: hooks reales de data.js con PostgreSQL local PGlite; consulta SQL con JOIN confirma empresa + company_id + vínculo primario. Nombre nuevo, existente con otras mayúsculas, espacios, nombre con `%_`, empresa ausente en caché, dominio adicional y dominio escrito, edición, id explícito, altas concurrentes de la misma sesión, texto vacío y reparación repetida. También cubre localStorage. |
| `node scripts/smoke-company-auto.mjs` | OK: automatización anterior, dominios adicionales, importación y configuración. |
| `node scripts/smoke-create-contact.mjs` | OK: creación, duplicados y panel de contactos. |
| `node scripts/smoke-import-multifile.mjs` | OK: importación con contactos, empresas, negocios y actualizaciones. |
| `npm run build` | OK: 255 módulos; última compilación 1.44 s. |
| `git diff --check` | Sin errores. |

El smoke nuevo sustituye únicamente el cliente Supabase y activa el estado remoto en una copia en memoria del módulo: ejecuta addRecord/setField, cola de escrituras, mapeo a columnas y sincronización reales. Su adaptador ejecuta las consultas contra PGlite; no usa credenciales ni red. No se validó contra Supabase vivo.

El lanzador Node de Kimi falló inicialmente antes de ejecutar el smoke por EPERM al registrar su proceso. Se usó Node v24.16.0 instalado en `~/.nvm/versions/node/v24.16.0/bin`, anteponiéndolo al PATH. El primer fallo de aserción del harness se corrigió limpiando su caché al cambiar artificialmente de modo local a remoto; la ejecución final pasó.

## Reparación y límites

`scripts/sql/repair-contact-421-company.sql` está listo y NO se ejecutó contra la base viva. Requiere autorización expresa del orquestador. Contiene transacción, bloqueo, validación del texto esperado, reutilización de empresa existente, escritura de vínculo principal y consulta final. Dos ejecuciones mantienen una sola empresa y un solo vínculo; también se probó reutilizar la empresa ya existente. No altera contactos reciclados ni asociaciones que ya fueron corregidas.

No se desplegó nada. No se requiere migración para el código: utiliza las tablas existentes. La resolución remota lee las empresas vigentes; no introduce índice único de nombre ni transacción global entre navegadores. La prevención de duplicados simultáneos cubre una sesión; dos sesiones independientes creando un nombre inexistente al mismo tiempo siguen sujetas a esa limitación de la arquitectura actual. Las escrituras conservan el manejo de errores existente y no constituyen una transacción única.

**Aviso al carril UI:** existe Playwright. Ejecutar `tests/contactos.spec.js` y validar alta/edición con empresa nueva y existente, ficha del contacto y ficha/rollups de empresa. Esta tarea cambia datos visibles aunque no modifica componentes visuales; aquí se ejecutaron los smokes DOM indicados, no Playwright.
