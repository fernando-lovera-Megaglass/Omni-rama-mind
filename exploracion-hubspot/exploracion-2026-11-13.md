# Exploración del HubSpot real (portal 5417939, Megaglass)

Exploración en vivo vía Chrome del usuario (13 nov 2026). Objetivo: documentar **comportamientos** (qué pasa al hacer clic, qué muestra cada pantalla), no datos. Capturas en `exploracion-hubspot/capturas/`.

## Patrón común de listas (contactos, empresas, tickets)

- Barra de vistas como pestañas reordenables ("Pulsa espacio para reordenar"), botón "+" / "Agregar vista".
- Botón primario verde "Agregar contactos/empresas/tickets" arriba a la derecha; menú "···" y título con cheurón.
- Barra de filtros: Buscar (atajo "/"), botón **Filtro**, **Ordenar por**, filtros rápidos como desplegables (Propietario, Fecha de creación, Última actividad, Estado del lead…), botón "+" para añadir más filtros rápidos, lápiz para editarlos, **Filtros avanzados**.
- Menú **Acciones** de la lista: Calidad de los datos, Editar propiedades, Restaurar contactos, Restaurar cambios del CRM, Corregir problemas de formato, Gestionar duplicados, Mostrar las novedades.
- Toggle **Vista de panel / Vista de tabla**, "Ver configuración", "Contraer título", "Desanclar la barra de herramientas".
- Tabla: checkbox de selección, filas expandibles (">"), avatar con iniciales de color, enlaces externos con icono, columna de asociaciones "Contacto → Empresas" que muestra "N registros" cuando hay varias (botón que expande).
- "Agregar columna" al final del encabezado + "Editar columnas".
- Pie: paginación Anterior/1..N/Siguiente, "50 por página", **total de registros abajo a la izquierda** ("39,238 contactos"), botones **Exportar** y **Clonar** (de la vista) abajo a la derecha.

## Ficha de contacto (record)

- Header: volver, avatar, nombre, puesto + empresa, correo con iconos de copiar/enlace; botones **Nota, Correo, Llamada, Tarea, Reunión, Más**.
- Columna izquierda: tarjeta **"Acerca de este objeto"** (propiedades) con su propio menú Acciones; campos vacíos muestran "--".
- Centro: pestañas **Información destacada | Descripción | Actividades | Información avanzada** + botón **Personalizar**.
- Cronología: sub-pestañas **Todas las actividades | Notas | Correos | Llamadas | Tareas | Reuniones**, buscador de actividades, filtro "Actividad", **Contraer todo**, entradas agrupadas por mes.
- Tipos de entrada en la cronología: Llamadas (expandibles, con resumen de IA: duración, resultado, transcripción), **Actividad de workflows**, **Pertenencia a segmento** ("Se agregó X a Contacts Eligible for Marketing Email").
- Columna derecha: **Resumen de registros** (IA, con fuentes y "Hacer una pregunta"), tarjeta **Seguimiento de etapa del lead** con pipeline visual de progreso (etapa actual "Conectado (Lead pipeline)", responsable, tipo de lead, checks de avance).

## Tablero de negocios (FUERZA DE VENTAS)

- Columnas por etapa con conteo en el encabezado: OFERTA A+W (256), Proyecto en Cotización (111), Proyecto Ganado (5), Evalua (10), Ganado (33,662), Perdido (0).
- Pie de cada columna: **Cantidad total** y **Cantidad ponderada** (total × probabilidad: "$527 M | $52.7 M (10%)").
- Tarjetas: nombre, Valor, Fecha de cierre, Propietario, Fecha de creación, etiqueta **"Importante"** con contador, avatares, **tiempo relativo** ("hace 9 meses", "hace una hora"), iconos de actividad pendiente al pie.
- Selector de pipeline arriba a la derecha; total "38,054 negocios" abajo.
- Aviso de respaldo: "Si estás experimentando problemas, haz clic arriba para acceder a la vista de lista".

