# Evidencia — gap-backend-re-secuencias-ejecutor-ausente

## Reapertura — 24-nov-2026: solo local; aceptación productiva NO cumplida

La última instrucción del usuario limita esta entrega a código local. No se
realizó despliegue, configuración de Vault, SQL remoto, activación, backfill remoto
ni inscripción real. No se ejecutó `sequence-activate.mjs --yes` contra producción.
El estado reportado a las ~03:15 CST (26 activas vencidas, cero recibos y cron
inactivo sin corridas) es evidencia aportada por el usuario, no una medición nueva.

### Cambio local de esta reapertura

El preflight del activador comprobaba Cron y Vault, pero omitía pg_net. Ahora
exige la extensión, la función `net.http_post` y la tabla `net._http_response`
antes de modificar cron o reprogramar inscripciones. La prueba inyectada cubre
pg_net ausente y Vault ausente, sin SQL remoto ni acceso a credenciales.
Esta validación comprueba disponibilidad de objetos, no la salud del worker HTTP.
El runbook se actualizó al reporte del 24-nov y añade la comprobación de una
inscripción nueva sin invocación manual del ejecutor.

### Validación de esta reapertura

Todos los comandos terminaron con código 0:

| Comando | Resultado / registro |
| --- | --- |
| `npm run build` | PASS, 1.84 s; `reapertura-2026-11-24-0.log` |
| `node scripts/smoke-sequence-activate.mjs` | PASS; opt-in, preflight, ausencia de pg_net sin mutaciones, orden y fallos; salida registrada en la sesión |
| `node scripts/smoke-sequence-cron.mjs` | PASS; `reapertura-2026-11-24-1.log` |
| `npm run test:sequence-process` | PASS; `reapertura-2026-11-24-2.log` |
| `npm run test:sequence-remote` | PASS sobre loopback/PGlite; `reapertura-2026-11-24-3.log` |

Se utilizó el runtime local indicado en la evidencia previa para evitar el wrapper.
Los dobles de Cron/pg_net no acreditan funcionamiento de esas extensiones reales.
Existe Playwright: el carril UI debe comprobar Programado y tareas tras la futura
activación, pues el avance cambia datos visibles. No se editaron archivos visuales
ni se identificó un cambio visual que requiera agregar un gap para Claude.

### Criterios remotos pendientes

- Cero inscripciones activas vencidas por más de un día: **no medido**.
- `sequence_step_runs` con pasos `done`: **no medido**.
- Cron activo, corridas exitosas y pg_net sin errores: **no medido**.
- Una inscripción nueva que avance sola por cron: **no ejecutado**.

El bloqueo productivo reportado sigue pendiente: los cambios locales no activan
el cron. El despliegue, configuración, activación y observación del runbook
requieren una instrucción posterior que permita actuar en producción.
No se modificó `scripts/build-queue.json` ni se marcó la tarea como terminada.
Se conservaron las modificaciones previas de cola y archivos de estado.

---

## Evidencia histórica — 23-nov-2026

Fecha: 23-nov-2026. Entrega de código local; aceptación productiva pendiente.

## Cambios

- `supabase/sequence-cron.sql`: pg_cron + pg_net + Vault, un trabajo con nombre estable cada minuto. Se instala inactivo para evitar procesar las 26 congeladas antes del backfill. Reaplicar actualiza el mismo trabajo y lo pausa. Rollback documentado sin borrar extensiones compartidas, recibos ni datos de negocio.
- `scripts/sequence-activate.mjs --yes`: exige opt-in remoto, valida coincidencia del proyecto con Management API, comprueba GET autenticado de la función y explica el comando exacto de despliegue si falta. Verifica cron y secretos, pausa cron, ejecuta el backfill existente, exige por SQL cero activas vencidas y confirma cron activo antes de informar activación. No invoca POST ni fabrica ejecuciones. Los fallos posteriores a la pausa dejan cron pausado para corregir y repetir.
- `sequence-process/index.ts`: GET autenticado de salud con versión de activación; no toca la base ni Gmail. POST conserva su motor y transporte.
- `docs/sequence-process.md`: corrige el estado histórico contradictorio, preparación del operador, comando único de activación, consultas de aceptación y rollback. Distingue fechas futuras, invocaciones HTTP y pasos ejecutados.

## Validación local

| Comando | Resultado |
| --- | --- |
| `npm run build` | PASS, Vite 5.4.21, 255 módulos, 1.94 s |
| `node scripts/smoke-sequence-activate.mjs` | PASS: sin opt-in/cambio de proyecto no hay peticiones; función ausente da instrucción; cron/Vault inválidos, backlog residual o fallo de backfill no habilitan cron; orden pausa → backfill → SQL → habilitación |
| `node scripts/smoke-sequence-cron.mjs` | PASS: SQL en PGlite con dobles explícitos de cron/net/Vault; reaplicación sin duplicados y con pausa, URL/cabeceras/cuerpo del POST, rollback repetible |
| `npm run test:sequence-remote` | PASS: servidor loopback y backfill PGlite de 26 vencidas a futuro, cero vencidas; preserva terminales/pausadas/futuras/espera de tarea e idempotencia |
| `npm run test:sequence-process` | PASS: SQL/RPC reales en PGlite, concurrencia, avance, manuales, errores, permisos, días laborables; smoke JSDOM de secuencias y tareas |

El primer intento de Node/npm falló por EPERM del wrapper Kimi al registrar leases
fuera del workspace. Se resolvió solo para el proceso de pruebas con:

```sh
unset KIMI_DESKTOP_COMMAND_PROCESS_BIN
export KIMI_DESKTOP_TOOL_NODE=/Applications/Kimi.app/Contents/Resources/resources/runtime/tool-node/bin/node
export PATH=/Applications/Kimi.app/Contents/Resources/resources/runtime/tool-node/bin:/Applications/Kimi.app/Contents/Resources/resources/runtime:/usr/bin:/bin
```

No se cambiaron permisos ni archivos externos. npm emitió avisos de codesign del
host Electron; build y ambas suites terminaron correctamente.

## Pendiente / límites

- Sin despliegues, SQL remoto, llamadas a Gmail ni cambios de secretos. La medición remota (26 congeladas, cero ejecuciones, sin función/cron) es la aportada por el usuario; no se volvió a medir.
- El operador debe revisar remitentes/historial, desplegar la función actual, aplicar la migración y configurar Vault; después ejecutar el activador con autorización explícita. La creación del cron es persistente pero comienza inactiva deliberadamente.
- PGlite no incluye pg_cron/pg_net: sus extensiones reales, gateway, OAuth y despacho HTTP requieren validación autorizada en Supabase. `cron.job_run_details` exitoso no acredita éxito HTTP; consultar también pg_net y pasos reales.
- El backfill no equivale a ejecución: tras la primera fecha futura comprobar cero activas vencidas por más de un día, nuevos `sequence_step_runs` con `done`, y cron activo. Los errores del motor necesitan revisión; no se implementan reintentos de envíos ambiguos.
- Existe Playwright. El avance afecta datos visibles en Programado y tareas: el carril UI debe ejecutar sus pruebas Playwright de esas pantallas después de activar. No se modificaron archivos visuales y no se requiere gap visual.
- No se editó la cola ni se marcó la tarea como hecha; cambios previos en cola, registros de migraciones/status y audit-shots se conservaron. El orquestador decide el cierre.
