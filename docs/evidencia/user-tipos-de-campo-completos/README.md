# Evidencia — user-tipos-de-campo-completos (25-nov-2026)

Dos cambios pedidos por el usuario. Tokens y escala de iconos de `DESIGN.md` (20 / 16 / 13; iconos de línea
24×24, trazo 1.8px, `currentColor`). No se tocó nada más.

## Parte A — Tipos de campo completos (Ajustes › Propiedades › Crear propiedad)

**Qué cambió**

- `src/settings.js`: `PROP_KINDS` pasa de 10 a **18 tipos**: se añaden `datetime` «Selector de fecha y hora»,
  `percent` «Porcentaje», `user` «Usuario», `score` «Puntuación», `file` «Archivo», `calculation` «Cálculo»,
  `rollup` «Acumulación» y `sync` «Sincronización de propiedades». El mapa `KINDS` de la tabla de propiedades
  conoce los nombres nuevos. Al guardar, cálculo / acumulación / sincronización quedan **solo lectura** y, igual que
  archivo, no pueden marcarse «obligatoria al crear» (no se piden en el formulario de creación).
- `src/action-icons.js` (`FIELD_ICONS`): iconos nuevos `file` (hoja con esquina doblada), `calculation`
  (calculadora), `rollup` (sigma Σ) y `sync` (dos flechas en círculo), mismo estilo que los demás; `score` usa la
  bandera de `priority`. Documentados en `DESIGN.md` › «Iconos de línea». El selector (`src/kind-select.js`) no
  cambió: toma las opciones del `<select>` y el icono de `FIELD_ICONS`.
- `src/record.js` (ficha): cada tipo tiene su control al editar y su formato al mostrar:
  - `datetime` → `input type="datetime-local"`; se muestra con fecha y hora (`formatDateTime`).
  - `percent` → número; se muestra «50 %». `score` → número.
  - `user` → selector de propietario (el mismo desplegable con avatares de `owner-select.js`); se muestra con avatar.
  - `file` → `input type="file"`: el archivo se sube como adjunto del registro (`attachments.js`) y la propiedad
    guarda su id; se muestra el nombre y abre el archivo. Sin Supabase (modo demo) avisa «Inicia sesión para subir
    archivos a este registro.» y no cambia nada.
  - `calculation` / `rollup` / `sync` → solo lectura; sin valor muestra «Se calcula automáticamente» (nunca un
    control vacío). La lógica de cálculo completa no entra en esta tarea.
- `src/list.js`, `src/filter-ops.js`: `score` cuenta como numérico (ancho de columna, orden, filtros); una
  propiedad de archivo se muestra por el nombre del adjunto; nombres de los tipos nuevos en el editor de columnas.
- `src/create-contact.js` (formularios «Crear …»): `percent` y `score` como número, `user` como selector de
  propietario; archivo y tipos calculados no se piden al crear.

**Antes / después** (capturas en esta carpeta, 1440 y 1280 px)

| Antes | Después |
|---|---|
| `antes-selector-tipos-<ancho>.png`: selector con 10 tipos | `despues-selector-tipos-<ancho>.png`: 18 tipos, cada uno con icono |
| `antes-ficha-<ancho>.png`: ficha sin propiedades nuevas | `despues-propiedades-creadas-<ancho>.png`: las 8 creadas en Ajustes · `despues-ficha-propiedades-nuevas-<ancho>.png`: panel «Todas las propiedades» con las 8 (3 de solo lectura con «Se calcula automáticamente») · `despues-ficha-control-fecha-hora-`, `-usuario-`, `-archivo-<ancho>.png`: cada control abierto |

## Parte B — Icono «Vista previa» en las filas (Contactos, Empresas, Negocios, Tickets)

**Qué cambió** (`src/list.js` + `src/app.css`; es el mismo componente de lista para las cuatro pantallas, y
también para Tareas)

- El botón de la fila (`.preview-btn`, 30×24, visible al pasar el ratón) deja el glifo de texto «▭» y muestra el
  icono de línea `ACT_ICONS.preview` a 16px.
