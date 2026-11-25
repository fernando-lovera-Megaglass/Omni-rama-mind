# Auditoría de botones e iconos — Omni CRM (24-nov-2026)

Alcance: todas las variantes de `.btn`, `.icon-btn`, `.ico`, `.pill`, `.quick` y `.qchip`
en `src/app.css`, más las mediciones en navegador hechas para DESIGN.md (24-nov).
Objetivo: inventario completo para decidir la homogeneización. **Nada se corrigió**;
cada sección termina en la decisión que le toca al usuario.

## Resumen

| Familia | Variantes encontradas | Alturas/tamaños distintos | Colores de acción distintos |
|---|---|---|---|
| Botones (`.btn`) | 12 | 5 (30, 32, 36, 40, 44 px) | 5 (naranja, verde azulado, verde, rojo, azul marino) |
| Botones de icono (`.icon-btn`) | 6 | 5 (22, 32, 34, 40 px y 18×16 px) | — |
| Iconos (`.ico`) | 1 sistema, muchas excepciones | 8 (13, 14, 15, 16, 18, 19, 20 px y opacidades .85/0.9/1) | — |
| Píldoras (`.pill`) | 9 | 6 (32, 34, 36, 40, 44, 48 px) | — |
| Acciones de ficha (`.quick`) | 1 | 1 (icono redondo 36 px) | uniforme ✓ |
| Chips de filtro (`.qchip`) | 1 | 1 (36 px) | uniforme ✓ |

## 1. Botones `.btn`

Base: 40 px de alto, relleno 0 16px, 14px/600, radio `--r-sm` (6px).

| # | Variante | Diferencia con la base | Dónde aparece |
|---|---|---|---|
| B1 | `.btn--sm` | 32 px, relleno 0 10px | fichas de registro, Marketing, Bandeja |
| B2 | `.btn--pillx` (36 px) | píldora más baja | Datos (`.dint__card`, `.dint__monitor`), buscador de Segmentos, `.hlpop__foot` |
| B3 | `.btn--pillx` (40 px) | solo cambia el radio a píldora | cabeceras de listas, acciones de Segmentos y editor de secuencias |
| B4 | `.preview__foot .btn` | 44 px, radio píldora, fondo azul marino `#253342` | vista previa de marketing |
| B5 | `.estate--compact .btn` | relleno 6px 12px, letra 12.8px | estado vacío compacto |
| B6 | `.tpe__toolbar button` | 30 px, relleno 0 8px | barra de herramientas del editor de plantillas |
| B7 | `.btn--outline` | borde, fondo blanco | varias |
| B8 | `.btn--danger` | fondo rojo `#d94c53` | confirmaciones de borrado |
| B9 | `.btn--green` | fondo verde `#1f6f60` | acciones positivas puntuales |
| B10 | `.btn--primary.btn--pillx` | **fondo verde azulado `--c-link` en vez de naranja**, hover `#004d4e` | «Agregar contactos/empresas/negocios/tickets/tareas» en listas |
| B11 | `.btn--pill` | píldora blanca con borde y texto verde azulado | «Acciones ▾» de las listas |
| B12 | `.page-head__actions .btn` | relleno 0 8px | cabeceras de página |