## Tablero de tickets (Cotizaciones Acristala)

- Vistas del usuario: Todos tickets, Cotizaciones Acristala Pendientes/Terminadas, Cotizaciones Maru - Vendedor solicitante, Cotizaciones Kafer, Cotizaciones Maru Instalacion.
- Tarjetas muestran **"Abierto por un día"** (tiempo desde apertura) y Propietario del ticket.
- Filtros rápidos: Propietario del ticket, Fecha de creación, Última actividad, **Prioridad**.

## Tareas (objeto 0-27)

- Vistas: Todos tareas, Tareas Equipo Ventas Extranjero, Tareas pendientes Cristina.
- Botón **"Iniciar 9 tareas"** (cola de trabajo) — Omni ya lo tiene.
- Filtros rápidos: Asignado a, Tipo de tarea, Etapa de la tarea, Fecha de vencimiento, **Cola**, Borrar todo.
- Columnas: Título, Etapa (Sin iniciar…), Tarea → Contactos, Tarea → Empresas, Último contacto, Última interacción, Tipo, Fecha de vencimiento (CST), Tarea → Negocios.

## Segmentos (142 reales)

- Acciones: **Configuración de administración, Importación, Creación rápida, Crear segmento, Gestionar, Análisis**.
- Filtros: Todas las vistas, Carpetas, Todos los creadores, Todos los tipos, Todos los objetos, **Se usa en**, Filtros avanzados.
- Columnas: Nombre, Tamaño de la lista, Tipo (Estática/Dinámica), Objeto, Última actualización, Creador, Carpeta, **Se usa en (total)**; acciones por fila: Editar, Detalles, Más.

## Gaps de comportamiento nuevos que revela esta exploración

1. Menú Acciones de lista: Gestionar duplicados, Calidad de datos, Restaurar registros/cambios, Corregir formato, Editar propiedades en lote.
2. Ficha: pestañas Información destacada/Descripción/Información avanzada + Personalizar; entradas de workflow y pertenencia a segmento en la cronología; tarjeta de seguimiento de etapa del lead.
3. Tablero: etiqueta "Importante" con contador en tarjetas; indicadores de actividad pendiente; tiempo relativo.
4. Tickets: "Abierto por X tiempo" en tarjetas; filtro Prioridad.
5. Tareas: filtro por Cola; columnas de asociaciones múltiples.
6. Segmentos: Importación/Creación rápida/Gestionar/Análisis; columna "Se usa en".
7. Exportar/Clonar vista en el pie de cada lista.

---

# Exploración profunda — Contactos, Empresas, Negocios (13:05-13:20)

## Crear Contacto (panel lateral derecho deslizante, iframe object-builder)

- Se abre desde **Agregar contactos ▾ → Crear nuevo** (el botón tiene menú: Crear nuevo / Importar).
- Campos en orden: **Correo, Nombre *, Apellidos *, Cargo, Propietario del contacto** (dropdown, por defecto el usuario actual), **Estado o región, País/región, Número de teléfono, Número de móvil, Rol de compra** (dropdown).
- Botones: **Crear / Crear y agregar otro / Cancelar** — Crear y Crear-y-agregar-otro están DESHABILITADOS hasta llenar los obligatorios (*).
- Mensaje central: "Comienza por escribir el nombre del Contacto, su correo o ambos" → detección de duplicados mientras escribes.
- Enlace **"Editar este formulario"** (arriba a la derecha) para personalizar campos.

## Selección masiva en lista de Contactos

Al marcar el checkbox de una fila aparece barra superior:
**"N contacto(s) seleccionado(s)" | ✦ Enriquecer registros | ✦ Rellenar propiedades inteligentes | → Asignar | ✎ Editar | 🗑 Eliminar | ⊞ Revisa las asociaciones | + Crear tareas | ✉ Inscribir en secuencia | + Crear leads | Inscribir en agente | Más ▾**
Menú "Más": Agregar a segmento estático, Inscribir en workflow, Agregar al marcador automático, Agregar base jurídica para procesar datos, Editar suscripciones, Actualizar estado de confirmación doble.
También hay X para limpiar selección y checkbox de encabezado "Selecciona todos los registros".