- El tooltip pasa al componente estándar `.tip > .tip__text` («Vista previa», debajo del icono). El tooltip
  anterior (`.preview-btn__tip`) existía pero **nunca se veía**: lo recortaban la celda (`overflow: hidden`), el
  propio botón (una regla genérica `[data-preview] { overflow: auto; max-height: 500px; margin-bottom: 20px }`
  de la biblioteca de informes también le daba un margen inferior de 20px) y, con la primera columna fija, la fila
  siguiente se pintaba encima. Se corrige con tres reglas acotadas: `td.table__first { overflow: visible }`,
  `button.preview-btn { overflow: visible; margin: 0; max-height: none }` y la celda fija de la fila en hover un
  nivel por encima (`z-index: 5`). Las reglas antiguas del tooltip propio se retiran.
- El clic sigue abriendo el panel de vista previa existente (`#preview`, con sus tarjetas `.pvcard`).

**Antes / después**: `antes-fila-vista-previa-<ancho>.png` (glifo «▭», sin tooltip visible) vs
`despues-fila-vista-previa-<ancho>.png` (icono + tooltip «Vista previa»); `antes-/despues-lista-hover-<ancho>.png`
(pantalla completa con la fila en hover).

## Pruebas (`tests/tipos-de-campo.spec.js`, modo demo, 1440 y 1280 px)

1. «el selector muestra los 18 tipos, cada uno con su icono»: 18 ítems en el orden de `PROP_KINDS`, un `svg`
   visible de ≥16px en cada uno, etiquetas de los 8 nuevos, y el elegido se ve con icono en el botón.
2. «una propiedad de cada tipo nuevo se crea, se guarda y se ve en la ficha con su control»: crea las 8 desde
   Ajustes (se buscan en la tabla por nombre), abre la ficha de Ana Ruiz › «Ver todas las propiedades» y verifica:
   fecha y hora (`datetime-local`, guarda «25 nov 2026 10:30»), porcentaje («50 %»), puntuación («7»), usuario
   (selector de propietario, guarda «Sofía R.»), archivo (`input type="file"`; en demo avisa que hace falta iniciar
   sesión y deja «--»), cálculo / acumulación / sincronización («Se calcula automáticamente», sin botón de editar).
3. Vista previa en Contactos, Empresas, Negocios y Tickets: botón a opacidad 0, 1 al pasar el ratón por la fila,
   `svg` visible, tooltip «Vista previa» visible y **no tapado** (`elementFromPoint` en su centro devuelve el
   tooltip), clic abre `#preview.is-open` con el nombre del registro.

Resultado: **12 / 12 en verde** (6 pruebas × 2 anchos). Suite completa (`contactos`, `pantallas`, `tipos-de-campo`):
**132 / 132 en verde**: ninguna captura base de las 30 pantallas cambió (el botón de vista previa es invisible
en reposo y la sección de Propiedades no está en la captura base de Configuración). Sin errores en consola
(fixture). `npm run build` en verde. Sin `--update-snapshots`.

Nota operativa: el puerto 4173 lo ocupa el servidor de desarrollo de otro carril y `playwright.config.js` tiene
`reuseExistingServer`; las corridas se hicieron con una copia temporal de la configuración en el puerto 4199
(`-c _pw-tmp.config.js`, no versionada).

## Qué falta / para decidir

- Cálculo, acumulación y sincronización se crean y se muestran de solo lectura con texto explicativo; la lógica de
  cálculo (fórmula, agregación desde registros asociados, origen de sincronización) no entra en esta tarea.
- El adjunto de una propiedad de archivo necesita Supabase Storage (migración `supabase/attachments.sql`); en modo
  demo el control existe y avisa.
- El margen y el recorte que escondían el tooltip venían de la regla genérica `[data-preview]` de la biblioteca de
  informes; se neutralizó solo para el botón de fila, no se tocó esa regla.
