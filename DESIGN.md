# DESIGN.md — Sistema de diseño de Omni CRM

> **Fuente de verdad de la interfaz.** Fijado por el usuario el 22-nov-2026.
> Prohibido usar colores, tipografías, espaciados, radios o componentes que no
> estén definidos aquí. Si una tarea necesita algo nuevo, primero se agrega a
> este archivo (documentado, en la misma tarea) y luego se usa.
> Las pantallas se comparan contra las capturas reales de HubSpot en
> `docs/referencia-hubspot/` (1440px y 1280px).

## 1. Tokens (definidos en `src/app.css` `:root`)

### Tipografía
| Token | Valor | Uso |
|---|---|---|
| `--font-body` | "Lexend Deca", Helvetica, Arial, sans-serif | toda la app |
| `--fs-xs` | 12.8px | metadatos, etiquetas pequeñas |
| `--fs-sm` | 14px | texto base de tablas y formularios |
| `--fs-md` | 16px | títulos de tarjeta/sección |
| `--fs-lg` | 22px | títulos de página |

### Colores (tema claro / oscuro automático con `data-theme="dark"`)
| Token | Claro | Uso |
|---|---|---|
| `--c-white` | #ffffff | tarjetas, paneles, campos |
| `--c-text` | #333333 | texto principal |
| `--c-dark` | #1f1f1f | texto de énfasis |
| `--c-link` | #006162 | enlaces y acciones teal |
| `--c-muted` | #8a8a8a | texto secundario (clase `.muted`) |
| `--c-bg` | #f5f5f5 | fondo general |
| `--c-border` | #dfe3eb | bordes |
| `--c-nav` | #213343 | barra lateral |
| `--c-nav-hover` | #2d3e50 | hover del menú |
| `--c-primary` | #ff5c35 | botón primario (naranja Omni) |
| `--c-primary-dark` | #e04b27 | hover del primario |
| `--c-head` | #f5f8fa | encabezados de tabla |
| `--c-row-hover` | #f0f6f7 | hover de filas |
| `--c-tag-new` / `--c-tag-open` / `--c-tag-done` | #e5f5f8 / #fdf3e1 / #e5f8f6 | etiquetas de estado |
| `--c-soft` | #eaf0f6 | hover suave, paneles secundarios |
| `--c-soft-2` | #e6ebf0 | avatares neutros, píldoras |
| `--c-teal-soft` | #d6efec | selección activa |
| `--c-paper` | #fafbfc | previsualizaciones |
| `--c-warn` | #f5a623 | avisos |

**Regla:** nunca un color literal (`#xxx`, `rgb()`) en un componente; siempre el
token. El tema oscuro redefine los mismos tokens — un literal rompe el modo oscuro.

### Espaciado
`--sp-2` 2px · `--sp-4` 4px · `--sp-8` 8px · `--sp-10` 10px · `--sp-16` 16px · `--sp-20` 20px · `--sp-24` 24px · `--sp-32` 32px

### Radios
`--r-sm` 6px · `--r-md` 8px · `--r-pill` 9999px (píldoras)

### Estructura
`--nav-w` 72px (menú colapsado) · `--nav-w-open` 220px · `--topbar-h` 56px

## 2. Componentes base (clases existentes en `src/app.css`)

| Componente | Clases | Notas |
|---|---|---|
| Botón primario | `.btn.btn--primary` | acción principal de la pantalla |
| Botón secundario | `.btn.btn--secondary` | acciones de diálogo |
| Botón fantasma | `.btn.btn--ghost` (+`.btn--pillx`, `.btn--sm`) | acciones de tarjeta/tabla |
| Botón enlace | `.link-btn` | acciones terciarias («+ Agregar», «Ver todos») |
| Botón de icono | `.icon-btn` (+`.icon-btn--round`, `.icon-btn--sm`) | con `.ico` dentro |
| Tarjeta | `.card` (+`.card--assoc`) | contenedor con borde y radio `--r-md` |
| Tabla | `.table` (+`.table--zebra`, `.table--frozen`) | listas de registros |
| Panel lateral | `.drawer` / `.drawer__panel` | formularios y detalle que salen de la derecha |
| Modal | `.bmodal` / `.bmodal__panel` (+`.bmodal--top`) | diálogos centrados |
| Menú desplegable | `.menu` > `.menu__panel` > `.menu__item` | con `wireMenus()` de shell.js |
| Campo de formulario | `.field` (label > span + control) | etiqueta arriba, control abajo |
| Buscador | `.search` (+`.search--sm`) con `.ico--search` | inputs de búsqueda |
| Píldora | `.pill` (+`.pill--xs`, `.is-set`) | filtros y selectores compactos |
| Chip de filtro | `.qchip` | chips de filtro de las listas |
| Etiqueta | `.tag` (+`.tag--done`, `.tag--open`, `.tag--none`) | estados |
| Avatar | `.avatar` (+`.avatar--xs`) | iniciales con color por nombre |
| Tooltip | `.tip` > `.tip__text` | solo texto breve |
| Texto secundario | `.muted` | color `--c-muted` |
| Vacío | `emptyStateHtml()` de `src/empty-state.js` | estados sin datos, con ilustración |

## 3. Reglas de uso

1. **Etiquetas nunca se apilan**: en filas etiqueta-valor, la etiqueta no se
   rompe por carácter; si falta espacio, el valor envuelve o baja de línea.
   Cuidado con `overflow-wrap: anywhere` heredado en contenedores flex.
2. **Todo botón hace algo**: ningún botón o enlace muerto ni toast vacío.
3. **Anchos de prueba obligatorios**: toda pantalla se verifica a 1440px y
   1280px sin texto encimado, cortado ni apretado.
4. **Iconos**: sistema `.ico` con `currentColor` (heredan el tema solos).
5. **Tema oscuro**: cualquier componente nuevo se verifica en ambos temas.
