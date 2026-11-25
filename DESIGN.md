# DESIGN.md — Sistema de diseño de Omni CRM (tal como está hoy en `mind`)

> **Fuente de verdad de la interfaz** (reglas del 23-nov-2026, CLAUDE.md punto 4).
> Documenta los tokens y componentes que **ya usa** el diseño actual de Omni: nada
> aquí es una propuesta. Todo cambio de UI usa estos tokens; prohibido escribir
> valores sueltos de color, tamaño o espaciado. Si una tarea necesita un valor que
> no existe, primero se documenta aquí (en la misma tarea) y luego se usa.
> Los valores se leyeron de `src/app.css` y se midieron en el navegador en modo
> demo (Playwright, 1440 px y 1280 px, 24-nov-2026). Las capturas base de cada
> pantalla están en `tests/pantallas.spec.js-snapshots/` y
> `tests/contactos.spec.js-snapshots/`.

## 1. Tokens (definidos en `src/app.css` `:root`)

### Tipografía
| Token | Valor | Uso |
|---|---|---|
| `--font-body` | "Lexend Deca", Helvetica, Arial, sans-serif | toda la app (`body`) |
| `--fs-xs` | 12.8px | metadatos, etiquetas `.tag`, avatares, títulos de carpeta |
| `--fs-sm` | 14px | texto base (`body`), tablas, formularios, botones, píldoras |
| `--fs-md` | 16px | títulos de tarjeta/sección, cabeceras de panel y modal |
| `--fs-lg` | 22px | título de página (`h1`, `.page-title`) |

Base: `body` 14px / interlínea 20px, color `--c-text`. Pesos usados: 400 (texto),
500 (etiquetas `.tag`, algunos títulos), 600 (botones, enlaces, títulos, chips),
700 (títulos de hilo en Bandeja, algunos encabezados). Interlíneas fijas: 20px
(texto), 28px (`h1`/`.page-title`), 24px (`.tag`).

### Colores (tema claro; el tema oscuro redefine los mismos tokens con `data-theme="dark"`)
| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--c-white` | #ffffff | #1c242e | tarjetas, paneles, campos, botones secundarios |
| `--c-text` | #333333 | #e6ebf0 | texto principal |
| `--c-dark` | #1f1f1f | #f2f5f8 | texto de énfasis, fondo del toast |
| `--c-link` | #006162 | #5ac8ca | enlaces, `.link-btn`, botón fantasma, badges |
| `--c-muted` | #8a8a8a | #93a1b0 | texto secundario (`.muted`), iconos apagados |
| `--c-bg` | #f5f5f5 | #12181f | fondo general |
| `--c-border` | #dfe3eb | #313d4b | bordes de tarjetas, campos, tablas, menús |
| `--c-nav` | #213343 | #0f141b | barra lateral, cabecera de `.drawer`, borde de `.pill` y `.search--pill` |
| `--c-nav-hover` | #2d3e50 | #1c242e | hover del menú lateral |
| `--c-primary` | #ff5c35 | — | botón primario (naranja Omni), borde/texto del secundario |
| `--c-primary-dark` | #e04b27 | — | hover del primario |
| `--c-head` | #f5f8fa | #232d38 | encabezados de tabla, hover del botón fantasma |
| `--c-row-hover` | #f0f6f7 | #26313d | hover de filas |
| `--c-tag-new` / `--c-tag-open` / `--c-tag-done` | #e5f5f8 / #fdf3e1 / #e5f8f6 | #1d3a40 / #3a3320 / #17332f | etiquetas de estado, fila seleccionada, barra masiva |
| `--c-soft` | #eaf0f6 | #2a3542 | hover suave, paneles secundarios, pistas |
| `--c-soft-2` | #e6ebf0 | #2e3947 | avatares neutros, píldoras |
| `--c-teal-soft` | #d6efec | #1d3a40 | selección con hover |
| `--c-paper` | #fafbfc | #1f2833 | previsualizaciones casi blancas |
| `--c-warn` | #f5a623 | #f0b86a | ámbar de aviso |

**Regla:** nunca un color literal (`#xxx`, `rgb()`) en un componente; siempre el
token. El tema oscuro redefine los tokens: un literal rompe el modo oscuro.

