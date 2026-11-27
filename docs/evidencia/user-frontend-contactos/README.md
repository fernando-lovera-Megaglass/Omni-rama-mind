# Evidencia — user-frontend-contactos (27-nov-2026)

Pedido del usuario: aplicar al módulo Contactos (lista `/contacts/` y ficha `/contacts/record/`) la migración del
sistema homogeneizado de DESIGN.md §5 (aprobado 25-nov-2026), puntos 1–6, sin tocar lógica, backend ni otras
pantallas. No se integra a main sin aprobación.

## Cómo se limitó al módulo Contactos

- La lista y la ficha comparten código con los demás objetos (`src/list.js`, `src/record.js`, clases de `app.css`).
  Para que **ninguna otra pantalla cambie**: el `<body>` de `contacts/index.html` lleva ahora `data-type="contacts"`
  (la ficha ya lo tenía) y **todas** las reglas CSS nuevas van bajo `body[data-type="contacts"]` (bloque final de
  `src/app.css`, «Contactos: sistema homogeneizado»). En el JS, el icono «edit» y el formato de teléfono se aplican
  solo cuando el objeto es `contacts` (`PEN` en `mountList` y en `record.js`); Empresas, Negocios, Tickets y Tareas
  siguen con el carácter ✎ y sus medidas de hoy hasta su propia tarea.
- Nada de lógica ni de backend cambió: solo marcado (qué icono se pinta), CSS y el formateo de teléfonos al mostrar.

## Qué cambió (medido con Playwright a 1440px; detalle en `inventario-medido.md`)

| Punto | Elemento | Antes | Después |
|---|---|---|---|
| 1 Botones 40/32 | «Ver registro» del pie de la vista previa (`.preview__foot .btn`) | 44px | **40px** |
| 1 | Resto de botones de la lista y la ficha (Acciones 40, Guardar vista 32, paginador 32, barra masiva 32, Acciones de ficha 32, «✦ Hacer una pregunta» 32) | ya 40/32 | sin cambio |
| 1 (excepción) | «Agregar contactos» `.btn--primary.btn--pillx` | píldora `--c-link` 40px | **sin cambio** (excepción aprobada) |
| 2 Botones de icono 40/32/22 | «Personalizar la tarjeta» de la tarjeta «Acerca de» (`.card__head--about .icon-btn--round`) | 34px (medía 31×34 por el `flex`) | **32×32** |
| 2 | Ver configuración y Mostrar/ocultar filtros 40 · «+», «Editar filtros rápidos», ⋮ y × de la vista previa, «Configurar» 32 · «Regenerar» 22 | ya 40/32/22 | sin cambio |
| 3 Iconos `.ico` 20/16/13, opacidad .85 | Engranaje de «Ver configuración» (`.icon-btn--ico .ico`) | 18px, opacidad 1 | **16px, .85** |
| 3 | Iconos del menú de columna (`.thmenu .menu__item .ico`) | 15px, .9 | **16px, .85** |
| 3 | Icono de pestaña de vista (`.views__tab .ico--grid`) | 16px, .8 | **16px, .85** |
| 3 | Icono de enlace externo (`.cell-link .ico--ext`, correos y webs de la tabla, la vista previa y la ficha) | 13px, opacidad 1 | **13px, .85** |
| 3 | Lupa, filtro, panel/tabla, engranaje de «Acerca de», iconos del menú Acciones | ya 16px, .85 | sin cambio |
| 4 ✎ → `edit` | «Editar filtros rápidos» (`.icon-btn--sm`) | carácter ✎ 15px | **icono 16px** |
| 4 | «Editar» de la barra masiva (`.bulk__btn`) | ✎ | **icono 16px** en `.bulk__ico` (como «Eliminar») |
| 4 | Lápiz de celda editable (`.cell__pen`, aparece al pasar el ratón) | ✎ 12px | **icono 13px** |
| 4 | Lápices de «Acerca de» de la vista previa (`.props__edit`) | ✎ 14px | **icono 13px** |
| 4 | Lápiz del nombre de la ficha (`h1 .pencil`) | ✎ 14px | **icono 16px** |
| 4 | Lápices de propiedades de la ficha y de «Todas las propiedades» (`.props__edit`) | ✎ 14px | **icono 13px** |
| 4 | «Editar nombre interno» del editor de tarjeta de asociación (`.pencil`) | ✎ | **icono 16px** |
| 5 Teléfonos | Columna de teléfono de la tabla, cabecera de la ficha, «Acerca de» de la vista previa y de la ficha | ya `displayPhone` | sin cambio |
| 5 | Tarjetas de asociación de la ficha (`kindValue`, p. ej. teléfono de la empresa asociada) y tabla de «Gestionar duplicados» | valor crudo | **`displayPhone`** |

