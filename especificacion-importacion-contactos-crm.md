# Especificación funcional: módulo de importación de contactos (estilo HubSpot)

> **Propósito de este documento:** servir como especificación funcional para un agente de código (por ejemplo, el agente que ejecuta Craft Anything) que debe construir el módulo de **importación de contactos** de un CRM similar a HubSpot. Describe comportamiento, reglas de negocio, validaciones, estados y manejo de errores que el producto final debe replicar.
>
> Fuentes: documentación oficial de HubSpot (Knowledge Base en español y documentación para desarrolladores). Ver referencias al final.

---

## 1. Alcance del módulo

El módulo de importación permite al usuario crear o actualizar registros del CRM (contactos, empresas, negocios, tickets y actividades) a partir de hojas de cálculo, con dos niveles de complejidad:

| Flujo | Uso |
|---|---|
| **Importación rápida** | Solo contactos. Flujo reducido de pasos, sin asociaciones ni ajustes avanzados. |
| **Importación avanzada** | Todos los objetos y actividades, con asociaciones, varios archivos y opciones avanzadas. |

Además del flujo de interfaz (wizard), el sistema debe exponer una **API de importaciones** para procesamiento masivo programático.

---

## 2. Requisitos técnicos del archivo de importación

Todo archivo importado debe cumplir:

- **Formatos aceptados:** `.csv`, `.xlsx`, `.xls`.
- **Una sola hoja** de cálculo por archivo.
- **Fila de encabezados obligatoria:** cada encabezado de columna corresponde a una propiedad del CRM. El orden de las columnas no afecta la importación.
- **Máximo de columnas:** menos de 1.000.
- **Codificación UTF-8** si el archivo incluye caracteres de idiomas extranjeros.
- Un **contacto/registro por fila**.
- Para Excel con propiedades de fecha-hora: celdas en **formato numérico**.

### Límites de volumen (parámetros configurables del sistema)

| Parámetro | Nivel gratuito | Nivel de pago |
|---|---|---|
| Tamaño máximo de archivo | 20 MB | 512 MB |
| Importaciones por día | 50 | 500 |
| Filas por día | 500.000 | 10.000.000 (hasta 80.000.000 vía API) |
| Filas por archivo | — | 1.048.576 |
| Importaciones simultáneas | 3 (máx. 2 de más de 10.000 filas; la 4.ª y siguientes quedan en cola) | Igual |
| Datos por celda/fila | Máximo 1 MB | Máximo 1 MB |

Los límites se aplican en una ventana móvil de 24 horas (no se reinician a una hora fija).

---

## 3. Propiedades requeridas por objeto

Para **crear** registros, el archivo debe incluir estas columnas:

| Objeto / actividad | Propiedades requeridas |
|---|---|
| **Contacto** | Al menos uno de: `Nombre`, `Apellido`, `Correo electrónico` (en la doc. más reciente: `Correo electrónico`) |
| **Empresa** | Al menos uno de: `Nombre` o `Dominio de la empresa` |
| **Negocio** | `Nombre del negocio`, `Pipeline`, `Etapa del negocio` (la etapa debe existir en ese pipeline) |
| **Ticket** | `Nombre del ticket`, `Pipeline`, `Estado del ticket` |
| **Producto** | Para actualizar: `ID de registro` o `SKU`; más `Precio unitario` y `Nombre` |
| **Elemento de línea** | `Nombre`, `Cantidad`, `Precio`, + identificador del negocio asociado |
| **Llamada** | `Notas de llamada` (recomendado: `Fecha de actividad`) |
| **Correo electrónico** | `Cuerpo del correo`, `Dirección del correo electrónico` |
| **Reunión** | `Descripción`, `Hora de inicio`, `Hora de finalización` (recomendado: `Fecha de actividad`) |
| **Nota** | `Cuerpo de la nota` |
| **Tarea** | `Título de la tarea`, `Fecha de vencimiento` |

Reglas adicionales:

- El `Dominio de la empresa` solo acepta valores hasta el dominio de nivel superior (ej. `.com`, `.edu`); cadenas posteriores (ej. `.edu/home`) se eliminan al importar.
- Si no se incluye `Fecha de actividad` en actividades nuevas, se establece automáticamente la fecha/hora de la importación.
- Las actividades existentes (correos, reuniones, notas, tareas) **no se pueden actualizar** mediante importación; solo se crean nuevas.
- **Celdas en blanco:** se ignoran; nunca borran valores existentes en registros ya creados.