### Espaciado
`--sp-2` 2px · `--sp-4` 4px · `--sp-8` 8px · `--sp-10` 10px · `--sp-16` 16px ·
`--sp-20` 20px · `--sp-24` 24px · `--sp-32` 32px. (No existe `--sp-12`: si se usa,
la propiedad se anula entera.)

### Radios
`--r-sm` 6px (botones, campos, menús, chips) · `--r-md` 8px (tarjetas, paneles,
modales) · `--r-pill` 9999px (píldoras, etiquetas, badges) · 50 % (avatares,
botones redondos).

### Sombras (valores literales que usa `app.css`; no hay token)
`0 8px 28px rgba(0,0,0,.16)` y `.18` (menús, menú de usuario) · `-8px 0 28px
rgba(0,0,0,.2)` (paneles laterales) · `0 16px 48px rgba(0,0,0,.3)` (modales) ·
`0 4px 12px rgba(0,0,0,.12)` y `0 2px 8px rgba(0,0,0,.08)` (tarjetas flotantes) ·
`0 8px 28px rgba(0,0,0,.28)` (toast) · `inset 0 0 0 1px var(--c-nav)` (píldora activa).

### Estructura
`--nav-w` 72px (barra lateral plegada) · `--nav-w-open` 220px (desplegada) ·
`--topbar-h` 56px (barra superior, relleno 0 24px) · `.content` relleno 24px 32px
32px · `.page-head` separación 16px, margen inferior 16px.

## 2. Componentes base: medidas reales

Alturas, rellenos y tamaños tal como se renderizan hoy (`src/app.css` + medición en
el navegador). Donde una pantalla usa un valor distinto, está en la sección 3.

