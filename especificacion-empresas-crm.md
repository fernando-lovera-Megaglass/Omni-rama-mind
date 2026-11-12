# Especificación funcional: módulo de Empresas (estilo HubSpot)

> **Propósito:** especificación para el agente de código (Craft Anything) que construirá el módulo de **empresas** del CRM. Documento hermano de `especificacion-importacion-contactos-crm.md`.
>
> Fuentes: documentación oficial de HubSpot (Knowledge Base en español). Ver referencias al final.

---

## 1. Conceptos del modelo de datos

- El CRM se compone de **objetos** (contactos, empresas, negocios, tickets), **registros** (instancias de un objeto) y **propiedades** (campos de un registro).
- La **empresa** es un objeto estándar. Sus identificadores clave: `Nombre` y `Nombre de dominio de la empresa`.
- El `Nombre de dominio de la empresa` solo acepta valores hasta el dominio de nivel superior (ej. `.com`, `.edu`); lo que siga después (ej. `.edu/home`) se elimina automáticamente.
- Las empresas se **asocian** a contactos, negocios, tickets y actividades. Cada empresa puede tener varios dominios adicionales (columna `Dominios adicionales`, separados por `;`).

## 2. Creación y asociación automática por dominio

Regla central del módulo (configurable con un checkbox en ajustes: `Objetos → Empresas → Crear y asociar empresas con contactos`):

1. El sistema compara el **dominio del correo electrónico** del contacto con el `Nombre de dominio de la empresa`. Ejemplo: `sandra@example.com` → empresa con dominio `example.com`.
2. Si la empresa **no existe**, se crea automáticamente un registro de empresa nuevo (uno por cada dominio único; los subdominios cuentan como dominios distintos: `@ejemplo.com` y `@info.ejemplo.com` generan dos empresas).
3. Si el contacto usa un **correo gratuito** (gmail.com, yahoo.com, hotmail.com), el sistema mira en su lugar la propiedad `URL del sitio web` del contacto para buscar coincidencia de dominio. Si tampoco la hay, no se asocia.
4. Aplica tanto a contactos existentes como a nuevos. Al activar la opción, el usuario elige si se aplica **retroactivamente** a los contactos existentes o solo a los nuevos.

**Cuándo NO se produce la asociación automática (aunque esté activada):**

- El contacto ya tiene una empresa asociada distinta al dominio de su correo (la configuración **no anula** asociaciones existentes ni sincroniza propiedades como `Nombre de la empresa`).
- El contacto se creó mediante una importación multi-objeto que ya traía asociaciones.
- El contacto tiene correo gratuito y no tiene `URL del sitio web`.

**Exclusiones:** se pueden excluir hasta **1.000 dominios** de la asociación automática (lista de `Dominios excluidos` en ajustes). Al reactivar dominios excluidos, hay que desactivar y reactivar la opción.

**Duplicados:** si varias empresas comparten el mismo dominio, los contactos se asocian automáticamente solo a **una** de ellas (no se puede elegir cuál; se corrige manualmente).

## 3. Empresa principal (asociación primaria)

- Al asociar una empresa al crear un registro, esa empresa queda como **principal** por defecto.
- En contactos: la primera empresa asociada es la principal; si solo hay una, debe ser principal.
- La empresa principal aparece en columnas `[Objeto] → Empresa (principal)` en las páginas de índice.
- Las actividades de la cronología del registro (correos, llamadas) se asocian automáticamente a la **empresa principal**.
- Se puede **sustituir** la empresa principal por otra asociada; la anterior sigue asociada pero pierde la etiqueta de principal.
- Los tickets se asocian automáticamente a la empresa principal del contacto asociado (configurable).

## 4. Empresas matrices y filiales (parent/child)

- Etiquetas de asociación predeterminadas: `Empresa matriz` y `Empresa filial`.
- Una matriz puede tener **varias** filiales; una filial solo puede tener **una** matriz.
- Se crean manualmente desde la tarjeta `Empresas` del registro (`+ Añadir empresa → + Añadir etiqueta de asociación`) o editando etiquetas de una asociación existente.
- En masa vía importación: archivo con las empresas filiales + columna `Empresa asociada [ID/dominio]` con el identificador de la matriz; marcar `Crear asociaciones empresa-empresa`; mapear la columna como `Asociación` con etiqueta `Empresa matriz`.

## 5. Gestión de asociaciones (reglas generales)

- Asociar registros existentes desde el panel del registro: buscar, seleccionar, opcionalmente etiquetar y guardar.
- Vías de asociación en masa: importación (1 o 2 archivos), API, vinculación por dominio, workflows.
- Límite de referencia: un contacto puede asociarse por defecto hasta a 50.000 empresas.
- El número de asociaciones por par de objetos depende de la configuración de límites de asociación.

## 6. Reglas de UX a replicar

1. Página de índice de empresas con columnas configurables, incluida `Empresa (principal)` en los índices de otros objetos.
2. Tarjeta de `Empresas` en la barra lateral del registro con acciones: vista previa, establecer/eliminar como principal, editar etiquetas.
3. Ajuste global de asociación automática con diálogo de activación retroactiva y lista de dominios excluidos.
4. Creación manual de empresa con formulario (nombre, dominio, propietario, etc.).

## 7. Referencias

- https://knowledge.hubspot.com/es/object-settings/automatically-create-and-associate-companies-with-contacts
- https://knowledge.hubspot.com/es/records/add-a-parent-or-child-company
- https://knowledge.hubspot.com/es/records/associate-records
- https://knowledge.hubspot.com/es/get-started/manage-your-crm-database