---

## 4. Formato de valores según el tipo de campo

| Tipo de campo | Requisitos de formato |
|---|---|
| **Fecha** | Meses como número, 3 letras o nombre completo (10, OCT, octubre); años de 2 o 4 dígitos; separadores `/`, `-` o `.`. Formatos válidos: día-mes-año, mes-día-año, año-mes-día. |
| **Fecha-hora** | Marca de tiempo `hh:mm` (ej. 28/10/2020 14:30) o UNIX en milisegundos (CSV). Sin hora → medianoche. Desfase horario: `+hh:mm` / `-hh:mm`. |
| **Duración** | Marca de tiempo UNIX en milisegundos. |
| **Enumeración** (dropdown, radio, selección múltiple, casilla) | El valor debe coincidir con la **etiqueta** o el **valor interno** de una opción existente. En propiedades predeterminadas, la etiqueta en inglés o el valor interno. |
| **Múltiples casillas de verificación** | Valores separados por `;` sin espacios (`valor1;valor2`). Para **anexar** sin sobrescribir, anteponer `;` al primer valor (`;valor3;valor4`). Las opciones deben existir antes de importar. |
| **Casilla única** | `Verdadero`/`Sí` → marcado; `Falso`/`No` → no marcado. |
| **Número — divisa** | Divisa aceptada por la cuenta; USD con decimales (ej. 123,45). |
| **Número — porcentaje** | Con signo `%` o como decimal (25% o .25). |
| **Número — teléfono** | `+[código país][número]`; extensión: `ext[número]` (ej. `+11234567890 ext123`). Formateo automático por código de país. |
| **Usuario (propietario)** | Columna `Propietario [Objeto]` (objetos) o `Actividad asignada a` (actividades). Valor: nombre, correo electrónico o valor interno. Preferir correo si hay usuarios con el mismo nombre. No se envía notificación de asignación. |
| **Archivo** | `ID de archivo` existente en el sistema. |
| **Plazo (term)** | Número de meses, o formato ISO-8601 `PnYnMnD` / `PnW` (ej. `P12M`, `P24M`). |
| **Texto** | Sujeto a reglas de validación configuradas; si no las cumple, no se importa el valor. |

### Correos electrónicos y dominios adicionales

- Contactos con varios correos: columna `Direcciones de correo electrónico adicionales`; varios valores en una celda separados por `;`.
- Empresas con varios dominios: columna `Dominios adicionales`, misma regla.
- Al crear un registro nuevo, su correo/dominio principal **no puede** ser un correo/dominio adicional ya existente en otro registro.

---

## 5. Identificadores únicos y desduplicación

Para **actualizar** registros existentes y evitar duplicados, cada objeto necesita un identificador único:

| Objeto | Identificadores únicos aceptados |
|---|---|
| Todos | `ID de registro` (siempre prevalece sobre cualquier otro identificador) o propiedad personalizada con valores únicos |
| Contactos | Además: `Correo electrónico` (siempre exige valores únicos) |
| Empresas | Además: `Nombre de dominio de la empresa` |

Reglas de negocio:

- Si se usa una propiedad personalizada única para desduplicar **empresas**, el dominio deja de exigir unicidad (pueden importarse dominios duplicados).
- Si se usa una propiedad personalizada única para **contactos**, el correo electrónico **sigue exigiendo** valores únicos.
- Un **correo secundario** puede identificar un contacto existente: sin columna `ID de registro`, no reemplaza al correo principal; con `ID de registro` incluida, sí lo reemplaza.
- En importaciones multi-objeto con `ID de registro`, diferenciar encabezados por objeto (ej. `ID de registro - Contactos`, `ID de registro - Empresas`).
- Si el archivo incluye varias propiedades de valor único, el usuario elige cuál se usa para buscar registros existentes en el paso final.

---

## 6. Modos de importación por objeto

El usuario elige por objeto cómo importar:

1. **Crear y actualizar:** crea registros nuevos y actualiza existentes identificados por el identificador único.
2. **Solo crear:** crea únicamente registros nuevos; las filas que coinciden con registros existentes se ignoran.
3. **Solo actualizar:** actualiza únicamente registros existentes; las filas sin coincidencia se ignoran.