**Colores de botón primario que hoy conviven: 5** — naranja `--c-primary` (#ff5c35),
verde azulado `--c-link` (#006162), verde `#1f6f60`, rojo `#d94c53`, azul marino `#253342`.

**Decisión del usuario:**
- Alturas: ¿unificamos en 2 medidas (40 px normal / 32 px compacto) o en 3 (40/36/32)?
- El «Agregar contactos» verde azulado de las listas: ¿se queda verde azulado o pasa a naranja como los demás primarios?
- `.btn--green` y el azul marino de la vista previa: ¿entran al sistema como variantes oficiales o migran a primario/secundario?

## 2. Botones de icono `.icon-btn`

Base: 32×32 px, glifo 18 px, radio 6px.

| # | Variante | Tamaño | Dónde |
|---|---|---|---|
| I1 | `.icon-btn--round` | 40×40 redondo, glifo 16 | barra de herramientas de listas (vista panel/tabla, engranaje, plegar) |
| I2 | `.icon-btn--sm` | 32×32 redondo, glifo 15 | «+» y «✎» de filtros, acciones de ficha |
| I3 | `.icon-btn--xs` | 22×22, glifo 14 | acciones discretas en tarjetas |
| I4 | `.card__head--about .icon-btn--round` | 34×34 | cabecera «Acerca de» de las fichas |
| I5 | `.pmoves .icon-btn` | 18×16, glifo 11 | reordenar propiedades |

**Decisión del usuario:** ¿escala de 3 tamaños (40 redondo / 32 / 22) y se migran I4 e I5
a la más cercana, o se conservan como excepciones documentadas?

## 3. Iconos `.ico`

Sistema base: máscara SVG, `currentColor`, 20×20 px, opacidad .85, radio 4px.
Se encontraron **8 tamaños en uso**:

| Tamaño | Dónde |
|---|---|
| 20 px | barra lateral, acciones (opacidad 1 en barra lateral) |
| 19 px | caja de llamada (`.callbox__ico`) |
| 18 px | dentro de `.icon-btn` |
| 16 px | buscadores, barra superior, vista panel/tabla, filtros |
| 15 px | menús de columna de tabla (`.thmenu`, opacidad .9) |
| 14 px | iconos en línea (`.ico--inline`) |
| 13 px | enlace externo de celda (`.cell-link .ico--ext`) |
| 11–12 px | reordenar propiedades (`.pmoves`) |

**Decisión del usuario:** propuesta de escala oficial **20 / 16 / 13** (grande / normal /
en línea); todo lo demás migra a la medida más cercana. ¿Sí o qué escala prefieres?

## 4. Píldoras `.pill`

Base: 40 px, relleno 0 16px, 14px, radio píldora.

| # | Variante | Alto | Dónde |
|---|---|---|---|
| P1 | `.pill--xs` | 32 px | filtros compactos |
| P2 | `.pill--sm` | 34 px | — |
| P3 | `.pill--adv` | 36 px | filtros avanzados |
| P4 | `.pill--lg`, `.pill--dark`, `.pill--light`, `.pill--send` | 44 px | Diseño de registro, Administrar vistas, envío de correo |
| P5 | `.pill--next` | 48 px, letra 16px | asistentes (siguiente paso) |

**Decisión del usuario:** ¿se unifica en 40 px base + 32 px compacta, o se acepta la
familia de 44/48 para asistentes y envíos como tercer tamaño?

## 5. Lo que ya está uniforme ✓

- `.quick` (acciones de ficha: Nota, Correo, Llamar, Tarea, Reunión, Más): un solo
  tamaño en toda la app (icono redondo 36 px, etiqueta 12.8px verde azulado).
- `.qchip` (chips de filtro): 36 px en todas partes.
- `.tag`, `.avatar`, `.badge`: documentados en DESIGN.md sin variantes fuera de lista.

## Propuesta de homogeneización (a validar por el usuario)

1. **Botones**: base 40 px; compacto 32 px; se eliminan el 36 y el 44 sueltos
   (migran a 40 o 32 según densidad de la pantalla).
2. **Color primario único**: naranja para toda acción primaria; el verde azulado queda
   reservado a enlaces y elementos de texto; rojo solo para peligro; se eliminan
   `.btn--green` y el azul marino suelto.
3. **Iconos**: escala 20 / 16 / 13 con opacidad fija .85 (1 solo en barra lateral).
4. **Píldoras**: 40 base + 32 compacta; asistentes conservan 44/48 como familia
   documentada si el usuario lo aprueba.

Cada punto queda pendiente de tu «sí» antes de ejecutarse; al aprobarlo se crea la
tarea correspondiente para Claude Code con capturas antes/después por pantalla.