Notas:
- El icono `edit` estaba aprobado y documentado en DESIGN.md §3 (lápiz con línea de base) pero **no existía en
  `src/action-icons.js`**: se añadió a `ACT_ICONS` con el trazo exacto de DESIGN.md (24×24, 1.8px, `currentColor`).
  Con él ya no queda ningún «✎» en la lista ni en la ficha de Contactos.
- Tamaños del icono `edit` según la escala de DESIGN.md §3: 16px dentro de botones (filtros rápidos, barra masiva,
  nombre de la ficha, editor de tarjeta) y 13px en línea (celdas y filas etiqueta–valor). Opacidad .85.
- Medidas: 40 / 32 / 22 / 20 / 16 / 13 px son las medidas de componente documentadas en DESIGN.md §2 y §5 (las mismas
  literales que usan las reglas base `.btn`, `.icon-btn`, `.ico`); colores, espaciados y radios solo por token. No se
  inventó ningún token.
- Archivos: `contacts/index.html`, `src/action-icons.js`, `src/list.js`, `src/record.js`, `src/app.css`,
  `tests/frontend-contactos.spec.js`. DESIGN.md no cambia (el icono ya estaba documentado; las inconsistencias de §4
  siguen siendo ciertas para los demás módulos).

## Capturas (1440 y 1280 px; `-recorte` es la zona)

| Pantalla / estado | Archivos |
|---|---|
| Lista completa (ventana) | `antes-/despues-lista-<ancho>.png` |
| Cabecera de la lista: título, Acciones, Agregar, barra de vistas, buscador, filtros, engranaje, «+» y «Editar filtros rápidos» | `antes-/despues-lista-cabecera-recorte-<ancho>.png` |
| Fila con el ratón encima (primera celda) | `antes-/despues-lista-celda-hover-recorte-<ancho>.png` |
| Barra masiva con 2 seleccionados («Editar» con el icono) | `antes-/despues-lista-masiva-recorte-<ancho>.png` |
| Panel de vista previa (lápiz de «Acerca de» al pasar el ratón, «Ver registro» a 40px) | `antes-/despues-lista-vista-previa-<ancho>.png` |
| Ficha completa (ventana) | `antes-/despues-ficha-<ancho>.png` |
| Cabecera de la ficha (nombre con el lápiz, teléfono, acciones rápidas) | `antes-/despues-ficha-cabecera-recorte-<ancho>.png` |
| Tarjeta «Acerca de» con una propiedad al pasar el ratón (engranaje 32px, lápiz) | `antes-/despues-ficha-acerca-hover-recorte-<ancho>.png` |
| Tarjeta de empresas asociadas (teléfono formateado) | `antes-/despues-ficha-asociaciones-recorte-1440.png` (a 1280 la columna derecha queda fuera de la ventana y no se pudo recortar) |
| Inventario medido antes → después | `inventario-medido.md` |

Sin texto encimado ni cortado a 1440 ni a 1280 en las zonas cambiadas (el correo largo de la cabecera de la ficha ya
se partía en dos líneas antes; no lo toca esta tarea). Único efecto colateral, dentro de Contactos: al pasar el
engranaje de «Acerca de» de 34 a 32px el título «Acerca de este objeto» gana 2px y reparte sus dos líneas de otra
forma («Acerca de este / objeto» en vez de «Acerca de / este objeto»); ya iba en dos líneas antes.

Diferencias contra las capturas base (Playwright): `contactos-lista` 40 píxeles (engranaje y lápiz de filtros
rápidos) y `contactos-ficha` 479 píxeles (lápiz del nombre, cabecera de «Acerca de» con el engranaje de 32px y el
reparto del título); nada más cambia en esas pantallas.

## Pruebas (`tests/frontend-contactos.spec.js`, modo demo, 1440 y 1280 px): **6 / 6 en verde**

1. Lista: `body[data-type="contacts"]`; ningún «✎» en la página; Acciones y Agregar contactos 40px y Agregar sigue
   `--c-link`; Ver configuración 40px con engranaje 16px/.85 y Ocultar filtros 40px; «Editar filtros rápidos» 32px con
   icono 16px/.85 y «+» 32px; `.ico--grid` de las vistas .85; `.ico--ext` 13px/.85; columna de teléfono con formato
   «+NN …»; lápiz de celda 13px, oculto en reposo y visible al pasar el ratón; menú de columna con iconos 16px/.85;
   barra masiva: «Editar» 32px con icono 16px y sigue abriendo la edición en lote (se cierra con Cancelar); vista
   previa: «Ver registro» 40px y enlaza a la ficha, lápiz 13px y abre el editor en línea.