En multi-objeto con «Crear y actualizar» y sin identificador único: datos idénticos de un objeto repetidos en varias filas se tratan como **un solo registro** (asociable a varios registros relacionados); si los datos difieren, se crean registros independientes.

---

## 7. Asociaciones entre registros

### 7.1 En un solo archivo

- Incluir en la misma fila los identificadores únicos del registro importado y del registro a asociar.
- Para asociar un registro a varios (ej. un contacto a dos empresas): **varias filas** con el mismo identificador del contacto y distinto identificador de empresa.
- Sin identificadores únicos → se crean duplicados en vez de asociaciones.

### 7.2 En varios archivos (dos objetos)

- Una **columna común** conecta ambos archivos.
- El usuario indica a qué objeto pertenece esa clave única (ej. `Nombre de empresa` → objeto Empresa).

### 7.3 Asociaciones del mismo objeto (ej. contacto ↔ contacto)

- Checkbox explícito durante la importación.
- Al menos un registro de cada par debe **ya existir** en el CRM (no se pueden crear y asociar dos registros nuevos entre sí).
- Solo se acepta el correo/dominio **principal** como identificador (no secundarios).
- Asociar varios a uno: valores separados por `;` en la misma celda.

### 7.4 Etiquetas de asociación

- Columna opcional `Etiqueta de asociación`; las etiquetas deben existir previamente.
- Varias etiquetas por relación: separadas por `;` (ej. `Mánager;Contacto de facturación`).
- Valor `Primaria` para definir la asociación principal.
- Importar etiquetas nuevas **no sobrescribe** las existentes: se añaden como etiquetas adicionales.
- Etiquetas emparejadas (multi-objeto): solo se incluye una; el sistema asigna la contraparte.

---

## 8. Flujo de la interfaz (wizard de importación)

### Importación rápida (solo contactos)

1. Entrada: `Gestión de datos → Integración de datos → Importar datos → Importación rápida`.
2. Subir archivo **o pegar directamente** desde una hoja de cálculo.
3. Revisar el mapeo automático de columnas → propiedades; para columnas sin mapear: elegir propiedad existente o **crear nueva propiedad** en línea.
4. Nombrar la importación + checkbox de **consentimiento** (los contactos esperan recibir comunicaciones; no es una lista comprada).
5. Finalizar → página de revisión con cronología de estado y tiempo estimado.

### Importación avanzada (todos los objetos)

1. Seleccionar objeto(s)/actividades a importar.
2. Elegir: archivo único o varios archivos.
3. Elegir modo por objeto (crear / actualizar / crear y actualizar).
4. Subir archivo(s) o pegar datos; seleccionar **idioma de los encabezados** para mejorar el auto-mapeo (fallback a inglés).
5. **Pantalla de mapeo:** asignar cada columna a una propiedad (icono de llave en los identificadores únicos correctos); opción `No importar columna`.
6. Opciones avanzadas por propiedad:
   - **No sobrescribir:** actualiza solo registros nuevos o que nunca tuvieron valor en esa propiedad (aunque hoy estén vacíos, si alguna vez tuvieron valor, no se tocan).
   - **Etiqueta de asociación** (ver §7.4).
7. Detalles finales: nombre de la importación, consentimiento, y opciones:
   - Propiedad de valor único para desduplicación.
   - **Crear segmento** de contactos a partir de la importación.
   - Establecer **base legal de procesamiento** (si la privacidad de datos está activa).
   - Marcar como **contactos de marketing**.
   - Confirmar **formato de fecha**, **zona horaria** y **formato de número**.
8. Finalizar → página de revisión con cronología de estado.

---

## 9. Estados de una importación (modelo de datos)

Toda importación pasa por un ciclo de vida visible para el usuario:

| Estado | Significado |
|---|---|
| `STARTED` | Registrada, aún sin procesar. |
| `PROCESSING` | En proceso. |
| `DONE` | Completada: registros creados/actualizados y asociaciones aplicadas. |
| `FAILED` | Error no detectado al inicio; no se completó. |
| `CANCELED` | Cancelada por el usuario mientras estaba en `STARTED`, `PROCESSING` o `DEFERRED`. |
| `DEFERRED` | En cola: ya hay 3 importaciones procesándose; inicia cuando una termine. |

