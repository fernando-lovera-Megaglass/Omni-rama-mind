# Smokes en modo live (persistencia real en Supabase)

Las pruebas `scripts/smoke-*.mjs` corren sobre JSDOM con un `localStorage` en memoria y sin cliente de Supabase: validan la lógica y la interfaz, pero no la base de datos. Por eso una migración sin aplicar (una columna que falta, una tabla que no existe) no las hace fallar.

Diez smokes de persistencia tienen un **modo live opcional** que repite la operación clave contra el proyecto real y la comprueba con SQL:

| Smoke | Qué comprueba en vivo |
| --- | --- |
| `smoke-create-contact.mjs` | Crear un contacto → fila en `contacts`; editar una propiedad → la fila cambia |
| `smoke-create-deal.mjs` | Crear un negocio → fila en `deals` con pipeline, etapa e importe |
| `smoke-create-ticket.mjs` | Crear un ticket → fila en `tickets` con pipeline y estado |
| `smoke-ticket-deal-assoc.mjs` | Ticket ↔ negocio: crear un ticket con un negocio elegido → `tickets.extra->'assoc_deals'` y `deals.extra->'assoc_tickets'`; «Desasociar» en la ficha del ticket vacía ambas; «+ Agregar» en la ficha del negocio las vuelve a escribir |
| `smoke-tickets-trash.mjs` | Exige la columna `tickets.deleted_at` (migración `soft_delete_tickets.sql`); borrar → `deleted_at` con fecha; restaurar → `null` |
| `smoke-trash-purge.mjs` | Purga de 90 días (`purgeExpiredTrash`): un contacto, un negocio y una actividad «SMOKE» en la papelera con fecha de hace 91 días (puesta con SQL) desaparecen físicamente tras el barrido; los recientes siguen; la parte de propiedades archivadas reporta la migración `custom-properties-archived-at.sql` si falta |
| `smoke-team-views.mjs` | Vistas de equipo: el `team_members.team` del usuario SMOKE se fija con SQL y una vista de equipo se guarda en `account_settings` (lo que escribe un administrador); un arranque nuevo de `data.js` resuelve esa vista en la ficha del contacto; sin equipo vuelve la predeterminada. Se restaura la lista de vistas previa y se borran las filas |
| `smoke-record-merge.mjs` | Fusionar dos contactos → el duplicado queda en la papelera (`deleted_at`) y el principal toma el valor elegido |
| `smoke-record-customize.mjs` | Exige `user_settings.scope` y la tabla `account_settings` (migración `user_settings.sql`); personalizar «Acerca de» → fila en `user_settings` con `scope = 'user'`; «Aplicar a todos» → fila en `account_settings` solo con rol admin |
| `smoke-views-shared.mjs` | Exige la tabla `crm_views` (migración `crm_views.sql`); el usuario A guarda vistas privada / equipo / todos → filas suyas; un segundo usuario SMOKE (B) lee con su sesión las compartidas con el autor A y no la privada, y RLS le impide editarlas; borrar una vista propia borra su fila |

## Cómo correrlo

Requisitos: `app/.env` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, y `app/.supabase-mgmt-token` (ver `docs/supabase-management-token.md`). Ninguno se imprime.

```bash
cd app
SMOKE_LIVE=1 node scripts/smoke-tickets-trash.mjs
SMOKE_LIVE=1 node scripts/smoke-record-customize.mjs
SMOKE_LIVE=1 node scripts/smoke-create-contact.mjs
SMOKE_LIVE=1 node scripts/smoke-create-deal.mjs
SMOKE_LIVE=1 node scripts/smoke-create-ticket.mjs
SMOKE_LIVE=1 node scripts/smoke-ticket-deal-assoc.mjs
SMOKE_LIVE=1 node scripts/smoke-trash-purge.mjs
SMOKE_LIVE=1 node scripts/smoke-team-views.mjs
SMOKE_LIVE=1 node scripts/smoke-record-merge.mjs
```

Sin `SMOKE_LIVE=1` cada smoke corre como siempre (JSDOM, sin tocar la base). En modo live el smoke **no** ejecuta la parte local: solo el escenario en vivo.

## Qué hace el modo live (`scripts/smoke-live.mjs`)

1. Carga `app/.env` en `process.env` para que `src/supabaseClient.js` cree el cliente real en Node.
2. Crea un usuario desechable `smoke.<prueba>.<marca>@megaglass.us` (invitación en `invitations`, fila en `auth.users` con contraseña, fila activa en `team_members`) e inicia sesión con él en el propio cliente de la app. El usuario de la cuenta no se toca.
3. Importa `src/data.js`, que arranca en modo Supabase con esa sesión (misma ruta que el navegador: `requireSession`, políticas `is_team_member()`, `fetchUserSettings`…).
4. Ejecuta la operación con las funciones de la app (`addRecord`, `setField`, `deleteRecords`, `restoreRecords`, `mergeRecords`, `setSetting`), espera `dbIdle()` (la cola de escrituras) y consulta las filas por SQL con la API de gestión.
5. Limpia siempre, también si una comprobación falla: borra todo registro «SMOKE …» (contactos, empresas, negocios, tickets, tareas, sus actividades y elementos de pedido), los `user_settings` del usuario, su fila de `team_members`, la invitación y el usuario.

Los registros de prueba llevan el prefijo **«SMOKE»** (contactos con correo `smoke.<marca>@ejemplo.com`), así que si una corrida se interrumpe se reconocen y se pueden borrar a mano con el mismo criterio.

## Precondiciones que detecta

- `tickets-trash`: si `public.tickets` no tiene `deleted_at`, falla con «aplica la migración que la añade» antes de escribir nada.
- `record-customize`: si `public.user_settings` no tiene `scope` o `public.account_settings` no existe, falla igual; si la app arranca con los ajustes en localStorage (`settingsLive()` falso), también.
- «Aplicar a todos los usuarios de la cuenta» necesita `app_metadata.role = 'admin'` (política `account_settings_admin`): el modo live lo registra como aviso, no como fallo, porque el usuario SMOKE no es administrador.