2. Lista: «Editar filtros rápidos» sigue llevando a Ajustes › Objetos › Contactos › Índice.
3. Ficha: ningún «✎»; Acciones 32px; «Personalizar la tarjeta» 32×32 con engranaje 16px/.85 y sigue abriendo su
   editor (cierra con Cancelar); «Regenerar» 22px; lápiz del nombre 16px/.85 y sigue pidiendo el nuevo nombre; lápiz
   de propiedad 13px, visible al pasar el ratón, abre el editor en línea y Cancelar lo cierra; `.ico--ext` 13px/.85;
   teléfono de la cabecera y de la empresa asociada con el formato único.
Sin errores en consola (fixture). Los enlaces «#» que marca `deadLinks()` se anotan como en `pantallas.spec.js`
(ver «Qué falta»).

Suite completa (`contactos`, `pantallas`, `tipos-de-campo`, `selector-propietario`, `papelera`, `icono-papelera`,
`frontend-contactos`, 174 pruebas): **159 en verde y 15 en rojo en la corrida completa**; de las 15, nueve fueron
ruido de la corrida (otro carril editaba `src/` a la vez y el servidor de desarrollo recargaba en medio de la
prueba: funcionales de configuracion, fragmentos, workflows, contactos-ficha, tareas-ficha, administrar-vistas y
plantillas, y la visual de negocios-ficha) y **repetidas solas pasan todas** (`/tmp/pw-rerun.log`: 29 / 32, con solo
contactos-ficha ×2 y una visual de configuracion de 627 píxeles por antialiasing que, repetida sola, pasa 4 / 4).
Quedan en rojo únicamente las esperadas:
- **Bandeja ×2** (17 píxeles de la flecha de «Asignar a»), pendientes de aprobación desde la tarea del selector de
  propietario; esta tarea no toca Bandeja.
- **`contactos-lista` ×2 y `contactos-ficha` ×2**: son las pantallas que esta tarea cambia (engranaje 16px, lápices,
  icono de enlace .85, botón de 32). **No se regeneraron** (`--update-snapshots` prohibido): se actualizan cuando el
  usuario apruebe. Las 52 capturas base restantes (Empresas, Negocios, Tickets, Tareas, Informes, Datos, Ajustes,
  Workflows, Marketing, Bandeja, Diseño de registro, Vistas…) pasan: ninguna otra pantalla cambió.
`npm run build` en verde.

Nota operativa: el puerto 4173 lo ocupa el servidor de otro carril y `playwright.config.js` tiene
`reuseExistingServer`; las corridas se hicieron con una copia temporal de la configuración en el puerto 4199
(`-c _pw-tmp.config.js`, no versionada).

## Qué no se hizo y por qué (para decidir)

- **Otros caracteres usados como icono** en la lista y la ficha (⋮ ⋯ × ↻ ⧉ ↗ ⇅ ⇪ + → ‹ › ⌄ ⋮⋮ ⚙ ✦): la tarea pedía
  solo el ✎; DESIGN.md §3 regla 1 los prohíbe en general, pero cada uno necesita su icono aprobado en el catálogo.
- **Iconos de línea (SVG) a 18px**: acciones rápidas (`.quick__ico svg`, ficha y vista previa) y cronología
  (`.timeline__ico svg`). El punto 3 habla de los `.ico`; el componente `.quick` está documentado aparte en §2. Si se
  quiere, migran a 16px con una línea CSS en el mismo bloque.
- **Controles que no son `.btn` ni `.icon-btn`** y miden fuera de 40/32/22: `.views__add` «+» 40×44 y pestañas de
  vistas 44 (componente «Barra de vistas» documentado a 44px), números del paginador 28, «Añadir columna» 28,
  «×» de la barra masiva 26, «Opciones de columna» 24, «×» de pestaña 20, chips de filtro 36 (componente `.qchip`).
- **Puntos 5–8 de §5** (píldoras, campos, tablas, títulos) no estaban en los seis puntos pedidos: p. ej. los `select`
  de la ficha siguen a 28px/12.8px y el buscador de la lista es la píldora de 40.
- **Enlaces «#» preexistentes** que marca `deadLinks()`: barra lateral (Marcadores, Contenido, Comercio, Copilot,
  Marketplace → abren «En construcción», documentado en DESIGN.md §4 #15), «Todas las vistas» (abre el panel) y los
  **valores de las tarjetas de asociación de la ficha** (dominio, teléfono, importe, fechas, estado: `<a href="#">` sin
  manejador, preexistente). No se cambiaron: la tarea no lo pedía.
- Las tarjetas de asociación y la tabla de duplicados de **los demás objetos** siguen mostrando el teléfono crudo (el
  formato se aplicó solo en Contactos para no tocar otras pantallas); la misma línea sirve para ellos cuando se pida.
- Aprobar las capturas base de `contactos-lista`, `contactos-ficha` (esta tarea) y Bandeja (pendiente anterior).