### API de importaciones (referencia para el backend)

- `POST /crm/v3/imports/` — inicia una importación (multipart/form-data).
- `GET /crm/v3/imports/` — lista importaciones activas.
- `GET /crm/v3/imports/{importId}` — detalle: nombre, origen, formato, idioma, formato de fecha, mapeos de columnas y estado.
- Límites API: hasta 80.000.000 filas/día; por archivo máx. 1.048.576 filas o 512 MB (el que se alcance primero); al excederse, respuesta HTTP `429` y se recomienda dividir en varias solicitudes.
- La API solo devuelve importaciones hechas por la misma app/integración.

---

## 10. Gestión de errores

### 10.1 Durante el mapeo (pre-importación)

- Indicador `[x] errores` por fila de la tabla de mapeo; panel lateral con detalle del error, columnas y filas afectadas.
- **Editar valores erróneos en línea:** reemplazar un valor de columna se aplica a **todas** las filas donde aparezca (útil para corregir erratas repetidas). Solo se pueden seleccionar valores presentes en las primeras 1.000 filas, pero el reemplazo se aplica a todo el archivo.
- Opciones por valor: **sustituir** o **no importar este valor**.
- Varios reemplazos por columna; `Restablecer todos los cambios` los elimina.
- Al resolver: marca de verificación en la columna `Asignado`; si hubo ediciones, etiqueta `editado`.
- Advertencia: con más de 1.000 filas puede haber errores no resueltos en esta etapa.

### 10.2 Resumen post-importación

La página de revisión muestra:

- Filas importadas, registros **nuevos creados** y **existentes actualizados** (pueden no coincidir con las filas: correos secundarios que actualizan un contacto no cuentan como nuevo).
- Cambios hechos en valores de enumeración o etiquetas durante la importación.
- Tabla **Importar errores** con: columna del archivo, tipo de objeto, propiedad mapeada, tipo de error e **impacto** (filas no importadas vs. valores no importados).
- `Ver filas con errores`: tabla fila a fila con iconos de alerta por columna; **descarga de las filas con errores** como CSV (zip).
- **Descarga del listado de errores** como CSV (zip) con columnas: `Código de error`, `Tipo de objeto`, `Razón` y valores de propiedad.
- Datos sensibles se sustituyen por `ELIMINADO` en pantalla y en el archivo descargado.

### 10.3 Catálogo de errores (código → significado → impacto)

