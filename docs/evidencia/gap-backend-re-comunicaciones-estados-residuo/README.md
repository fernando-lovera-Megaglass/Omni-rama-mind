# Reapertura: ejecución y diagnóstico — 24-nov-2026

## Resultado y límites de aceptación

Barrido ejecutado en producción por instrucción explícita del usuario: `node scripts/sweep-stuck-comms.mjs --apply` (Node nativo v24.16.0). Transacción completada el **2026-11-24 00:20:30.735972 CST / 06:20:30.735972 UTC**. No se desplegó ninguna función ni se cambió configuración de Twilio. No se modificó UI ni scripts/build-queue.json. El orquestador decide el cierre.

| Medición real | Llamadas ringing/initiated >1 h | SMS queued >1 h |
| --- | ---: | ---: |
| Antes, dentro de transacción | 39 | 2 |
| Después, dentro de transacción | 0 | 0 |
| Independiente, 00:21:50 CST | 0 | 0 |

La consulta independiente también midió **0 llamadas queued/initiated/ringing/in-progress >1 h** y **0 mensajes queued >1 h de cualquier canal**. [Diagnóstico y medición real](live-diagnosis-2026-11-24.json).

Salida exacta de --apply (exit 0):

```json
[{"evidence":{"after":{"queued_sms":0,"stuck_calls":0},"before":{"queued_sms":2,"stuck_calls":39},"cutoff":"2026-11-24T05:20:30.735972+00:00"}}]
```

El timestamp de ejecución es cutoff +1 hora, establecido por PostgreSQL dentro de la transacción. Cada fila conserva extra.residue_sweep.at. La nota fija «barrido de residuo 23-nov» del script identifica el lote original, NO la fecha real de aplicación; la fecha real está arriba y en los metadatos por fila. No se volvió a ejecutar el barrido para fabricar otro reporte.

## Causa raíz comprobada

Llamada `CA4a9837b1b89177070751a52c9a608cdb`, creada 23-nov 19:13:53 UTC:

- Twilio REST devuelve completed, duración 28 s, final 19:14:21 UTC.
- Events de esa llamada devuelve una única petición a twilio-voice, HTTP 200, sin página adicional. El TwiML realmente servido tenía statusCallback en **Dial**, sin action en Dial y sin statusCallback en **Number**. El diagnóstico guarda solo indicadores del XML, sin teléfonos.
- Logs de Supabase alrededor de la llamada muestran POST 200 a twilio-voice y ninguna invocación a twilio-call-status. También se inspeccionaron logs de función entre 19:10 y 19:25 UTC: boot/shutdown, sin error de firma registrado en esa ventana.
- TwiML App apunta a la URL correcta de twilio-voice; status_callback de la App es null. La función productora desplegada es **twilio-voice v4**; el consumidor es **twilio-call-status v5**, ambos verify_jwt=false.
- Se leyó también el bundle desplegado de twilio-voice: confirma los atributos incorrectos en Dial en las ramas entrante y saliente. No se incluye el bundle de dependencias en la evidencia.

La causa demostrada está en la generación de TwiML desplegada: v5 del consumidor no puede procesar eventos que el productor no solicita. No hay evidencia de rechazo de firma para esta llamada; no se afirma que las firmas en producción estén validadas de extremo a extremo. Las pruebas locales sí verifican HMAC válido, rechazo de firmas falsas, URL con query y resolución padre/hijo.

Referencias oficiales: [Number statusCallback](https://www.twilio.com/docs/voice/twiml/number), [Dial action](https://www.twilio.com/docs/voice/twiml/dial), [Events de llamadas](https://www.twilio.com/docs/voice/api/call-event-resource), [consulta de logs Supabase](https://supabase.com/docs/guides/observability/advanced-log-filtering).

## Corrección local y reproducibilidad

La corrección necesaria **ya estaba presente en el checkout antes de esta reapertura** en supabase/functions/twilio-voice/index.ts: callback en Number/Client, método POST, eventos initiated/ringing/answered/completed y action de Dial. El consumidor local resuelve ParentCallSid y DialCallStatus. Se validó ese código con las pruebas existentes; no se introduce una segunda implementación ni se atribuye su autoría a esta ejecución.

Se añadió `scripts/diagnose-stuck-call.mjs <CallSid>`: diagnóstico de solo lectura mediante Management API y Twilio REST, consulta configuración, eventos, logs y contadores; salida sin tokens, teléfonos ni cuerpos de llamadas. Se ejecutó contra la llamada indicada y produjo el JSON enlazado. No hace llamadas, envía SMS, configura webhooks ni escribe en la base.

**Aceptación completa pendiente:** no existe una llamada/SMS nueva posterior al barrido que pruebe el callback terminal. El código corregido no se desplegó por prohibición explícita del usuario. El criterio real requiere activar posteriormente la corrección autorizada y una comunicación controlada nueva; el barrido no sustituye esa prueba. No se solicita cierre.

El barrido dejó la llamada estudiada en no-answer con provider_verified=false, aunque el diagnóstico posterior demuestra completed en Twilio. Esa clasificación administrativa NO debe interpretarse como resultado real del proveedor. No se hizo una reconciliación adicional fuera del barrido pedido; se deja identificada la discrepancia para reconciliación posterior.

## Pruebas de esta reapertura

Todas con exit 0, Node v24.16.0:

- [npm run build](build-2026-11-24.log).
- [smoke-sweep-stuck-comms](smoke-sweep-stuck-comms-2026-11-24.log).
- [test-twilio-voice](test-twilio-voice-2026-11-24.log).
- [test-twilio-call-status](test-twilio-call-status-2026-11-24.log).
- [test-twilio-message-status](test-twilio-message-status-2026-11-24.log).
- [smoke-calls](smoke-calls-2026-11-24.log).
- [smoke-calls-status-filter](smoke-calls-status-filter-2026-11-24.log).

Existe Playwright. Aviso al carril UI: correr pantallas de llamadas/mensajes y filtros tras el barrido; comprobar presentación de estados terminales. No se necesita cambio visual, por lo que no se añadió gap-ui.

---

## Evidencia anterior conservada (23-nov; sus pendientes de barrido quedan sustituidos por lo anterior)

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
