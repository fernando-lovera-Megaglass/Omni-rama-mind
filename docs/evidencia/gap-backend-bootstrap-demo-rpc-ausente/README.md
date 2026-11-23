# Bootstrap ausente: evidencia local

Fecha: 2026-11-23 (America/Mexico_City). **Aceptación remota pendiente; no cerrar.**

## Reapertura del 23-nov-2026

Se revisó `supabase/bootstrap-demo.sql`: instala únicamente la función y sus permisos dentro de una transacción; no ejecuta schema.sql ni borra tablas. La definición retorna false antes de procesar el payload cuando alguna de las cinco tablas contiene filas. No se requiere otro cambio de código para instalarla.

La solicitud vuelve a exigir aplicación real, pero termina con «No despliegues nada a producción; solo código local». Se solicitó aclaración explícita para esa excepción; mientras esté pendiente no se ejecuta SQL remoto ni se registra una aplicación ficticia en applied-migrations.json. La ausencia actual en pg_proc procede del reporte del usuario, no de una consulta realizada en esta reapertura. Los criterios de aceptación remotos siguen pendientes.

Verificación repetida en esta reapertura:

- `scripts/smoke-bootstrap-failure.mjs`: PASS con Node real del runtime de Kimi. Los errores simulados PGRST202, red y respuesta inválida son esperados.
- `npm run build --script-shell=/tmp/omni-build-shell.sh`: PASS, Vite 5.4.21, 254 módulos, 1.96 s; PATH seleccionó el runtime real. Los intentos iniciales de node/npm con el wrapper fallaron por EPERM al registrar leases fuera del workspace.
- No se repitió PostgreSQL local: no hubo cambios de SQL ni de lógica. La prueba local previa no sustituye la aceptación remota.
- Playwright está instalado. El carril UI debe verificar el aviso y el arranque autenticado cuando implemente el ítem hermano existente; no se creó un duplicado ni se editaron UI o cola.

Único cambio de esta reapertura: esta evidencia. No se aplicaron migraciones, no se desplegó la app y no se marcó la tarea como hecha.

## Cambio backend

`src/data.js` ahora trata el bootstrap de ejemplo como una operación opcional: si la RPC devuelve un error, una respuesta inválida o lanza una excepción, no llega al catch que apaga `dbLive`. Conserva los datos remotos ya leídos (incluidas tablas parcialmente pobladas) y las escrituras siguen dirigidas a Supabase. No añade inserts cliente, no crea registros demo locales ni elimina funciones. El modo demo deliberado sin variables Supabase sigue existiendo. Otros errores de carga no relacionados con esta RPC conservan su comportamiento anterior.

`src/demo-bootstrap.js` expone `getDemoBootstrapStatus()` (también reexportado desde data.js), disponible tras el top-level await: `idle`, `seeded`, `skipped` o `failed`. El fallo conserva un código y un mensaje para el consumidor de UI; el getter devuelve un objeto inmutable. No se confunde una respuesta false (base ya poblada) con error.

## Pruebas ejecutadas

- `node scripts/smoke-bootstrap-failure.mjs`: PASS. Ejecuta el cuerpo real de `initFromSupabase` extraído del archivo con dependencias aisladas; RPC ausente PGRST202 y excepción de red dejan dbLive=true, cinco tablas vacías sin datos inventados e IDs inicializados. Comprueba también true/false y respuesta inválida. Las trazas de error de estos escenarios son esperadas. No es una prueba de navegador ni de escritura remota.
- `EPG_MODULE=/tmp/contact-integrity-test/node_modules/embedded-postgres/dist/index.js node scripts/test-bootstrap-concurrency.mjs`: PASS. Aplica schema/soft_delete/company_hierarchy/contact-integrity/bootstrap-demo en un PostgreSQL desechable con tres conexiones. Verifica `pg_proc`, observa la segunda sesión bloqueada hasta COMMIT de la primera; resultados true y false. Conteos exactos: companies 36, contacts 420, deals 150, tickets 84, tasks 64; cero grupos de emails duplicados. La base se elimina al terminar. Usa conexión administrativa postgres exclusivamente local, no cuenta de servicio remota. El aviso localStorage no definido al importar data.js en Node es previo y no impide la prueba.
- `node scripts/smoke-dedupe.mjs`: PASS, incluido análisis, importación y wizard en JSDOM.
- `npm run build --script-shell=/tmp/omni-build-shell.sh`: PASS, Vite 5.4.21, 254 módulos, 2.01 s. El shell temporal seleccionó Node v24.22.1 real porque el wrapper de Kimi fallaba al registrar leases fuera del sandbox. No se modificó configuración del proyecto.

El primer intento de PostgreSQL falló porque el sandbox bloqueó shmget; la repetición con permiso de ejecución local fuera del sandbox pasó. No se consultó ni modificó producción.

## Registro y pendientes

`applied-migrations.json` mantiene bootstrap-demo.sql en **pendiente** remoto y añade `localVerification` con fecha y resultado. No se afirma que exista en producción a partir de una prueba local.

Se agregó exclusivamente al inicio de queue el ítem **gap-ui-bootstrap-demo-aviso-explicito**, pending, lane claude. Claude debe consumir el estado failed y mostrar un aviso persistente con recarga. Existe Playwright: el carril UI debe probar en navegador la RPC ausente y error de red, aviso visible y altas dirigidas a Supabase. **El aviso visual aún no está implementado**; no se modificaron HTML, componentes visuales ni CSS.

La instrucción final «No despliegues nada a producción; solo código local» impide aplicar la migración a la base remota. La siembra y concurrencia sobre base vacía sí se verificaron localmente. Para aceptación remota queda aplicar únicamente supabase/bootstrap-demo.sql en un entorno autorizado con acceso administrativo/cuenta de servicio y registrar fecha y entorno reales. No ejecutar schema.sql ni vaciar tablas en una base existente. Consultas de verificación:

```sql
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'bootstrap_demo_v1';

SELECT 'contacts' AS tabla, count(*) FROM public.contacts
UNION ALL SELECT 'companies', count(*) FROM public.companies
UNION ALL SELECT 'deals', count(*) FROM public.deals
UNION ALL SELECT 'tickets', count(*) FROM public.tickets
UNION ALL SELECT 'tasks', count(*) FROM public.tasks;
```

Si alguna tabla contiene filas (incluso borradas lógicamente), la RPC retorna false sin sembrar: la prueba de base vacía requiere un entorno desechable, no borrar datos existentes. La prueba local de concurrencia no demuestra políticas RLS ni arranque autenticado completo del proyecto remoto.

La tarea no se marcó hecha; corresponde al orquestador revisar esta evidencia y los pendientes.
