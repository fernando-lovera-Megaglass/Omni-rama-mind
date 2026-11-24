# Octava reapertura: aplicación real pendiente

Fecha: 2026-11-24, America/Mexico_City.

La tarea no cumple todavía los criterios de cierre. Se pidió aclaración sobre la contradicción entre ejecutar la fusión en la base viva y la restricción final «No despliegues nada a producción; solo código local». No se ejecutó ninguna escritura remota, ni ensayo remoto con rollback. La consulta remota se hizo dentro de BEGIN READ ONLY.

## Medición real

`antes.json` registra la hora del servidor: 2026-11-24 11:31:33.71238+00 (05:31:33 CST). Resultado: 423 contactos activos, 0 en papelera, 77 grupos duplicados mediante `SELECT lower(email) FROM contacts WHERE deleted_at IS NULL AND coalesce(email,'')<>'' GROUP BY 1 HAVING count(*)>1`. El índice contacts_email_idx sigue siendo CREATE INDEX, no UNIQUE.

## Cambios locales

- `scripts/sql/dedupe-contacts.sql`: el índice UNIQUE ahora usa exactamente `lower(email) WHERE deleted_at IS NULL AND coalesce(email,'')<>''`.
- `scripts/test-contact-integrity.mjs`: verifica el predicado y que el índice permite múltiples emails vacíos y NULL incluso deshabilitando temporalmente el trigger de normalización, dentro de una transacción revertida.
- Se conserva la lógica existente de fusión transaccional, referencias, actividades, propiedades y papelera suave. No se modificó UI ni se eliminó ninguna función.

## Validación

Todas las ejecuciones finales terminaron con código 0:

- `npm run build`: build.log.
- `node scripts/test-contact-integrity.mjs`: integrity.log; PostgreSQL local PGlite, 77 pares, referencias relacionales y JSON, propiedades, papelera, rollback, repetición e índice único. No simula concurrencia real entre sesiones.
- `node scripts/smoke-dedupe.mjs`: dedupe.log.
- `SMOKE_LIVE=0 node scripts/smoke-record-merge.mjs`: merge.log.

El lanzador administrado falló inicialmente por EPERM al registrar procesos fuera del workspace. El build pasó con escalación aprobada; las pruebas usaron el ejecutable Node de Kimi directamente. El caso nuevo inicialmente colisionó con IDs del fixture y se corrigió para usar IDs explícitos; la repetición completa pasó. El aviso localStorage del fixture no impidió el PASS.

## Pendiente

Confirmar el alcance remoto; después ensayar, revisar auditoría, aplicar y verificar 0 grupos duplicados, índice UNIQUE, asociaciones trasladadas y papelera. Registrar la fecha real en applied-migrations.json únicamente después de confirmar la aplicación. Ese archivo no se cambió para fingir una ejecución.

Existe Playwright: el carril UI debe ejecutar las pruebas de contactos, asociaciones y papelera después de aplicar la fusión, pues cambiarán los registros mostrados. No se requiere cambio visual ni se agregó gap-ui.

No se desplegó nada. No se editó la cola ni se marcó la tarea hecha. Los cambios de build-queue y archivos de estado presentes al inicio pertenecen a otros procesos. El cierre corresponde al orquestador.
