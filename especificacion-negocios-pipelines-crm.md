# Especificación funcional: módulo de Negocios y Pipelines (estilo HubSpot)

> **Propósito:** especificación para el agente de código (Craft Anything) que construirá el módulo de **negocios (deals) y pipelines** del CRM. Documento hermano de `especificacion-importacion-contactos-crm.md`.
>
> Fuentes: documentación oficial de HubSpot (Knowledge Base en español). Ver referencias al final.

---

## 1. Conceptos

- Un **negocio** es un registro que representa una oportunidad de ingresos. Propiedades clave: `Nombre del negocio`, `Pipeline`, `Etapa del negocio`, `Importe`, `Fecha de cierre`, `Propietario del negocio`.
- Un **pipeline** es un proceso visual dividido en **etapas**; cada etapa indica dónde está el registro en el proceso.
- Los objetos con pipeline: negocios, tickets, leads, tareas, pedidos, proyectos, servicios, citas, cursos, listados, usuarios y objetos personalizados.

## 2. Pipeline de ventas predeterminado (debe existir al crear la app)

Siete etapas, cada una con una **probabilidad de cierre** asociada:

| Etapa | Probabilidad | Tipo |
|---|---|---|
| Cita programada | 20% | Abierta |
| Cualificado para comprar | 40% | Abierta |
| Presentación programada | 60% | Abierta |
| Comprado por el decisor | 80% | Abierta |
| Contrato enviado | 90% | Abierta |
| Cierre ganado | 100% | Cerrada (Ganado) |
| Cierre perdido | 0% | Cerrada (Perdido) |

Reglas:

- La **cantidad neta (ponderada)** de la vista de tablero = total del importe de la etapa × probabilidad de la etapa.
- Todo pipeline de negocios **debe incluir etapas Ganado y Perdido**; de lo contrario los informes de ventas e ingresos no procesan los negocios correctamente.
- Para el resto de objetos, cada etapa se marca como `Abierta` o `Cerrada` (en tickets se llaman "estados").

## 3. Gestión de pipelines (panel de administración)

Ubicación: `Configuración → Objetos → [objeto] → pestaña Pipelines`.

- **Crear pipeline:** desde cero (solo nombre) o **clonando** uno existente (copia reglas, automatizaciones, propiedades condicionales de etapa, etiquetas y acceso).
- **Editar:** renombrar, reordenar (arrastrar), gestionar acceso por usuarios/equipos, color por pipeline, ver **nombre interno** (usado por API e integraciones).
- **Eliminar:** no se puede eliminar un pipeline con registros o referenciado por otras herramientas; primero hay que mover/borrar registros.
- Límite de referencia de pipelines personalizados: 15 (básico) / 100–350 (Pro/Enterprise). El pipeline predeterminado no cuenta.

## 4. Gestión de etapas

- Agregar etapa: nombre + (en negocios) probabilidad predefinida o personalizada / (en otros objetos) Abierta o Cerrada.
- Renombrar, reordenar arrastrando, color por etapa, nombre interno por etapa.
- Eliminar etapa: solo si no hay registros ni propiedades condicionales que la usen (la UI muestra la columna `Utilizado en` con las referencias que bloquean el borrado).

### Propiedades condicionales de etapa

- Al crear o mover un registro a una etapa, se pueden mostrar **propiedades dependientes** configuradas por regla de lógica (operadores: `es igual a`, `es cualquiera de`, `es ninguno de`, `es conocido`, etc.).
- Cada propiedad dependiente puede marcarse **Obligatoria**: el usuario no puede crear/actualizar el registro sin darle valor.
- Las propiedades de solo lectura (puntuación, cálculo) no pueden usarse como propiedades de etapa.
- El orden de las propiedades dependientes se define arrastrando.

## 5. Reglas de pipeline

Configurables por pipeline (pestaña `Reglas de pipeline`):

- **Impedir retroceso:** en `Todas las etapas` o en etapas seleccionadas; una vez alcanzada una etapa protegida, el registro no puede volver atrás (aplica en UI, API e integraciones). Excepción: sí se puede retroceder desde una etapa Cerrada al reabrir el registro.
- **Controlar acceso de edición por etapa:** limitar quién edita registros en ciertas etapas (solo superadmins o usuarios/equipos específicos).
- Cuando hay reglas activas, no se permite editar en bloque el pipeline/etapa de los registros de ese pipeline.

## 6. Automatización por etapa

- Pestaña `Automatizar` del pipeline: ejecutar acciones cuando un registro entra a una etapa (crear tarea, enviar notificación interna, correo, etc.).
- Ejemplo típico: crear una tarea al gerente cuando un negocio pasa a `Cierre ganado`.

## 7. Previsión (forecast)

- Cada etapa del pipeline se asigna a una **categoría de previsión**: `Pipeline` (baja probabilidad), `Mejor caso` (moderada), `Comprometido` (alta) o `Cierre ganado`. Los negocios en pipeline no comprometidos se excluyen de la previsión.
- Propiedad `Categoría de previsión` del negocio: `No previsto`, `Pipeline`, `Mejor caso`, `Comprometido`, `Cierre ganado` (etiquetas editables y ampliables con categorías personalizadas).
- Opción `Automatizar categorías de previsión`: al cambiar de etapa, la categoría se actualiza sola.
- Propiedad `Probabilidad de la previsión`: porcentaje personalizado de cierre.

## 8. Propiedades de negocio predeterminadas relevantes

- `Importe`, `Fecha de cierre`, `Propietario del negocio`, `Pipeline`, `Etapa del negocio`, `Categoría de previsión`, `Probabilidad de la previsión`.
- Automáticas del sistema: `Equipo HubSpot` (equipo principal del propietario), `ID de negocios combinados` (tras fusión), `ID/Nombre de la próxima reunión`.

## 9. Vista de tablero (board view)

- Columnas = etapas; tarjetas = negocios; arrastrar tarjeta entre columnas cambia la etapa.
- Total por columna y **total ponderado** (importe × probabilidad de la etapa).
- `Personalizar vista de tablero y tarjetas`: elegir qué propiedades se muestran en las tarjetas.
- Etiquetas de objeto codificadas por color para categorizar tarjetas.

## 10. Referencias

- https://knowledge.hubspot.com/es/object-settings/set-up-and-customize-pipelines
- https://knowledge.hubspot.com/es/object-settings/set-up-pipeline-rules
- https://knowledge.hubspot.com/es/object-settings/set-up-pipeline-automations-for-objects
- https://knowledge.hubspot.com/es/forecast/set-up-the-forecast-tool
- https://knowledge.hubspot.com/es/properties/hubspots-default-deal-properties
