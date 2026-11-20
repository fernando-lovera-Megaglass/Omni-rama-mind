# Colas de tareas

Migración: `supabase/task_queues.sql`. Ejecutarla en el entorno Supabase de destino antes de publicar la UI. Este cambio no aplica migraciones remotas ni despliega la aplicación.

La tabla `task_queues` contiene nombres únicos (sin distinguir mayúsculas) y UUID estables. `tasks.queue_id` es una clave foránea nullable; eliminar una cola conserva sus tareas mediante `ON DELETE SET NULL`. La migración conserva los nombres de la propiedad antigua y retira ese valor de `extra`; es repetible. Las colas se comparten entre usuarios autenticados del CRM, conforme al modelo de acceso compartido existente.

En Tareas:

1. Escribir un nombre y pulsar **Crear cola**.
2. Seleccionar las tareas en la lista, elegir la cola y pulsar **Asignar seleccionadas a esta cola**. La selección se mantiene al cambiar de cola.
3. El selector **Cola** filtra la lista. **Iniciar N tareas** utiliza las pendientes de esa cola que cumplen los demás filtros de la vista.
4. Elegir una cola para renombrarla o eliminarla. **Sin cola** permite quitar la asignación de tareas seleccionadas.

Sin configuración Supabase, el catálogo y las asignaciones usan el almacenamiento local de demostración. Con Supabase configurado, los errores del catálogo se muestran y no se sustituyen por datos locales.

Validación local: `npm run test:task-queues` ejecuta la migración en PostgreSQL embebido (PGlite) y un smoke DOM que crea Cobranza, asigna tres tareas, filtra, inicia las tres, renombra y elimina. No utiliza credenciales ni escribe datos remotos. No sustituye una prueba de sesión/RLS en un Supabase de pruebas.
