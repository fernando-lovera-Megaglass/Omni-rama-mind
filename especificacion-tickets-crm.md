# Especificación funcional: módulo de Tickets (estilo HubSpot)

> **Propósito:** especificación para el agente de código (Craft Anything) que construirá el módulo de **tickets** (soporte/atención al cliente) del CRM. Documento hermano de `especificacion-importacion-contactos-crm.md`.
>
> Fuentes: documentación oficial de HubSpot (Knowledge Base en español). Ver referencias al final.

---

## 1. Conceptos

- Un **ticket** es un registro que representa una consulta o problema de un cliente. Propiedades clave: `Nombre del ticket`, `Pipeline`, `Estado del ticket`, `Propietario del ticket`, `Descripción`, `Prioridad`.
- En los tickets, las etapas del pipeline se llaman **estados**, pero funcionan igual que las etapas de otros objetos.
- Los tickets se asocian a contactos y empresas; por defecto, un ticket se asocia automáticamente a la **empresa principal del contacto asociado** (configurable).

## 2. Pipeline de soporte predeterminado

Debe existir al crear la app, con cuatro estados:

| Estado | Tipo |
|---|---|
| Nuevo | Abierto |
| En espera de contacto | Abierto |
| En espera de nosotros | Abierto |
| Cerrado | Cerrado |

- Se pueden agregar/editar/reordenar/eliminar estados (cada estado es `Abierto` o `Cerrado`).
- Se pueden crear pipelines de tickets adicionales (mismas reglas que el módulo de pipelines: renombrar, clonar, gestionar acceso, propiedades condicionales, reglas, automatización).
- No se puede eliminar un pipeline con tickets; primero se mueven a otro pipeline.

## 3. Vías de creación de tickets

1. **Manual:** desde `CRM → Tickets` o desde un registro asociado (contacto/empresa), con formulario (nombre, pipeline, estado, propietario, descripción, prioridad).
2. **Bandeja de entrada / centro de ayuda:** al conectar canales (correo de equipo, chat, formulario, WhatsApp, llamadas), los mensajes entrantes crean tickets automáticamente:
   - En el canal se configuran las propiedades por defecto del ticket: `Pipeline`, `Estado` y `Propietario del ticket`.
   - Con reglas de asignación automática, el propietario del ticket hereda el propietario de la conversación (editable).
   - En formularios: interruptor `Creación automática de ticket`; los campos `Pipeline de tickets` y `Estado de ticket` van ocultos por defecto y se ajustan desde la configuración del formulario.
   - Límite: si el contacto alcanzó el máximo de asociaciones permitidas, no se crea el ticket automático.
3. **Importación:** requiere columnas `Nombre del ticket`, `Pipeline`, `Estado del ticket` (ver `especificacion-importacion-contactos-crm.md`).
4. **Workflows/automatización:** creación por reglas.

## 4. Automatización de estados

- Pestaña `Automatizar` del pipeline de tickets: acciones al entrar a un estado (crear tarea, notificación interna, correo, etc.).
- Plantilla predeterminada `Actualizar estado del ticket`: puede desactivarse por casilla de verificación.
- Ejemplo típico: notificar al equipo de soporte cuando se crea un ticket nuevo para que ninguna consulta quede sin respuesta.

## 5. Reglas de pipeline aplicables a tickets

- **Impedir retroceso** de tickets entre estados (todos o seleccionados).
- **Control de acceso de edición por estado** (solo superadmins o usuarios/equipos concretos).
- **Propiedades condicionales por estado:** exigir/mostrar propiedades al mover el ticket a un estado (ej. exigir `Motivo de cierre` al pasar a `Cerrado`).

## 6. Vistas

- **Vista de tablero:** columnas = estados; arrastrar tarjeta cambia el estado. Personalizable qué propiedades se ven en las tarjetas.
- **Vista de tabla/índice:** columnas configurables, filtros rápidos y avanzados, vistas guardadas por pestañas.
- Etiquetas de objeto con color para categorizar tickets.

## 7. Reglas de UX a replicar

1. Crear ticket en ≤3 campos obligatorios (nombre, pipeline, estado) con valores por defecto sensatos (primer pipeline, primer estado abierto).
2. Al mover un ticket a `Cerrado`, si hay propiedades condicionales obligatorias, mostrar formulario emergente.
3. En la ficha del ticket: tarjetas de contacto/empresa asociados, cronología de actividades y conversación relacionada.
4. Indicador de tickets abiertos vs. cerrados por pipeline.

## 8. Referencias

- https://knowledge.hubspot.com/es/object-settings/set-up-and-customize-pipelines
- https://knowledge.hubspot.com/es/object-settings/set-up-pipeline-automations-for-objects
- https://knowledge.hubspot.com/es/object-settings/set-up-pipeline-rules
- https://knowledge.hubspot.com/es/inbox/connect-channels-to-the-conversations-inbox
- https://knowledge.hubspot.com/es/help-desk/overview-of-the-help-desk-workspace