| Componente | Clases | Alto | Relleno | Fuente | Radio | Colores / notas |
|---|---|---|---|---|---|---|
| Botón | `.btn` | 40px | 0 16px | 14px / 600 | `--r-sm` | borde 1px transparente; `inline-flex`, centrado, sin salto de línea |
| Botón pequeño | `.btn.btn--sm` | 32px | 0 10px | 14px / 600 | `--r-sm` | fichas de registro, tablas de marketing, bandeja |
| Botón píldora | `.btn.btn--pillx` | 40px | 0 20px | 14px / 600 | `--r-pill` | cabeceras de listas (Agregar contactos/empresas…), ancho 100 % cuando es `.btn--block` |
| Primario píldora | `.btn--primary.btn--pillx` | 40px | 0 20px | 14px / 600 | `--r-pill` | **variante oficial aprobada por el usuario (25-nov-2026)**: fondo `--c-link` (verde azulado), hover `#004d4e`; es el «Agregar contactos/empresas/negocios/tickets/tareas» de las listas |
| Botón píldora borde | `.btn.btn--pill` | 40px | 0 16px | 14px / 600 | `--r-pill` | fondo `--c-white`, texto y borde `--c-link`; es el «Acciones ▾» de las cabeceras de lista |
| Peligro | `.btn.btn--danger` | 40px | 0 16px | 14px / 600 | `--r-sm` | fondo `#d94c53`, texto `--c-white`; confirmaciones de borrado en modales |
| Primario | `.btn--primary` | — | — | — | — | fondo `--c-primary`, texto `--c-white`; hover `--c-primary-dark` |
| Secundario | `.btn--secondary` | — | — | — | — | fondo `--c-white`, texto y borde `--c-primary` |
| Fantasma | `.btn--ghost` | — | — | — | — | fondo `--c-white`, texto `--c-link`, borde `--c-border`; hover `--c-head` |
| Botón enlace | `.link-btn` | alto del texto (18px) | 0 | 14px / 600 | — | texto `--c-link`, sin borde ni fondo («+ Agregar», «Ver todos») |
| Botón de icono | `.icon-btn` | 32 × 32px | — | 18px | `--r-sm` | con `.ico` dentro, fondo transparente |
| Botón de icono redondo | `.icon-btn.icon-btn--round` | 40 × 40px | — | 16px | 50 % | barra de herramientas de listas (vista panel/tabla, engranaje, plegar) |
| Botón de icono pequeño | `.icon-btn.icon-btn--sm` | 32 × 32px | — | 15px | `--r-pill` (redondo) | «+» y «✎» de la fila de filtros, acciones de la ficha |
| Botón de icono xs | `.icon-btn.icon-btn--xs` | 22 × 22px | — | 14px | `--r-sm` | acciones discretas dentro de tarjetas (regenerar resumen, mover) |
| Botón de acción de ficha | `.quick` + `.quick__ico` | 56px de ancho | 4px 0 | 12.8px / 600 | — | columna: icono redondo de 36px con borde `--c-border` arriba y etiqueta `--c-link` abajo; Nota, Correo, Llamar, Tarea, Reunión, Más; iconos de línea 24×24 trazo 1.8px (`action-icons.js`) |
| Campo de formulario | `.field` (label > span + control); `.field input`, `.field select` | 40px | 0 10px | 14px | `--r-sm` | borde 1px `--c-border`, etiqueta arriba y control abajo; `textarea` 98px (importación) |
| Buscador | `.search` + `.search input` + `.ico--search` 16px | 32px | 0 10px | 14px | `--r-sm` | ancho 300px, borde `--c-border` |
| Buscador píldora (listas) | `.search.search--pill` | 40px | 0 16px | 14px | `--r-pill` | ancho 260px, borde `--c-nav` |
| Tabla | `.table`; `th` / `td` | th 44px · td 48px | 0 16px | 14px | — | ancho mínimo 1040px, cabecera `--c-head`, hover de fila `--c-row-hover`, fila seleccionada `--c-tag-new`; celdas de dos líneas crecen (60–65px) |
| Tabla compacta | `.table--compact` th / td | 36px | 0 16px | 14px | — | avatares de 24px dentro |
| Icono | `.ico` | 20 × 20px | — | — | 4px | `currentColor`; 20px en barra lateral y acciones, 16px en buscador, filtro, vista panel/tabla y barra superior |
| Píldora | `.pill` | 40px | 0 16px | 14px / 400 | `--r-pill` | borde 1px `--c-nav`; `.is-set` fondo `--c-teal-soft`; `.pill--xs` 36px y relleno 0 4px |
| Chip de filtro | `.qchip` | 36px | 0 8px | 14px / 600 | `--r-sm` | sin borde, hover `--c-head`, caret a la derecha |
| Etiqueta | `.tag` (+`--done`, `--open`, `--none`) | 24px | 0 10px | 12.8px / 500 | `--r-pill` | fondos `--c-tag-*` |
| Avatar | `.avatar` | 32 × 32px | — | 12.8px / 600 | 50 % | iniciales con color por nombre; `.avatar--xs` 24px (10px), `.avatar--sm` 24px, `.avatar--lg` 64px (20px); barra superior 28px |
| Badge | `.badge` | 18px (mín. 18px de ancho) | 0 5px | 11px | `--r-pill` | fondo `--c-link`, texto `--c-white` |
| Tarjeta | `.card` | — | 20px | 14px | `--r-md` | borde 1px `--c-border`; las tarjetas de ficha usan 16px 20px. **Es el mismo componente en toda la app**: misma cabecera (`.card__head` + `.card__title` 16px/600), mismo borde y radio donde aparezca |
| Tarjeta ancha | `.card.card--wide` | — | — | — | — | ocupa dos columnas de la cuadrícula de la ficha (`grid-column: span 2`); el usuario la agranda o reduce |
| Mover tarjeta | `.card__grip` | — | 2px 5px | 13px | `--r-sm` | «⋮⋮» en la esquina superior izquierda, visible al pasar el ratón; `draggable`, reordena las tarjetas de la ficha; la que se arrastra queda al 40 % de opacidad |
| Plegar tarjeta | `.card__toggle` + `.card.is-collapsed` | — | 2px 6px | 14px | `--r-sm` | pliega la tarjeta dejando solo la cabecera |
| Tarjeta de asociaciones | `.assoc-card` + `.assoc-card__head` + `.assoc__logo` 28px | — | — | 16px / 600 título | — | columna derecha de la ficha (Contactos, Empresas, Negocios…): título con conteo, «+ Agregar» (`.link-btn`) y engranaje (`.icon-btn--sm`), filas con logo/avatar de 28px |
| Panel lateral | `.drawer` > `.drawer__panel` | 100 % | cabecera 16px 24px · pie 16px 24px | título 16px / 600 | — | ancho 420px, cabecera fondo `--c-nav` y texto `--c-white`, sombra `-8px 0 28px rgba(0,0,0,.2)` |
| Panel de creación | `.slideover` > `.slideover__panel` | 100 % | — | — | — | «Crear contacto / empresa / negocio / ticket» y filtros avanzados de workflows; cierre `.slideover__close` |
| Modal | `.bmodal` > `.bmodal__panel` | — | cabecera 16px 20px | título 16px | `--r-md` | ancho 480px, máx. `calc(100% - 32px)`, sombra `0 16px 48px rgba(0,0,0,.3)` |
| Menú desplegable | `.menu` > `.menu__panel` > `.menu__item` | ítem 42px (relleno 11px 20px) | panel 8px 0 | 15px | `--r-sm` | ancho 200–320px, borde `--c-border`; se abre con `wireMenus()` de `shell.js` |
| Tooltip | `.tip` > `.tip__text` | — | 10px 14px | 14px | `--r-sm` | solo texto breve |
| Toast | `.toast` | — | 12px 20px | 14px | `--r-sm` | fondo `--c-dark`, texto `--c-white` |
| Texto secundario | `.muted` | — | — | — | — | color `--c-muted` |
| Vacío | `emptyStateHtml()` de `src/empty-state.js` | — | — | — | — | estados sin datos, con ilustración |
| Título de página | `h1`, `.page-title` | 28px de línea | — | 22px / 600 | — | `h1` base pesa 500; `.page-title` 600 |
| Barra de vistas | `.views__tabs` > `.views__tabwrap` + `.views__tab` | 44px | 0 10px 0 16px | 14px / 600 | `--r-sm` superior | **componente único de todas las listas** (Contactos, Empresas, Negocios, Tickets, Tareas): pestaña activa fondo `--c-white` con borde `--c-border`, inactivas texto `--c-link`; `×` (`.views__close` 20px) solo al pasar el ratón; `+` (`.views__add` 40px, 22px) crea vista |
| Barra lateral | `.sidenav` > `.sidenav__item` | 72px de ancho | — | — | — | fondo `--c-nav`, iconos `.ico` 20px, 220px al desplegar (`.app--navwide`) |
| Barra superior | `.topbar` | 56px | 0 24px | — | — | buscador global, acciones de icono, avatar 28px |