## Filtros avanzados (panel derecho "Todos los filtros")

- Sección **Asociación**: "Filtrar por objeto asociado" + Agregar filtro (filtra contactos por su empresa/negocio asociado).
- Conector lógico **Y** entre grupos.
- Sección **Filtros avanzados**: Agregar filtro → popover con buscador "Buscar Propiedades de Contacto", filtros por tipo de campo y categoría, propiedades agrupadas (Información del pedido, Información del contacto...) con icono de tipo (Abc, fecha, #, checkbox, fx).
- Chips de filtro rápido sobre la tabla: Propietario del contacto ▾, Fecha de creación ▾, Última actividad ▾, Estado del lead ▾, + (agregar chip), sugerencias.

## Ficha de Empresa (record page)

- Header: logo/avatar, nombre, dominio (icono copiar), teléfono (icono copiar); acciones circulares: **Nota, Correo, Llamada, Tarea, Reunión, Más**; breadcrumb ← Empresas; Acciones ▾.
- Izquierda **"Información clave"** (con Acciones ▾ y engrane): Nombre, Dirección, Ciudad, Propietario, Etapa del ciclo de vida, Estado del lead, Sector, Tipo de Cliente, Último contacto, Cuenta objetivo, Productos de interes, **Negocios asociados (782) — campo calculado**, Mapsly. Enlace "Personalizar".
- Centro: pestañas **(Info destacada) / Información / Actividades / Ingresos / Información avanzada**. En Actividades: sub-tabs Notas, Correos, Llamadas, Tareas, Reuniones; filtros Fecha de actividad ▾ / Actividad asignada a ▾ / Equipo de HubSpot ▾ / Borrar todo; entradas tipo "Mensaje de WhatsApp registrado por X" y "creado a partir de Valor de configuración del CRM".
- Derecha: tarjetas de asociaciones **Contactos (89), Negocios (782), Tickets (7)** — cada una con + Agregar, engrane, buscar, Filtros, Ordenar; tarjetas individuales con avatar/datos y etiqueta **"Contacto con empresa principal"** / "Negocio con empresa principal"; en tarjetas de negocio la **Etapa es un dropdown editable inline**; "Ver todos los elementos asociados del tipo X".

## Crear Empresa (panel lateral)

- Campos: **Nombre de dominio de la empresa, Nombre de la empresa, Propietario, Estado o región, País/región, Número de teléfono, Sector**.
- Detección de duplicados: "Comienza por escribir un nombre de dominio, un nombre de cuenta o ambos".

## Tablero de Negocios (pipeline FUERZA DE VENTAS real)

- Selector de pipeline arriba a la derecha: **FUERZA DE VENTAS ▾**.
- Columnas reales: **OFERTA A+W (257) | Proyecto en Cotización por part... (111) | Proyecto Ganado por el cliente (…) | Evalua (10) | Ganado (33,662) | Perdido (2,800) | Eliminado (1,210)**.
- **Pie de cada columna: "$279 M | Cantidad total" y "$83.7 M (30%) | Cantidad ponderada"** (monto × probabilidad de etapa). Ganado = Ganados (100%), Perdido = Perdidos (0%).
- Tarjeta de negocio: título, Valor, Fecha de cierre, Propietario, Fecha de creación, etiqueta **"Importante" con número en círculo rojo** (40, 26...), avatares, **"hace 3 horas | ⚠"** (última actividad relativa + alerta), iconos inferiores (tarea, ✦, correo, nota).
- Vistas: Todos negocios, Instalación Región Sur, Cotizaciones Maru Suministro, Cotizaciones Maru Instalación, Los Negocios mas Importantes, Todos negocios-3.

## Crear Negocio (panel lateral)

- Campos: **Nombre del negocio, Pipeline (FUERZA DE VENTAS), Etapa del negocio (por defecto la primera: OFERTA A+W), Valor con Moneda (Mexican Peso MXN, prefijo MX$), Fecha de cierre, Propietario, Descripción de la oferta, Fecha de creación**.
- Sección **Asociar Negocio con Contactos**: Asociar registros, buscar, **Etiqueta de asociación (Sin etiqueta)**, checkbox "Agregar actividad de la cronología de este objeto (Contacto)", Agregar más.
- Sección **Empresas**: igual, etiqueta **Principal** por defecto.
- **Añadir elemento de pedido** (línea de producto con Cantidad).
- Crear / Crear y agregar otro / Cancelar.

## Gaps accionables para Omni (prioridad Contactos → Empresas → Negocios)

1. Formularios de creación como panel lateral derecho con campos ordenados como HubSpot, obligatorios que bloquean Crear, botón "Crear y agregar otro", detección de duplicados al escribir.
2. Barra de acciones masivas al seleccionar filas (Asignar, Editar, Eliminar, Crear tareas, Agregar a segmento...).
3. Panel "Todos los filtros" con filtros por asociación + conector Y + buscador de propiedades agrupadas por categoría con iconos de tipo.
4. Ficha de empresa: "Información clave" con campo calculado Negocios asociados; tarjetas de asociaciones con conteo, búsqueda, agregar y etiquetas de asociación; etapa de negocio editable inline en tarjeta asociada.
5. Tablero de negocios: pie de columna con Cantidad total y Cantidad ponderada (probabilidad), etiqueta Importante con contador, tiempo relativo de última actividad, alerta de actividad vencida.
6. Crear negocio con pipeline+etapa por defecto, moneda MXN, asociaciones con etiqueta (Principal) y línea de pedido.
7. Lista de empresas: vistas por segmento de negocio (Megaluminio, Kafer, Constructoras/Instaladores/Arquitectos Maru) — columnas Sector, Tipo de Cliente, Número de veces contactado.

---

# Correo de marketing (14 nov, 07:30)

## Lista "Administrar" (84 correos reales en Megaglass)

- Tabs: **Administrar / Plantillas / Analizar**.
- Estados: Todos / Borradores / Programado / Enviados / Archivados.
- Columnas: Nombre del correo, **Entregado, Tasa de apertura, Tasa de clics**, Última actualización (fecha + por quién), Fecha de publicación/envío.
- Acciones por fila: Editar, Clonar, Acciones. Toolbar: vistas, carpetas, tipo de correo, filtros, exportar correos, editar columnas.
- Ejemplos reales: "Felices Fiestas 2024" → 1,793 entregados, 15.5% apertura, 0.39% clics.

## Crear correo

1. Diálogo "Método de envío": **Normal** (lista de contactos, inmediato o programado) / **Automatizado** (para workflows) / **Blog** (automático con entradas nuevas).
2. Selector de plantillas: buscador, categorías (Guardadas, Comercio electrónico, Interacción, Evento, Saludo, Boletín informativo, Texto sin formato, Otra), "Aplicar el kit de marca", tarjetas con Vista previa / Usar plantilla, "Empezar de cero" o "Subir diseño".

## Editor drag-and-drop

- Panel izquierdo "Agregar": pestañas **Módulos / Secciones**. Módulos: Base (Texto, Botón, Redes sociales, HTML), Medios (Imagen, Video), Estructura (Divisor), Comercio (Carrito, Pagos).
- Lienzo con zonas "Soltar contenido aquí"; cabecera Enviar a / De / Asunto; pie automático con dirección fiscal + "Darme de baja / Gestionar preferencias".
- Barra: Volver, Archivo, Ayuda, Guardar (autosave), Vista previa y prueba, **Revisar y enviar**.
- Rail de herramientas: Agregar, contenido, diseño, envíos, versiones, pruebas, configuración.
