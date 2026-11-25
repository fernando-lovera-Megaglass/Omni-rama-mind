# Comparativa de homogeneización — Omni CRM (24-nov-2026, para revisión del usuario)

Estado **actual** medido en el código y en el navegador; estado **propuesto** pendiente
de aprobación. Cuando el usuario apruebe, esta tabla se convierte en la definición
oficial de DESIGN.md y se crean las tareas de migración.

## Sistema propuesto (resumen)

| Elemento | Hoy | Propuesta |
|---|---|---|
| Botón normal | 5 alturas (30–44 px) | **40 px** |
| Botón compacto | mezclado con variantes | **32 px** (`.btn--sm`) |
| Color primario | 5 colores | **naranja `--c-primary`** único; verde azulado solo enlaces; rojo solo peligro |
| Botón de icono | 22 / 32 / 34 / 40 / 18×16 | **40 redondo / 32 / 22** |
| Icono `.ico` | 8 tamaños (13–20) | **20 / 16 / 13** (grande / normal / en línea) |
| Píldoras | 6 alturas (32–48) | **40 base / 32 compacta** (44–48 solo asistentes, si se aprueba) |
| Campos | 9 alturas (28–48) | **40 base / 32 compacto** |
| Filas de tabla | 7 alturas (32–105) | **cabecera 44 / fila 48**; compacta 36 documentada |
| Títulos h1 | 5 variantes (16–24) | **22 / 600** en todas las pantallas |

## Por módulo

### 1. Listas: Contactos, Empresas, Negocios, Tickets, Tareas

| Elemento | Hoy | Propuesta | Cambia |
|---|---|---|---|
| «Agregar …» (`.btn--primary.btn--pillx`) | 40 px píldora, **verde azulado** | 40 px píldora, **naranja** | color |
| «Acciones ▾» (`.btn--pill`) | 40 px blanco borde verde | igual | no |
| Barra de vistas | pestañas 44 px | igual | no |
| Botones de herramientas (vista panel/tabla, engranaje, plegar) | redondos **40 px**, glifo 16 | igual (entra en la escala 40 redondo) | no |
| Icono de menú de columna (`.thmenu`) | **15 px**, opacidad .9 | **16 px**, opacidad .85 | tamaño |
| Icono de enlace externo en celda | **13 px** | 13 px (queda como tamaño «en línea») | no |
| Filas de tabla | th 44–45 / td 48 | th 44 / td 48 fijos | casi no |
| Buscador píldora | 40 px | igual | no |
| Píldoras de vista | 40 px | igual | no |

### 2. Fichas de registro (Contacto, Empresa, Negocio, Ticket, Tarea)

| Elemento | Hoy | Propuesta | Cambia |
|---|---|---|---|
| Botones de acción | `.btn--sm` **32 px** | 32 px | no |
| Acciones rápidas (`.quick`: Nota, Correo…) | icono redondo 36 px | igual (uniforme ya) | no |
| Botón de icono «Acerca de» | redondo **34 px** | **32 px** | tamaño |
| Botón de icono xs | 22 px | 22 px | no |
| Reordenar propiedades (`.pmoves`) | 18×16 px, glifo **11** | 22 px, glifo **13** | tamaño |
| Píldoras de la ficha | **32 px** | 32 px compacta | no |
| Select de propiedades | **28 px**, letra 12.8 | **32 px**, letra 14 | tamaño y letra |
| Etiquetas en ficha | relleno vertical 3 px extra | 24 px estándar | relleno |
| Iconos de sección | 20 / 16 mezclados | 20 / 16 según escala | algunos |

### 3. Bandeja (Inbox)

| Elemento | Hoy | Propuesta | Cambia |
|---|---|---|---|
| Botón «+» redondo | 32 px redondo | 32 px | no |
| Botones de acción | `.btn--sm` 32 | 32 | no |
| Tabla interna (`.ibs__table`) | filas **30 px** | **36 px** (compacta oficial) | alto |
| Filtros | campos 32 px | 32 compacto | no |
| Título h2 de hilo | **17 px / 700** | 16 px / 600 | letra |

### 4. Marketing (Correo, Plantillas, Fragmentos, Preferencias)

| Elemento | Hoy | Propuesta | Cambia |
|---|---|---|---|
| Botones de tablas | `.btn--sm` 32 | 32 | no |
| Vista previa: botón | **44 px azul marino `#253342`** | 40 px **naranja** | alto y color |
| Editor de plantillas: barra | botones **30 px** | **32 px** | alto |
| Tabla de plantillas | filas **71–105 px** | contenido de varias líneas: crece desde 48; sin altura fija aparte | alto |
| Títulos de carpeta | 12.8 px | 12.8 (queda como `--fs-xs`) | no |