### Iconos de línea (`src/action-icons.js`)

Todos los iconos de acción y de tipo de campo son SVG de 24×24 con `fill="none"`,
`stroke="currentColor"`, trazo 1.8px y extremos redondeados (`ico()`); se muestran
a la escala 20 / 16 / 13 del `.ico`. Los de tipo de campo (`FIELD_ICONS`, selector
«Tipo de campo» de Ajustes › Propiedades, 18px dentro de `.ksel__ico`) son:

| Tipo | Clave | Icono |
|---|---|---|
| Texto de una línea / varias líneas | `text` / `textarea` | «T» / líneas de párrafo |
| Número / Número (moneda) / Porcentaje / Puntuación | `number` / `currency` / `percent` / `score` | «#» / «$» en círculo / «%» / bandera (la misma de `priority`) |
| Selector de fecha / de fecha y hora | `date` / `datetime` | calendario / reloj |
| Selección desplegable / Casilla de verificación | `enum` / `bool` | lista con marcas / casilla marcada |
| Usuario | `user` | persona |
| Número de teléfono / Correo / URL | `phone` / `email` / `url` | auricular / sobre / eslabones |
| Archivo | `file` | hoja con esquina doblada (añadido 25-nov-2026) |
| Cálculo | `calculation` | calculadora: marco con línea y 6 puntos (añadido 25-nov-2026) |
| Acumulación | `rollup` | sigma Σ (añadido 25-nov-2026) |
| Sincronización de propiedades | `sync` | dos flechas en círculo (añadido 25-nov-2026) |
| Identificador / Etapa / Estado / Prioridad | `id` / `stage` / `status` / `priority` | tarjeta / barras / círculo con marca / bandera |

