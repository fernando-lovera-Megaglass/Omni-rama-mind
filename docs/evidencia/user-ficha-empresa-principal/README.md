# Evidencia — user-ficha-empresa-principal (27-nov-2026)

Reporte del usuario (27-nov, con captura): (1) en la ficha, con dos o más registros asociados no se ve cuál es el
principal; (2) en la lista de Contactos la celda de Empresa apila un botón «N registros» que hace la fila el doble
de alta. Pedido: principal primero y con la etiqueta «Principal» (`.tag.tag--done`) siempre visible, estilo HubSpot,
en todos los módulos con multi-asociación; celda de Empresa en una sola línea y todas las filas a 48px
(DESIGN.md §5 punto 7). Solo presentación; sin tocar lógica de asociación, backend ni `app.css`.

Nota de contexto: el commit `cb21008` («Claude: user-ficha-empresa-principal», 15:09) y el estado `review` de la
cola se hicieron por el orquestador antes de que existiera código (la sesión que construía se había reiniciado);
esta carpeta y este README son el trabajo real, hecho después.

## Qué cambió

### 1) Ficha: tarjeta de asociaciones (`src/record.js`, `assocCard()`), todos los módulos

- **Quién es el principal**: la fila con etiqueta guardada «Principal» (`assoc_labels_*`) si existe; si no, la
  primera fila implícita (p. ej. la empresa del campo «Empresa principal» del contacto). Es el criterio pedido; antes
  la primera fila recibía «Principal» por defecto aunque otra tuviera la etiqueta guardada.
- **Orden**: el principal va **siempre primero**, sea cual sea el orden configurado en la tarjeta («Ordenar» por
  fecha, nombre…). Antes se ordenaba como las demás y podía quedar segundo o tercero.
- **Etiqueta**: `<span class="tag tag--done assoc-card__label">Principal</span>` **siempre visible**, con el texto
  «Principal». Antes solo aparecía si la tarjeta tenía activada la opción «quick» y decía «Empresa con contacto
  principal» / «Contacto con empresa principal».
- **Las demás filas**: sin la etiqueta «Principal». La etiqueta de relleno «Sin etiqueta» (gris) ya no se pinta; las
  etiquetas reales guardadas (p. ej. «Facturación») siguen mostrándose como hasta ahora (solo con «quick» activo).
- Aplica a las tarjetas de Empresas, Contactos, Negocios y Tickets de todas las fichas (contactos, empresas, negocios,
  tickets, tareas). La tarjeta de **Tareas** no cambia: no existe «tarea principal» y conserva su comportamiento.
- Sin tocar la lógica: `assocRows()`, las etiquetas guardadas, el editor de etiquetas y el filtro «Solo principal»
  siguen igual (usan la misma `assocLabel`).

### 2) Lista de Contactos: celda «Contacto → Empresas» (`src/contacts.js`)

- La celda muestra **solo la empresa principal**, avatar + nombre enlazado, en **una línea**.
- Se quita el botón apilado «N registros» y su globo `.assoc-pop` (manejador de clic y Escape, ~26 líneas), que ya
  no tiene disparador. No se añadió contador en línea: en duda, no ponerlo (así lo pidió el usuario); las demás
  empresas se consultan en la tarjeta de la ficha.
- Resultado medido (`alturas-filas.txt`, Playwright, primeras 10 filas, id:px):
  - antes: `55:65` y `325:65` (contactos con dos empresas), resto 48.
  - después: **todas 48**, a 1440 y a 1280.
- El texto de exportación/CSV de la columna (`text`) sigue diciendo «Empresa (N registros)»: no es visual y no se
  pidió cambiarlo.

`app.css` no se tocó (las clases `.tag`, `.tag--done` y `.assoc-card__label` ya existían). DESIGN.md no cambia.

## Capturas (1440 y 1280)

| Pantalla | Antes | Después |
|---|---|---|
| Ficha del contacto 55 (Alicia Prieto, dos empresas), ventana completa | `antes-ficha-contacto-55-<ancho>.png` | `despues-ficha-contacto-55-<ancho>.png` |
| Recorte de la tarjeta «Empresas (2)» de esa ficha | `antes-ficha-contacto-55-tarjeta-empresas-recorte-<ancho>.png` | `despues-…` |
| Recorte de la tarjeta «Contactos» de la empresa 1 (varios contactos) | `antes-ficha-empresa-1-tarjeta-contactos-recorte-<ancho>.png` | `despues-…` |
| Lista de Contactos, ventana completa | `antes-lista-contactos-<ancho>.png` | `despues-lista-contactos-<ancho>.png` |
| Recorte de la fila de Alicia Prieto con sus dos vecinas | `antes-lista-contactos-fila-55-recorte-<ancho>.png` | `despues-…` |

A 1280px la ficha pliega sola la columna derecha (`record.js`, `NARROW_QUERY` ≤1439px): para la captura y la
prueba se expande con el botón «Expandir columna derecha»; no es un cambio de esta tarea.

## Pruebas

- `tests/empresa-principal.spec.js` (nueva, permanente; modo demo; 1440 y 1280): **8 / 8 en verde**.
  1. Contacto 55: la tarjeta de Empresas tiene ≥2 filas; la primera lleva una sola etiqueta «Principal» visible y las
     demás ninguna «Principal»; coincide con la empresa principal del registro.
  2. Empresa 1: tarjeta de Contactos, primera fila con «Principal», las demás sin ella.
  3. Negocio 1: tarjetas de Contactos y Empresas, misma regla.
  4. Lista: fila de Alicia Prieto visible, sin `[data-assoc-more]`, un solo `.name` en la celda, fila y celda a 48px
     igual que las 12 primeras filas, y el enlace de la empresa sigue llevando a su ficha.
  Sin errores en consola (fixture).
- Suite completa (`contactos`, `pantallas`, `tipos-de-campo`, `selector-propietario`, `papelera`, `icono-papelera`,
  `frontend-contactos`, `empresa-principal`; 182 pruebas a 1440 y 1280): __SUITE__
- `npm run build` en verde.
- Herramientas: `herramientas/_captura-empresa.spec.js` (spec temporal de capturas, `FASE=antes|despues`; se saca de
  `tests/` para que no corra con la suite).

## Capturas base que cambian por esta tarea (NO regeneradas; esperan aprobación del usuario)

- `contactos-lista` (tests/contactos.spec.js): fila 55 y 325 ahora a 48px (ya fallaba por la homogeneización de
  Contactos, pendiente de aprobar).
- `contactos-ficha`, `empresas-ficha`, `negocios-ficha`, `tickets-ficha` (tests/pantallas.spec.js): etiqueta
  «Principal» en la primera fila de las tarjetas de asociación y sin las etiquetas «Sin etiqueta».

## Qué falta / para decidir

- La vista previa de la tarjeta dentro de «Editar tarjeta» (`previewCard`, el mock de dos filas) no muestra
  etiquetas, como antes; no se pidió.
- Si el usuario prefiere que los demás asociados tampoco muestren sus etiquetas reales («Facturación», «Contacto
  técnico»), es una línea en `assocCard()`; se dejaron porque son datos guardados a propósito y HubSpot también las
  muestra.
- Aprobar las capturas base listadas arriba (y las pendientes de tareas anteriores: Bandeja ×2).
