# gap-backend-re-ultima-actividad-backfill

Estado: código local y pruebas completos; aplicación remota pendiente de aclaración del usuario. No se ha cumplido todavía el criterio de cero desfases en la base real. No se desplegó código ni se modificaron datos remotos, UI o la cola de tareas.

## Implementación

- `scripts/backfill-last-activity.mjs`: auditoría por defecto; `--apply` ejecuta una transacción vía `mgmt-sql.mjs`; `--emit-sql` permite revisar SQL sin conexión ni ejecución.
- Lee ENGAGEMENT_TYPES de `src/data.js` (incluye sms/whatsapp/linkedin); excluye system/prop/stage. Usa occurred_at y desempata por id descendente. Ignora fechas nulas y registros con deleted_at. Registros sin engagement fechado permanecen intactos.
- Respeta almacenamiento real: contacts/companies.last_activity_type; deals/tickets.extra.lastActivityType; contacts.extra.notes_last_contacted. Preserva otras claves extra.
- Último contacto: max(call/email/meeting/message), excluyendo marketingEmailId con semántica Boolean de JavaScript. Si un contacto con engagement no tiene contacto elegible, guarda null. Los tres canales adicionales cuentan para última actividad, pero no para último contacto, conforme a los cuatro tipos explícitos del encargo.
- Recalcula únicamente filas discrepantes; fechas correctas no retroceden. Una fecha incorrectamente adelantada se normaliza a su máximo real. La auditoría viva no encontró tales casos.
- Bloqueos de tablas durante aplicación evitan escrituras concurrentes entre snapshot y validación; lock_timeout 5 s y statement_timeout 60 s. Error de invariantes revierte la transacción. Antes/después y contadores se guardan en JSON, junto con SQL exacto. La segunda ejecución no altera filas ya corregidas.

## Evidencia viva, solo lectura

`2026-11-23T12-06-57-755Z-audit.sql` y `.json` contienen la consulta exacta y su resultado remoto. El campo applied es false; before/after corresponden a la misma auditoría sin actualización.

| Tabla | Con engagement fechado | Atrasados | Adelantados |
|---|---:|---:|---:|
| contacts | 12 | 11 | 0 |
| companies | 9 | 9 | 0 |
| deals | 6 | 6 | 0 |
| tickets | 0 | 0 | 0 |

Total pendiente: 26. La auditoría no incluye datos personales textuales ni credenciales, solo identificadores, tipos y fechas.

## Pruebas locales

- `npm run build`: PASS (build.log). El wrapper administrado de node inicialmente falló al registrar un proceso fuera del workspace; se ejecutó el mismo comando npm usando un script-shell temporal que selecciona el binario Node disponible de Kimi. Sin cambios en package.json.
- `node scripts/smoke-last-activity.mjs`: PASS (smoke-last-activity.log).
- `node scripts/smoke-backfill-last-activity.mjs`: PASS (smoke-backfill.log). PostgreSQL local desechable PGlite; cuatro tablas, fechas nulas/atrasadas/adelantadas, marketing y sus valores falsy/truthy, desempate, tipos excluidos, todos los engagement actuales, preservación de extra, borrados, ausencia de engagement e idempotencia. local-before-after.json documenta fixtures sintéticos: 2 atrasados y 1 adelantado por tabla antes; cero en las cuatro tablas después.
- `git diff --check`: PASS.

Existe Playwright. El carril UI debe correr sus pruebas de listas, filtro «Con actividad reciente» e informes tras aplicar el backfill. No hace falta un cambio visual y no se agregó gap-ui.

## Pendiente y ejecución preparada

Se pidió aclaración porque el encargo solicita ejecutar contra la base y al final limita a «solo código local». Falta confirmar autorización de escritura de datos remotos, sin despliegue. No se interpreta el silencio como autorización. La tarea queda abierta para el orquestador.

SQL de aplicación revisable: `apply.sql` (generado, NO ejecutado).

Una vez aclarado el alcance:

```sh
node scripts/backfill-last-activity.mjs --apply
node scripts/backfill-last-activity.mjs
```

La ejecución guarda evidencia nueva con marca temporal. Verificar behind=0 y ahead=0 para las cuatro tablas en el resultado aplicado y en auditoría posterior. Si hay error de red después de commit, auditar antes de reintentar; la operación es idempotente.