El icono «Vista previa» de las filas de lista (`ACT_ICONS.preview`, panel con línea)
va en `.preview-btn` (30×24, borde `--c-text`, `--r-sm`) a 16px, aparece al pasar
el ratón por la fila y lleva el tooltip estándar `.tip > .tip__text` («Vista
previa») debajo del icono; el clic abre el panel de vista previa de la lista.

### Alineación
- Botones, píldoras, chips y campos van centrados verticalmente con `inline-flex` /
  `flex` + `align-items: center`; los textos no saltan de línea (`white-space: nowrap`).
- Fila etiqueta–valor: etiqueta arriba (`.field` y `.props`), nunca apilada por carácter.
- Celdas de tabla: texto alineado a la izquierda, relleno horizontal 16px, iconos y
  avatares centrados en la fila.

## 3. Inconsistencias detectadas (24-nov-2026; el usuario elige cuál queda)

Variantes del mismo componente que hoy conviven con medidas distintas. **No se
unificaron**: se listan para decidir.

| # | Componente | Variante A | Variante B (y más) | Dónde |
|---|---|---|---|---|
| 1 | Botón primario / fantasma | 40px, relleno 0 16px, `--r-sm` (`.btn`) | 40px píldora 0 20px (`.btn--pillx`, cabeceras de listas) · 36px píldora (`.dint__card`, `.dint__monitor`, `.seg__searchrow`, `.hlpop__foot`) · 44px píldora (`.seg__actions`, `.sedit__actions`) · 32px (`.btn--sm`, fichas, Marketing › Correo, Bandeja) · 44px (`.preview__foot .btn`) · 40px con relleno 6px 12px y 12.8px (`Datos › Conectar una aplicación`) · 32px redondo 50 % con 18px (`+` de Bandeja) | Listas, Datos, Segmentos, fichas, Bandeja, Marketing, vista previa |
| 2 | Botón de icono | 32px `--r-sm` 18px (`.icon-btn`) | 40px redondo 16px (`.icon-btn--round`) · 32px redondo 15px (`.icon-btn--sm`) · 34px (`.card__head--about .icon-btn--round`, fichas) · 22px (`.icon-btn--xs`) · 16px (`.pmoves .icon-btn`) | Listas, fichas, Diseño de registro |
| 3 | Campos de texto / `select` | 40px (`.field input`, `.field select`, importación) | 48px y 16px (Configuración › Perfil, `.gphone`) · 44px (`.acc__search`, `.more-menu__search`) · 42px (`.pmenu__search`) · 38px (`.seg__crit`, `#seg-modal`, `#sedit-modal`) · 36px (`.sedit__addmember`, `.imp__map`, `.advc`, `.adv-row`, `.hier__search`) · 34px (`.sedit__ai-row`, `.cd-assoc__label`, `.cd-items`, `.seqan__chartctl`, `.wfl__filters`) · 32px (`.imp__newprop`, `.ctable__rate`, `.inbox__filters`, `.stable`, Informes) · 30px (`.ibs__table`) · 28px y 12.8px (`select` de las fichas) | Configuración, Segmentos, Importación, filtros avanzados, Bandeja, Informes, fichas |
| 4 | Buscador | 32px `--r-sm` ancho 300px (`.search`) | 40px píldora ancho 260px borde `--c-nav` (`.search--pill`, listas) · 44px píldora (Configuración) | Listas vs. resto |
| 5 | Filas de tabla | th 44px / td 48px (`.table`) | th 45px (listas, por el borde inferior) · th 40px (Datos › historial, `.dint__table`) · td 32px (`.dint__table`) · 36px (`.table--compact`, `.tpls__stattable`) · 40px (`.seqs__folder`) · 60–61px (Segmentos, `.seg__table`) · 71 / 105px (Plantillas, celdas de varias líneas) · 65px (Contactos con dos líneas) | Listas, Datos, Segmentos, Plantillas, Secuencias |
| 6 | Iconos `.ico` | 20px | 16px (`.search`, `.ico--filter`, `.ico--board`, `.ico--grid`, barra superior) · 13px (`.cell-link .ico--ext`) · 14px (`.ico--inline`) · 15px (`.thmenu`) · 18px (`.icon-btn--ico`) · 19px (`.callbox__ico`) | Toda la app |
| 7 | Píldoras `.pill` | 40px 0 16px | 32px (fichas) · 44px (Diseño de registro, Administrar vistas) · 36px 0 4px (`.pill--xs`) | Listas, fichas, Diseño de registro, Vistas |
| 8 | Avatares | 32px (`.avatar`) | `.avatar--sm` tiene dos reglas (28px y luego 24px; gana 24px) · `.avatar--xs` dos reglas de fuente (10px y 13px; gana 13px) · 28px (barra superior) · 84px (Configuración › Perfil) | Barra superior, listas, Configuración |
| 9 | Etiquetas `.tag` | 24px 12.8px | 22px y 12px (`.tag--beta` en Datos) · con relleno vertical 3px en las fichas (`.tag` dentro de `.props`) | Datos, fichas |
| 10 | Títulos `h1` | 22px / 600 (`.page-title`: Contactos, Informes, Bandeja, Llamadas, Plantillas…) | 22px / 500 (`h1` base) · 20px / 500 (Datos, Importar, Crear segmento) · 24px / 600 (Workflows) · 16px / 600 (editor y creación de workflow) · 24px / 500 en `h2` de Configuración | Datos, Segmentos, Workflows, Configuración |
| 11 | Títulos `h2` | 16px / 600 (tarjetas de Informes, Secuencias) | 22px (Diseño de registro, Crear workflow 700) · 18px / 500 (Datos, Importar, Crear segmento) · 17px / 700 (Bandeja) · 15px (Datos) · 12.8px (carpetas de Plantillas y Fragmentos) | Varias |
| 12 | Tamaños de letra sin token | tokens 12.8 / 14 / 16 / 22 | 15px (67 reglas: `.menu__item`, `.menu__title`, `.seg__tab`…) · 12px (34) · 13px (23) · 18px (28) · 20px (23) · 24px (9) · 17px (5) · 11px (15, badges) · 10px (12) · 28px (`.kpi__value`) · 26px · 9px | `src/app.css` |
| 13 | Colores sin token | 21 tokens de `:root` | 205 colores literales fuera de `:root`; los más repetidos: `#d94c53` (rojo de error/peligro, 25 reglas), `#fff` (18), `#cbd6e2` (16), `#0091ae` (azul, 13), `#e3e8ee` (12), `#f3f6f9` (10), `#ff7a59` (9), `#1f9a63` (verde de éxito, 9), `#6b7a8d` (9), `#7fd1de` (8), `#00a38d` (7), `#f2545b` (7), `#99acc2` (7). Faltan tokens de estado (error, éxito, info) | `src/app.css` |
| 14 | Rellenos sin token | `--sp-*` | `.menu__item` 11px 20px · `.tip__text` 10px 14px · `.toast` 12px 20px · `.badge` 0 5px · `.icon-btn` 1px 6px (relleno nativo del `button`) | Menús, tooltips, toast |
| 15 | Enlaces sin acción | — | Pantalla de acceso (`/`): el logotipo («Página principal»), «Solicitar demostración», «Política de privacidad», «Administrar las cookies» y «Política de cookies» son `href="#"` sin manejador («crear una cuenta» sí responde). Los `#` de la barra lateral (Marcadores, Contenido, Comercio, Copilot, Marketplace) y de la barra superior sí responden: abren el diálogo «En construcción». La flecha «‹» de las métricas de Negocios no hace nada al cargar (la pista ya está al principio) | Acceso, Negocios |
| 16 | Errores de consola al pulsar | — | Ficha de tarea (`/tasks/record/?id=1`): «Notas +», «Recordatorio +» y «Repetir +» lanzan `Cannot read properties of null (reading 'scrollIntoView')` (buscan una sección que no existe en la ficha). Lista de tareas: «Crear cola» es el envío del formulario de «Cola ▾» y solo funciona con ese panel abierto. Las pruebas los omiten (`skip`) y los dejan documentados | Tareas |

