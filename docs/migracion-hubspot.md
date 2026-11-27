# Plan de migración HubSpot → Omni (APROBADO EN ESPERA — 27-nov-2026)

**Estado:** el usuario pidió esperar (27-nov-2026): primero se arregla la UI, luego los
datos («es mucha información»). No ejecutar ninguna fase sin su luz verde explícita.

## Inventario real de la cuenta HubSpot (medido 27-nov-2026, token en `app/.hubspot-token`)

| Objetos núcleo | Registros | Actividades | Registros |
|---|---|---|---|
| Contactos | 39,256 | Notas | 79,626 |
| Empresas | 15,489 | Llamadas | 92,151 |
| Negocios | 51,453 | Correos | 139,340 |
| Tickets | 1,792 | Reuniones | 1,683 |
| **Total núcleo** | **~108,000** | Tareas HubSpot | 74,315 |
| Propietarios | 46 | **Total actividades** | **~387,000** |

## Fases

**Fase 0 — Limpieza.** Respaldo fresco de TODA la base (como `backups/2026-11-25-pre-limpieza/`),
luego borrado de los datos demo en orden seguro por llaves foráneas: tareas → comunicaciones →
tickets → negocios → contactos → empresas. Se conservan: usuarios/propietarios, pipelines,
propiedades personalizadas y ajustes. (Pendiente confirmar: los 3 registros reales de prueba del
usuario también se borran.)

**Fase 1 — Objetos núcleo (~108k, estimado 1.5–3 h).** Orden: 46 propietarios HubSpot →
mapeo a usuarios Omni → contactos → empresas → negocios → tickets, con asociaciones reales
(contacto↔empresa, negocio↔contacto/empresa, ticket↔contacto/empresa) y la **fecha de creación
original de HubSpot** (`createdate` → `created`). Cada registro guarda su `hs_object_id` en
`extra` para auditoría/deshacer. Se registra en `import_jobs` (monitor de Integración de datos).
Lotes de 100 vía batch API (~100 req/10 s de límite), con checkpoints reanudables.

**Fase 2 — Actividades (~387k, varias horas).** Notas, llamadas, correos, reuniones y tareas
con sus asociaciones. Solo después de validar la Fase 1.

**Fase 3 — Dedupe sobre datos reales.** Sistema de niveles A/B/C (ver `docs/dedupe-criterios.md`).
El índice único de correo se crea HASTA AQUÍ, no antes: si HubSpot trae duplicados, el índice
bloquearía la importación.

## Preguntas pendientes del usuario (27-nov-2026)

1. ¿Borrar también los 3 contactos reales de prueba (ids 421, 422, 423)?
2. ¿Actividades (387k) en la primera migración o después?
3. Los 46 propietarios HubSpot: ¿crearlos como usuarios Omni o asignar todo al usuario actual?
