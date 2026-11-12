# Especificación funcional: módulo de Actividades (estilo HubSpot)

> **Propósito:** especificación para el agente de código (Craft Anything) que construirá el módulo de **actividades** (llamadas, correos, reuniones, notas, tareas y mensajes) del CRM. Documento hermano de `especificacion-importacion-contactos-crm.md`.
>
> Fuentes: documentación oficial de HubSpot (Knowledge Base en español). Ver referencias al final.

---

## 1. Tipos de actividad

El sistema debe soportar estos tipos, registrables en contactos, empresas, negocios, tickets y objetos personalizados:

- **Llamada** (hacer una llamada o registrar una llamada ya realizada)
- **Correo electrónico** (redactar y enviar, o registrar uno enviado fuera)
- **Reunión** (programar o registrar una ya realizada)
- **Nota**
- **Tarea**
- **Mensajes:** LinkedIn, WhatsApp, SMS (registrar mensajes enviados)
- **Correo postal** (registrar envío)

Algunas actividades se registran automáticamente; el usuario también puede registrar manualmente interacciones ocurridas fuera del sistema.

## 2. Crear/registrar desde un registro

- En la ficha del registro, barra de iconos arriba a la izquierda: un icono por tipo de actividad (orden personalizable).
- Campos comunes al registrar: **fecha** y **hora** en que ocurrió, texto con formato (negrita, subrayado, etc.), inserciones (imágenes, fragmentos), y **asociaciones con otros registros** (agregar/editar/eliminar registros asociados a la actividad).
- **Tarea de seguimiento:** al registrar una llamada/correo, opción de crear una tarea programada (ej. seguimiento en 2 días laborables).
- Al guardar (`Registrar actividad` / `Guardar nota`), la actividad aparece en la **cronología** del registro.

### Opciones específicas por tipo

| Tipo | Opciones |
|---|---|
| Llamada | `Resultado de la llamada` (predeterminados: Ocupado, Conectado, Dejó mensaje en directo, Dejó mensaje de voz, No contesta, Número equivocado; admite personalizados), `Dirección` (Entrante/Saliente), `Tipo de llamada`, `Contactos llamados` |
| Reunión | `Resultado de la reunión` (mismas opciones predeterminadas que llamada), `Tipo de reunión`, `Asistentes` (máx. 50 visibles; si se agregan más, la reunión igual se registra en su contacto), `Notas internas` (solo al programar, no al registrar) |
| Tarea | `Título`, `Fecha de vencimiento`, `Notas`, `Prioridad` (Baja/Media/Alta), `Tipo` (Llamada/Correo electrónico/Pendiente; por defecto Pendiente), `Recordatorios`, `Cola`, `Asignado a` |
| Nota | `Cuerpo de la nota` |

## 3. Propiedades predeterminadas de actividades

**Generales (todos los tipos):** `Actividad asignada a` (en tareas: `Asignado a`), `Actividad creada por`, `Fecha de actividad` (si no se indica al importar/crear, se usa la fecha/hora de creación), `ID de archivos adjuntos`, `Fecha de creación`, `Fecha de última modificación`, `Fuente del registro` + 3 niveles de detalle de fuente, `Creado por ID de usuario`, `Actualizado por ID de usuario`.

**Llamadas:** `Tipo de llamada y reunión`, `Dirección de llamada`, `Duración de la llamada` (milisegundos), `Notas de llamada`, `Resultado de la llamada`, `Fuente de llamada` (VoIP/Zoom/integraciones), `Estado de la llamada` (Ocupada, Cancelada, Completada, Conectando, Fallida, En curso, Perdida, Sin respuesta, En cola, Repicando), `Título`, `URL de grabación`, números de origen/destino, `Transcripción disponible` (TRUE/FALSE).

**Correos electrónicos:** `Asunto`, `Cuerpo`, `Dirección` (Entrante/Saliente), remitente/destinatario/CCO, `Estado de envío` (Rebotado, Fallido, Programado, Enviando, Enviado), métricas de aperturas/clics/respuestas, `ID de secuencia` si aplica.

**Reuniones:** `Nombre de la reunión`, `Descripción`, `Hora de inicio`, `Hora de finalización` (ambas fecha-hora), `Resultado`, `Tipo de ubicación` (Llamada telefónica/Dirección/Videoconferencia), `Lugar`, `URL de videoconferencia`, contadores de resultados (completada/cancelada/no presentados/reprogramada, valor 1/0), `Fuente de la reunión`.

**Notas:** `Cuerpo de la nota`. **Correo postal:** cuerpo y vista previa.

## 4. Cronología del registro (timeline)

- Pestaña `Actividades` en la columna central del registro; subpestañas por tipo: Notas, Correos electrónicos, Llamadas, Tareas, Reuniones.
- Filtros por propiedad de actividad (ej. `Resultado de llamada = Conectado`), filtro por equipo, y búsqueda de texto en: asunto de correo, asunto/cuerpo de tarea, cuerpo de nota, cuerpo de llamada y cuerpo de reunión.
- **Páginas de índice de actividades:** vista masiva por tipo (llamadas, correos, reuniones, notas, tareas, comunicaciones, correo postal) con filtros rápidos y avanzados, edición y borrado en bloque.
- Las actividades se pueden **editar, eliminar y comentar**; los comentarios son visibles para usuarios con acceso al registro.
- **Restauración:** actividades eliminadas restaurables dentro de **90 días**; después se borran permanentemente. (Los correos solo se restauran desde su página de índice.)

## 5. Asociaciones automáticas de actividades

Regla configurable por objeto + tipo de actividad (`Configuración → Objetos → Actividades → pestaña Asociaciones`). Cuando se registra una actividad en un registro, definir si también se asocia a sus registros asociados:

- **Ninguna:** no se propaga (excepción: en llamadas/correos, el contacto llamado/escrito siempre queda asociado).
- **Registrar en todos:** se asocia a todos los registros asociados, hasta las 500 asociaciones más recientes.
- **Registrar en 1 asociado más reciente.**
- **Registrar en los 5 asociados más recientes.**
- **Registrar en la empresa principal** (solo empresas).

Ejemplo predeterminado útil: una reunión registrada en un contacto se asocia también a su empresa principal y a su último negocio abierto.

## 6. Reglas de UX a replicar

1. Iconos de actividad en la parte superior del registro, con orden personalizable.
2. Editor en línea con formato de texto e inserciones.
3. Selector de asociaciones dentro del propio editor de la actividad.
4. Cronología con pestañas por tipo, filtros, búsqueda y comentarios.
5. Estados visibles: tarea atrasada (`Está atrasada` = TRUE si no está completada y venció).

## 7. Referencias

- https://knowledge.hubspot.com/es/records/manually-log-activities-on-records
- https://knowledge.hubspot.com/es/properties/hubspots-default-activity-properties
- https://knowledge.hubspot.com/es/records/filter-activities-on-a-record-timeline
- https://knowledge.hubspot.com/es/object-settings/configure-automatic-activity-associations
- https://knowledge.hubspot.com/es/records/comment-on-an-activity
- https://knowledge.hubspot.com/es/records/restore-deleted-activity-in-a-record