## 4. Sistema homogeneizado (aprobado por el usuario, 25-nov-2026)

Decisiones del usuario sobre las inconsistencias de la sección 3; son la
definición oficial y la meta de la migración por módulos:

1. **Botones: dos alturas** — 40px normal y 32px compacto (`.btn--sm`).
   Desaparecen el 30, 36 y 44 sueltos (migran a 40 o 32 según densidad).
2. **Color primario: naranja `--c-primary`** para toda acción primaria.
   **Excepción oficial aprobada**: el «Agregar …» de las listas
   (`.btn--primary.btn--pillx`) se **queda verde azulado `--c-link`**.
   Rojo `#d94c53` solo para peligro. `.btn--green` y el azul marino
   `#253342` se eliminan (migran a primario o secundario).
3. **Botones de icono: 40 redondo / 32 / 22**. El de 34 (fichas) migra a
   32; el de 18×16 (reordenar propiedades) migra a 22.
4. **Iconos `.ico`: escala 20 / 16 / 13** (grande / normal / en línea),
   opacidad .85 fija (1 solo en barra lateral). Los 19, 18, 15, 14 y 11
   migran al más cercano.
5. **Píldoras: 40 base / 32 compacta**. Los 44–48 de asistentes y envíos
   migran a 40 salvo aprobación puntual.
