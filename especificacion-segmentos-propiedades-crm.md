# Especificación funcional: módulo de Segmentos y Propiedades personalizadas (estilo HubSpot)

> **Propósito:** especificación para el agente de código (Craft Anything) que construirá los módulos de **segmentos** (antes "listas") y **propiedades personalizadas** del CRM. Documento hermano de `especificacion-importacion-contactos-crm.md`.
>
> Fuentes: documentación oficial de HubSpot (Knowledge Base en español). Ver referencias al final.

---

## PARTE A — Segmentos

### 1. Conceptos

- Un **segmento** agrupa registros de un objeto (contactos, empresas, negocios, tickets, etc.) según criterios de filtrado.
- Dos tipos:
  - **Activo:** se actualiza solo; los registros entran al cumplir los criterios y salen al dejar de cumplirlos. Uso típico: envíos recurrentes, segmentación por propiedades que cambian (ej. `Etapa del ciclo de vida`).
  - **Estático:** foto fija de los registros que cumplían el criterio al guardar; no se actualiza solo; registros se añaden/quitan **manualmente**. Uso típico: envíos únicos, asistentes a un evento, borrado en bloque.

### 2. Creación de un segmento

1. `CRM → Segmentos → Crear segmento` → elegir el **objeto** a segmentar.
2. (Opcional) Generar filtros con IA a partir de una descripción en lenguaje natural; el usuario puede editarlos después.
3. Editor de segmento: nombre editable (icono de lápiz), `Añadir a carpeta`, y panel izquierdo de filtros.
4. Límites: hasta **250 filtros** por segmento, incluidos hasta **60 filtros de objetos asociados**.
5. Al guardar: elegir tipo (Activo/Estático), descripción (o generarla con IA), asociar a campaña, pestaña `Acceso` (qué usuarios/equipos lo ven/editan), y `Guardar y procesar segmento`.
6. Tras guardar, el segmento se **procesa**; al terminar se muestra el recuento exacto de registros. Se puede seguir editando después.
7. **Clonar:** desde la pestaña `Mánager` → `Más → Clonar`, para duplicar y ajustar.

### 3. Sistema de filtros

- **Categorías de filtro:** `Propiedades`, `Eventos` (ej. interacción con CTA), `Afiliaciones` (ej. inscripción en workflows, membresía en otro segmento).
- **Filtros del mismo objeto** (ej. propiedad de contacto en un segmento de contactos) y **filtros de objetos asociados** (ej. propiedad de la empresa asociada). En los asociados, por defecto basta con que **algún** registro asociado cumpla; se puede restringir a empresa principal o a una etiqueta de asociación.
- **Operadores:** `es igual a`, `es conocido`, etc., según el tipo de campo.
- **Introducción de valores por tipo:**
  - Lista desplegable / casilla: seleccionar valores.
  - Texto: escribir valores; varios separados por `;` (ej. `Boston; Chicago; Nueva York`).
  - Numérico: igual (ej. `10; 25; 30`).
  - Fecha: selector de calendario (zona horaria de la cuenta).
- **Grupos de filtros:** lógica **Y** dentro del grupo y **O** entre grupos (menús desplegables `y`/`o`); clonar o eliminar grupos completos; eliminar criterios individuales.

### 4. Usos de un segmento

- Enviar correo de marketing (solo segmentos de contactos).
- Inscribir el segmento en un workflow.
- Filtrar otros segmentos e informes con `afiliación a segmentos`.
- Crear audiencias de anuncios (contactos y empresas).
- Encuestas de satisfacción (solo segmentos estáticos de contactos).
- Crear segmento automáticamente desde una importación de contactos (ver especificación de importación).

---

## PARTE B — Propiedades personalizadas

### 1. Conceptos

- Las **propiedades** son los campos de los registros. Cada objeto trae **propiedades predeterminadas** y admite **propiedades personalizadas**.
- Antes de crear una personalizada, comprobar si ya existe una predeterminada equivalente.
- Algunas propiedades **no se pueden editar**: ciertas predeterminadas y las que están en uso en registros, segmentos o workflows.
- Las propiedades nuevas quedan con **valor nulo** salvo que se defina un valor predeterminado (solo en tipos texto, número y enumeración).
- Límite de propiedades personalizadas según plan; al bajar de plan se conservan las existentes pero no se pueden crear nuevas por encima del límite.

### 2. Creación de una propiedad

**Editor básico:** `Etiqueta de propiedad` + `Tipo de campo` → crear.

**Editor completo** (pestañas):

1. **Detalles:** etiqueta, descripción, grupo de propiedades. El **nombre interno** y el objeto no son editables tras la creación (los usa la API).
2. **Tipo de campo:** configurar tipo, opciones y valor predeterminado.
3. **Reglas:** visibilidad, validación (ej. sin caracteres especiales, longitud mínima/máxima) según el tipo.
4. **Datos sensibles:** marcar la propiedad como sensible (nivel Enterprise).
5. **Gestionar acceso:** quién la ve y quién la edita (todos / solo superadmins / equipos).
6. **Vista previa:** probar el comportamiento antes de crear.

**Tipos de campo de referencia:** texto (una línea y multilínea), número, casilla de verificación única, múltiples casillas de verificación, selección desplegable, selección de radio, selector de fecha, selector de fecha-hora, duración, usuario, archivo, URL, puntuación, cálculo, número de teléfono, enumeración.

**Creación con agente de IA (Data Agent):** describir en texto ("crear un desplegable llamado nivel de suscripción con opciones bronce, plata, oro y platino") → genera nombre, tipo de campo, valor por defecto y reglas de validación; el usuario revisa y confirma.

### 3. Edición, clonación y reglas importantes

- **Editar:** pestañas Detalles / Tipo de campo / Reglas / Gestionar acceso / Opciones condicionales (para enumeraciones: mostrar opciones según lógica).
- Cambiar el **tipo de campo** de una propiedad existente puede **invalidar los valores almacenados** → advertir y recomendar exportar antes.
- No se puede cambiar **a** `Puntuación` o `Cálculo`, ni esas a otro tipo.
- Las propiedades de tipo **usuario** no pueden pasar a multiselección una vez creadas.
- **Clonar:** duplicar una propiedad personalizada con toda su configuración (las predeterminadas no se clonan).
- Al crear una propiedad personalizada de **producto**, se crea una propiedad de elemento de línea espejo que sincroniza valores (no editable por separado).
- Vista de calidad de datos: dónde se usa la propiedad (`Usos`), anomalías (`Calidad de los datos`), qué herramientas la actualizan (`Fuentes de datos`).

### 4. Integración con otros módulos

- Las propiedades personalizadas aparecen como opción en el **mapeo de importaciones** (y se pueden crear en línea durante el mapeo).
- Una propiedad puede marcarse como de **valor único** para usarse como identificador en importaciones/desduplicación.
- Son filtrables en **segmentos**, informes y workflows.

## Referencias

- https://knowledge.hubspot.com/es/segments/create-active-or-static-lists
- https://knowledge.hubspot.com/es/properties/create-and-edit-properties
- https://knowledge.hubspot.com/es/properties/hubspots-default-contact-properties
- https://knowledge.hubspot.com/es/get-started/manage-your-crm-database
