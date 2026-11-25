# Evidencia — user-selector-propietario-ligero (25-nov-2026)

Cambio de UI pedido y aprobado por el usuario: el selector de propietario (`.osel`, `src/owner-select.js` +
`src/app.css`) deja de ser una caja de 40px con borde y pasa a ser un menú ligero. La página comparativa
`design-preview.html` citada en la tarea no está en el repositorio ni en el equipo (se buscó en el árbol de
trabajo y con Spotlight); se construyó con la especificación escrita de la tarea, punto por punto.

## Qué cambió

**En reposo** (fichas de los 5 objetos, panel de vista previa): solo `.avatar--xs` de 24px + nombre en 600 +
`.ico--arrow-down` de 13px (`.osel__arrow`), sin caja ni borde, 32px de alto, alineado donde estaba el campo
(el botón sobresale 8px a la izquierda para que el avatar quede en la columna del texto). Al pasar el ratón,
fondo `--c-head` con radio `--r-sm` (como `.qchip`); cursor pointer; sigue siendo un `<button>` real con
`aria-haspopup="listbox"` / `aria-expanded` y foco visible (`outline` 2px `--c-link`).

**El menú** (`.osel__panel`): anclado al botón (`top: calc(100% + 4px)`, alineado a su borde izquierdo),
ancho mínimo 240px (antes 280), radio `--r-md` 8px, borde `--c-border`, sombra `0 8px 28px rgba(0,0,0,.16)`.
Opciones (`.osel__opt`) de 36px de alto con relleno horizontal 12px (`calc(var(--sp-8) + var(--sp-4))`),
texto 14px y el avatar de cada persona a la izquierda: todas las caras a la vista. «Sin asignar» va primero
con el avatar neutro `--c-head`, y una sola vez (cuando el `<select>` trae «--» y «Sin asignar», que significan
lo mismo, se muestra una entrada). La elegida: fondo `--c-tag-new`, 600 y ✓ `--c-link` a la derecha. Hover
`--c-row-hover`.

**Buscador**: solo con más de 8 personas; con 8 o menos no se dibuja y el foco va a la persona elegida (o la
primera), con flechas ↑/↓ entre opciones y ↑ en la primera vuelve al botón.

**Contrato intacto**: el `<select>` nativo oculto (`.osel__native`) sigue siendo la fuente de verdad; elegir
fija su valor y dispara `input` + `change`; `FormData`, `form.elements`, los formularios y las pruebas siguen
igual. No cambió ningún sitio de uso: fichas (`record.js`), panel de vista previa y editor de celda y «Asignar»
de las listas (`list.js`), formularios «Crear contacto / empresa / negocio / ticket», Bandeja, inscripción en
secuencias, editor de workflows y el campo tipo «Usuario» nuevo.

**Variante con borde**: donde el contexto es un campo de formulario (`.field .osel__btn`: Crear…, Asignar,
Bandeja › Asignar a, workflows; `.osel--sm`: editor de celda de las listas) se conserva la caja de 40px a todo
el ancho con borde `--c-border` (`--c-link` abierto) y peso 400; el menú es el mismo nuevo (240px, 36px, ✓).

**DESIGN.md**: fila «Selector de propietario» en «Componentes base» con el trigger ligero, el menú de 240px,
las opciones de 36px, la regla del buscador (>8) y la variante con borde. Nota en «Espaciado»: `--sp-12` no se
define (ver «Qué no se hizo»).

## Capturas (antes / después, 1440 y 1280 px; `*-recorte` es la zona ampliada)

| Dónde | Antes | Después |
|---|---|---|
| Ficha de contacto, campo en edición (reposo) | `antes-ficha-contacto-reposo-<ancho>(-recorte).png` | `despues-ficha-contacto-reposo-<ancho>(-recorte).png` |
| Ficha de contacto, menú abierto | `antes-ficha-contacto-menu-…` | `despues-ficha-contacto-menu-…` |
| Ficha de empresa, menú abierto | `antes-ficha-empresa-menu-…` | `despues-ficha-empresa-menu-…` |
| Lista de contactos › «Asignar» (campo con borde) | `antes-lista-asignar-menu-…` | `despues-lista-asignar-menu-…` |
| Lista de contactos › editor de celda del propietario | `antes-lista-celda-menu-…` | `despues-lista-celda-menu-…` |
| «Crear contacto» (campo con borde) | `antes-crear-contacto-menu-…` | `despues-crear-contacto-menu-…` |

## Pruebas (`tests/selector-propietario.spec.js`, modo demo, 1440 y 1280 px): **8 / 8 en verde**

1. Ficha de contacto: botón real sin borde ni fondo, 32px, avatar 24px, nombre 600, flecha 13×13, hover
   `--c-head` con radio 6px; menú a 4px bajo el botón y alineado a su izquierda, ≥240px, radio 8px; una opción
   por persona con avatar visible y 36px, «Sin asignar» primero con avatar neutro, la elegida con `--c-tag-new`,
   600 y ✓, sin buscador (5 personas); elegir «Sofía R.» cambia el `<select>`, Guardar lo deja en la ficha y
   sobrevive a recargar la página.
2. Ficha de empresa: mismas comprobaciones del menú; Escape lo cierra; clic fuera lo cierra.
3. Lista de contactos: «Asignar» (campo con borde de 40px) y el editor de celda abren el mismo menú; elegir
   cambia el `<select>`.
4. Regla del buscador: un `<select>` de 8 opciones no lo muestra; uno de 10 sí (`enhanceOwnerSelects` sobre
   selects creados en la página).

Suite completa (`contactos`, `pantallas`, `tipos-de-campo`, `selector-propietario`): **138 / 140**. Las dos
que no pasan son las visuales de **Bandeja** (1440 y 1280): su campo «Asignar a» muestra el selector en reposo
en la captura base, y ahora lleva la flecha `ico--arrow-down` en vez del caret (17 píxeles de diferencia; ver
`bandeja-base-<ancho>.png`, `bandeja-actual-<ancho>.png` y `bandeja-diff-<ancho>.png`). Es el cambio pedido
visto en esa pantalla: **capturas base de Bandeja pendientes de aprobación del usuario**; no se regeneraron
(`--update-snapshots` prohibido). Las otras 28 pantallas no cambiaron. Sin errores en consola (fixture).
`npm run build` en verde.

Nota operativa: el puerto 4173 lo ocupa el servidor de desarrollo de otro carril y `playwright.config.js`
tiene `reuseExistingServer`; las corridas se hicieron con una copia temporal de la configuración en el puerto
4199 (`-c _pw-tmp.config.js`, no versionada).

## Qué no se hizo y por qué

- **`--sp-12` no se añadió como token.** La tarea pide opciones con relleno «8px 12px»; 12px no es token.
  Al probar a definir `--sp-12` cambiaron Informes, Negocios, Bandeja, Configuración y Administrar vistas: unas
  80 reglas de `app.css` ya lo usan y hoy no aplican porque el token no existe. Definirlo rompería «ninguna otra
  pantalla cambió», así que el 12px se escribe `calc(var(--sp-8) + var(--sp-4))` y la decisión sobre el token
  queda para el usuario (anotado en DESIGN.md).
- **Relleno vertical 8px → 0.** Con el avatar de 24px, 8px arriba y abajo dan 40px, no los 36px pedidos; se
  respeta la altura de 36px centrando el contenido.
- En la ficha, Escape cierra el menú y también el editor en línea (comportamiento previo de la ficha, no de
  este componente).
