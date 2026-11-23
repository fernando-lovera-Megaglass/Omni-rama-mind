# gap-backend-re-comunicaciones-estados-residuo

Fecha: 23-nov-2026. Entrega de código local; sin despliegues, llamadas, SMS ni escrituras remotas. No se modificó UI ni build-queue.json. El orquestador determina el cierre.

## Implementación

`scripts/sweep-stuck-comms.mjs` genera SQL por defecto, sin conexión ni credenciales. `--sql` hace lo mismo. `--apply` ejecuta explícitamente el SQL mediante mgmt-sql.mjs contra su proyecto configurado; **no se ejecutó en esta tarea**, por la restricción «solo código local».

- Llamadas ringing/initiated con created_at estrictamente anterior a una hora: no-answer; failed si hay last_error no vacío en la fila o en extra. No toma el error de la conexión como error de una llamada.
- duration_sec NULL pasa a 0 solo en las llamadas barridas; conserva duraciones existentes. No inventa duración ni fecha real de finalización.
- SMS (channel=sms) queued antiguos pasan a failed. WhatsApp queda fuera del alcance solicitado.
- Añade extra jsonb si falta. Conserva metadatos y notas previas; agrega «barrido de residuo 23-nov» en extra.notice y el instante, estado anterior y provider_verified=false en extra.residue_sweep. Es una clasificación administrativa por antigüedad, no una confirmación del proveedor. No reenvía mensajes.
- Una transacción, umbral estable y bloqueo de escrituras en ambas tablas durante el barrido evitan carreras entre la medición y los updates. El reporte devuelve contadores antes/después sin teléfonos, textos de SMS ni secretos. La segunda ejecución no altera filas ya barridas.

## Evidencia antes/después

| Entorno | Llamadas antiguas antes | Después | SMS queued antiguos antes | Después |
| --- | ---: | ---: | ---: | ---: |
| PostgreSQL local PGlite, datos sintéticos | 40 | 0 | 2 | 0 |
| Producción, medición aportada por el usuario a las 05:50 CST | 38 | No ejecutado | 2 | No ejecutado |

El fixture incluye las 32 ringing + 6 initiated reportadas y dos casos adicionales de metadatos/error. Prueba también registros recientes, límite exacto de una hora, estados terminales, duración positiva existente, error vacío, columnas ausentes, WhatsApp y conservación de metadatos/error. Las 3 completed históricas sin duración quedan pendientes de reconciliación con evidencia del proveedor: el barrido no puede demostrar ni reconstruir duración > 0.

**La aceptación sobre datos reales sigue pendiente**: no se afirma que producción tenga cero residuos ni que los callbacks se hayan validado en una comunicación real. No se volvió a medir producción en este turno.

## Pruebas ejecutadas

- `node scripts/smoke-sweep-stuck-comms.mjs`: PASS. [Reporte local](sweep-local.log).
- `npm run build`: PASS (Vite, 1.92 s). [Log](build.log).
- `node scripts/smoke-calls.mjs`: PASS. [Log](smoke-calls.log).
- `node scripts/smoke-calls-status-filter.mjs`: PASS. [Log](smoke-calls-status-filter.log).

El launcher inicial de Node/npm de Kimi falló por EPERM al registrar un proceso fuera del workspace; se ejecutaron las pruebas con Node nativo y el build con Node/npm de `~/.nvm/versions/node/v24.16.0/bin`. No hizo falta cambiar permisos ni archivos de la aplicación.

Existe Playwright. Aviso al carril UI: ejecutar las pruebas de pantallas de llamadas y mensajes después de aplicar el barrido en el entorno autorizado; verificar etiquetas Sin respuesta/Fallida, filtros y ausencia de Sonando/Iniciando/En cola históricos. No se pidió cambio visual ni se agregó gap-ui porque el cambio es exclusivamente de datos.

## Operación posterior (no ejecutada)

Previsualizar localmente: `node scripts/sweep-stuck-comms.mjs --sql`.

Cuando se autorice modificar la base, comprobar el destino PROJECT de scripts/mgmt-sql.mjs y ejecutar `node scripts/sweep-stuck-comms.mjs --apply`, conservando su JSON. Esta operación también agrega extra donde falte; no despliega Edge Functions. Requiere permiso de ALTER/UPDATE. El bloqueo dura toda la transacción; ejecutar en una ventana apropiada.

Verificación independiente posterior:

```sql
select count(*) as stuck_calls from public.call_logs
where status in ('ringing','initiated') and created_at < now() - interval '1 hour';
select count(*) as queued_sms from public.twilio_messages
where channel = 'sms' and status = 'queued' and created_at < now() - interval '1 hour';
```

Ambos resultados deben ser 0. Guardar esa evidencia real antes de cerrar la parte operativa.

## Próxima llamada real: validar la cura

1. Registrar hora UTC de inicio y hacer una llamada autorizada, contestarla, conversar al menos 10 segundos y colgar. Repetir luego para el otro sentido (entrante/saliente).
2. Identificar la fila nueva por su call_sid, no por una fila histórica barrida. Esperar el callback terminal y consultar:

```sql
select id, call_sid, status, duration_sec, created_at, ended_at,
       extra->'residue_sweep' as residue_sweep
from public.call_logs
where call_sid = '<SID de la llamada nueva>';
```

3. Para la llamada contestada: status=completed y duration_sec > 0, sin residue_sweep. Registrar SID, tiempos y resultado; verificar que recargar Llamadas conserva el estado terminal. No ejecutar el barrido sobre esa prueba para hacerla pasar.
4. Si no se contesta, no-answer/busy/failed/canceled es terminal, pero **no valida duración de una llamada contestada**. Si no llega el callback terminal en 60 segundos, revisar logs de twilio-voice/twilio-call-status y su configuración desplegada; el éxito de este barrido no prueba la cura de raíz.
5. Para SMS, enviar uno nuevo autorizado y seguir su message_sid hasta delivered/sent o un fallo con causa; un failed producido por este barrido no demuestra entrega ni funcionamiento del callback.