6. **Campos: 40 base / 32 compacto**. Configuración baja de 48 a 40; los
   select de ficha suben de 28 a 32 (y letra de 12.8 a 14).
7. **Tablas: cabecera 44 fija, fila 48 normal, 36 compacta** documentada.
   Sin alturas fijas mayores: el contenido de varias líneas crece desde 48.
8. **Títulos: h1 22px/600 en todas las pantallas**; h2 16px/600; el 24 de
   Workflows baja y el 20 de Datos sube.

## 5. Reglas de uso

1. **Etiquetas nunca se apilan**: en filas etiqueta-valor, la etiqueta no se
   rompe por carácter; si falta espacio, el valor envuelve o baja de línea.
   Cuidado con `overflow-wrap: anywhere` heredado en contenedores flex.
2. **Todo botón hace algo**: ningún botón o enlace muerto ni toast vacío
   (`tests/pantallas.spec.js` lo comprueba con clics reales en cada pantalla).
3. **Anchos de prueba obligatorios**: toda pantalla se verifica a 1440px y
   1280px sin texto encimado, cortado ni apretado.
4. **Iconos**: sistema `.ico` con `currentColor` (heredan el tema solos).
5. **Tema oscuro**: cualquier componente nuevo se verifica en ambos temas.
6. **Capturas base**: una por pantalla y ancho (`tests/pantallas.spec.js`,
   `tests/contactos.spec.js`). Solo se regeneran cuando el usuario aprueba un
   cambio; nunca con `--update-snapshots` por cuenta propia.