| Error | Qué significa | Impacto |
|---|---|---|
| `AMBIGUOUS_ENUMERATION_OPTION` | El valor coincide con más de una opción de la enumeración (o se usó etiqueta ≠ valor interno). | Registro importado, propiedad vacía. |
| `ASSOCIATION_LABEL_NOT_FOUND` | La etiqueta de asociación no existe. | Datos importados, asociación sin etiquetar. |
| `ASSOCIATION_LIMIT_EXCEEDED` | Se superó un límite de asociaciones configurado. | Datos importados, sin asociar. |
| `ASSOCIATION_RECORD_NOT_FOUND` | Faltan valores del identificador único para asociar (o el identificador tiene saltos de línea o >100 caracteres). | Datos importados, sin asociar. |
| `OWNER_NOT_FOUND` / `MULTIPLE_OWNERS_FOUND` | Propietario sin coincidencia o ambiguo. | Registro importado, propietario vacío. |
| `COULD_NOT_PARSE_DATE` / `NUMBER` / `TERM` / `ROW` | Valor con formato incorrecto para el tipo de propiedad. | Si la propiedad es obligatoria: fila no importada; si no: propiedad vacía. |
| `CREATE_ONLY_IMPORT` | Modo «solo crear» y la fila coincide con un registro existente. | Fila no importada. |
| `UPDATE_ONLY_IMPORT` | Modo «solo actualizar» y el identificador no existe en el CRM. | Fila no importada. |
| `DUPLICATE_ALTERNATE_ID` / `DUPLICATE_ASSOCIATION_ID` / `DUPLICATE_RECORD_ID` / `DUPLICATE_ROW_CONTENT` / `DUPLICATE_UNIQUE_PROPERTY_VALUE` | Identificadores o filas duplicadas. | Sin actualizar/asociar, o sin crear, según el caso. |
| `FAILED_TO_ASSOCIATE` / `ASSOCIATION_RECORD_NOT_FOUND_DUPLICATES` | Formato de asociación inválido o identificadores duplicados en multi-objeto. | Datos importados, sin asociar. |
| `EMPTY_PROPERTY_VALUES_OBJECT` | Fila con valores vacíos en múltiples columnas. | Fila no importada. |
| `INVALID_EMAIL` / `INVALID_DEAL_STAGE` / `INVALID_PIPELINE` | Email mal formado; etapa/pipeline/estado inexistente. | Fila no importada. |
| `FILE_NOT_FOUND` / `INVALID_FILE_TYPE` / `INVALID_SHEET_COUNT` / `INVALID_SPREADSHEET` | Problemas de archivo (no encontrado, tipo incorrecto, más de una hoja). | Nada importado. |
| `GDPR_BLACKLISTED_EMAIL` | Correo bloqueado por privacidad de datos. | Ese contacto no se importa. |
| `INCORRECT_COLUMN_COUNT` | Columna sin encabezado. | Esa columna no se importa. |
| `INVALID_ADDITIONAL_EMAIL` | Correo adicional inválido o ya usado en otro contacto. | Registro importado, correo adicional omitido. |
| `INVALID_ENUMERATION_OPTION` | Valor que no coincide con ninguna opción de la enumeración. | Registro importado, propiedad vacía. |
| `INVALID_RECORD_ID` / `UNKNOWN_BAD_REQUEST` | ID de registro sin coincidencia. | No se importa/actualiza. |
| `LIMIT_EXCEEDED` / `PORTAL_WIDE_CUSTOM_OBJECT_LIMIT_EXCEEDED` | Límite de registros del objeto alcanzado. | Nada importado. |
| `MISSING_REQUIRED_PROPERTY` | Falta valor de propiedad obligatoria. | Fila no importada. |
| `PROPERTY_VALIDATION_RULE_ERROR` | Incumple reglas de validación de la propiedad. | Registro importado, propiedad vacía. |
| `PROPERTY_DEFINITION_NOT_FOUND` | Encabezado sin propiedad correspondiente. | Esa columna no se importa. |
| `ROW_DATA_TOO_LARGE` | Celda o fila con más de 1 MB. | Fila no importada. |
| `TOO_MANY_ERRORS_IN_ROW` | Fila con más de 10 errores. | Según severidad. |
| `OUT_OF_VALID_DATE_RANGE` / `OUT_OF_VALID_TIME_RANGE` | Valor temporal fuera de rango (≥1 mes; <1000 años). | Propiedad vacía. |
| `MULTIPLE_COMPANIES_WITH_DOMAIN` | Dominio coincide con varias empresas. | Empresa no actualizada. |

---

## 11. Reglas de UX que debe replicar el producto

1. **Auto-mapeo** de encabezados a propiedades, con idioma de encabezados seleccionable y fallback a inglés.
2. **Creación de propiedades en línea** durante el mapeo si la propiedad no existe.
3. Indicador visual de identificador único correcto (icono de llave).
4. Archivo de ejemplo generable al inicio del proceso con las propiedades requeridas para los objetos elegidos.
5. Checkbox de **consentimiento** obligatorio antes de finalizar.
6. Página de revisión con **cronología de estado** y tiempo estimado de finalización.
7. Historial de importaciones con acceso a resúmenes anteriores.
8. Descarga de errores y de filas con errores (CSV en zip).
9. Corrección de errores **sin volver a subir el archivo** (edición en línea durante el mapeo).

---

## 12. Referencias (fuentes oficiales)

- HubSpot Knowledge Base (ES) — Formatear archivos de importación: https://knowledge.hubspot.com/es/import-and-export/set-up-your-import-file
- HubSpot Knowledge Base (ES) — Importar registros para varios objetos: https://knowledge.hubspot.com/es/import-and-export/import-objects
- HubSpot Knowledge Base (ES) — Importar contactos (importación rápida): https://knowledge.hubspot.com/es/import-and-export/import-contacts-quick-import
- HubSpot Knowledge Base (ES) — Solucionar errores de importación: https://knowledge.hubspot.com/es/import-and-export/troubleshoot-import-errors
- HubSpot Developers — CRM API | Imports: https://developers.hubspot.com/docs/api-reference/legacy/crm/imports/guide