### 5. Segmentos

| Elemento | Hoy | Propuesta | Cambia |
|---|---|---|---|
| Botones de acciones | píldora **44 px** | **40 px** | alto |
| Buscador / botón buscar | píldora **36 px** | **40 px** | alto |
| Campos de criterio | **38 px** | **40 px** | alto |
| Agregar miembro | **36 px** | **32 px** compacto | alto |
| Píldora de filtros | 44 px | 40 px | alto |
| Filas de tabla | **60–61 px** | 48 px (avatar de 32) | alto |
| Título h1 «Crear segmento» | 20 px / 500 | 22 px / 600 | letra |

### 6. Datos (Gestión e Importar)

| Elemento | Hoy | Propuesta | Cambia |
|---|---|---|---|
| Botón «Conectar una aplicación» | 40 px, relleno 6 12, letra 12.8 | 40 px, relleno 0 16, letra 14 | relleno y letra |
| Tarjetas de integración | píldora **36 px** | **40 px** | alto |
| Historial: tabla | th 40 / td **32** | th 44 / td 48 (o compacta 36 si se prefiere denso) | alto |
| Mapeo de importación | campos **36 px**, nuevo campo **32** | 40 / 32 compacto | alto |
| Títulos h1/h2 | 20/500 y 18/500 y 15 | 22/600 y 16/600 | letra |

### 7. Workflows (Automatización)

| Elemento | Hoy | Propuesta | Cambia |
|---|---|---|---|
| Título lista de workflows | **24 px / 600** | **22 px / 600** | letra |
| Título editor / creación | **16 px / 600** (y h2 22 px / 700) | 22 / 600 en la pantalla; 16 / 600 solo dentro de tarjetas | letra |
| Filtros avanzados | campos **34–38 px** | 40 / 32 | alto |
| Iconos de pasos | svg sueltos 18–20 | 20 / 16 | algunos |

### 8. Informes

| Elemento | Hoy | Propuesta | Cambia |
|---|---|---|---|
| Botones y campos | **32 px** | 32 compacto | no |
| Valor de KPI | 28 px | queda como valor de datos (no es token de texto) | no |
| Iconos | 16 px | 16 | no |

### 9. Configuración

| Elemento | Hoy | Propuesta | Cambia |
|---|---|---|---|
| Campos de perfil | **48 px**, letra 16 | **40 px**, letra 14 | alto y letra |
| Buscador | píldora **44 px** | **40 px** | alto |
| Avatar de perfil | 84 px | queda (caso único documentado) | no |
| Título h2 | 24 px / 500 | 16–22 según jerarquía oficial | letra |

### 10. Secuencias

| Elemento | Hoy | Propuesta | Cambia |
|---|---|---|---|
| Carpeta en tabla | filas 40 px | 48 estándar o 36 compacta | alto |
| Controles de gráfica | 34 px | 32 compacto | alto |
| Botones | base 40 / sm 32 | igual | no |

### 11. Acceso (pantalla de entrada)

| Elemento | Hoy | Propuesta | Cambia |
|---|---|---|---|
| Enlaces muertos («Solicitar demostración», políticas, cookies) | `href="#"` sin acción | decidir: quitar o dar destino | funcional |
| Botones | base 40 | igual | no |

## Reglas que quedarían escritas en DESIGN.md tras tu aprobación

1. Botón: **40 px** base y **32 px** compacto. Ninguna otra altura sin token nuevo.
2. Primario: **naranja** en toda la app; verde azulado solo enlaces/texto; rojo solo peligro.
3. Botón de icono: **40 redondo / 32 / 22**. Glifos 16 / 16 / 13.
4. Iconos: escala **20 / 16 / 13**, opacidad .85 (1 solo en barra lateral).
5. Píldoras: **40 / 32** (44–48 solo asistentes, si lo apruebas).
6. Campos: **40 / 32**; select de ficha pasa a 32.
7. Tablas: **cabecera 44, fila 48**; compacta 36 documentada; nada de alturas fijas mayores (el contenido crece desde 48).
8. Títulos: h1 **22/600** en todas las pantallas; h2 **16/600**; excepciones solo por token nuevo aprobado.

*Pendiente de tu revisión: aprueba o ajusta cada línea y mañana mismo queda como
definición oficial; la migración se agenda por módulos con capturas antes/después.*
