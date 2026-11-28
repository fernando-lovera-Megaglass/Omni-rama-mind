# Evidencia — user-ficha-laterales-340 (27/28-nov-2026)

Pedido y aprobado por el usuario (27-nov, con simulaciones): cuatro cambios en la ficha de registro, todo con tokens de
DESIGN.md (sin 12px, 64px ni 13px sueltos): 1) laterales de 340px cuando el centro conserva sus 560px; 2) filas de
propiedad (izquierda) y de tarjeta de asociación (derecha) con más aire; 3) los seis botones de acción en una sola fila
con la tarjeta a 340px; 4) pestañas de la ficha más compactas para que las cinco quepan a 1440px sin «Más». Documentar
en DESIGN.md el corte de 340px, la fila de propiedad y `.rtabs`. Sin tocar lógica ni backend.

## Qué cambió (`src/app.css`, commit 859d5dc; `DESIGN.md` §1 Estructura y §2 Componentes)

| Punto | Regla | Antes | Después |
|---|---|---|---|
| 1 Laterales | `@media (min-width: 1440px) .record` (+ `.is-left-collapsed`, `.is-right-collapsed`) | `300px minmax(560px, 1fr) 300px` a cualquier ancho | **`340px minmax(560px, 1fr) 340px` a ≥ 1440px**; debajo, 300px como siempre. A 1440 el centro mide 592px (1440 − nav 72 − márgenes 64 − 2×340 − 2×16); cabría desde 1408px, el corte se hace coincidir con el de las tres columnas (1440) |
| 2 Filas | `.record__left .props__row` / `.record__left .props dd` | relleno 8px 0; 2px entre etiqueta y valor; fila de 59px | **relleno `--sp-10` 0; `--sp-8` entre etiqueta y valor**; fila de 69px (20 + 8 + 20 + 2×10 + borde) |
| 2 Filas | `.record__right .assoc-card__row` | sin relleno; separación 6px | **relleno `--sp-10` 0; separación `--sp-8`**; fila de 40px con valor de una línea |
| 3 Botones | `@media (min-width: 1440px) .record__quick`, `.quick`, `.quick__ico svg` | `flex-wrap: wrap`, separación 8px, botones de 56px en dos filas, glifo 18px | **una fila (`nowrap`), `flex: 1 1 0`, separación `--sp-4`, glifo 20px** (el de la escala de DESIGN.md §3); letra `--fs-xs` como ya era. Medido: Nota/Correo/Llamar/Tarea 47.5px, Reunión 52.2px (su texto), Más 36px = 298px de la tarjeta. A < 1440px todo igual que hoy |
| 4 Pestañas | `.rtabs__tab`, `.rtabs__custom` | 14px, relleno 0 16px | **`--fs-xs` (12.8px), relleno 0 `--sp-4`** (ver desviación) |

Sin `min-height` ni valores sueltos: los únicos literales son los estructurales de la cuadrícula (340px, como los
300/560/44 que ya existían) y el glifo de 20px de la escala de iconos. Nada en `record.js`.

### Desviación respecto al texto de la tarea (punto 4): relleno `--sp-4` en vez de `--sp-8`

La simulación contó **624px** disponibles para la barra de pestañas a 1440px; el centro real con laterales de 340px es
**592px** (la simulación omitió los dos huecos de `--sp-16` de la cuadrícula) y la barra, con sus bordes, deja
**590px**. Medido en el navegador con la fuente cargada (Lexend Deca):

| Pestañas de la ficha de contacto/negocio (12.8px) | relleno 0 `--sp-8` | relleno 0 `--sp-4` |
|---|---|---|
| Información destacada (500) + Descripción + Actividades + Información avanzada + ⚙ Personalizar (600), con separadores de 1px | **613px → no caben en 590** | **573px → caben** (17px de sobra; las pestañas se estiran a llenar la barra, `flex: 1 0 auto`) |

Con `--sp-8` el resultado no era el aprobado: a 1440 «Información avanzada» seguiría plegándose en «Más» y, además,
`record.js` solo re-mide la barra cuando cambia de tamaño (`ResizeObserver`), no cuando termina de cargar la fuente, así
que con un desborde pequeño la barra quedaba sin plegar y **«Personalizar» salía cortado** (reproducido sobre la ficha
actual inyectando el relleno de `--sp-8`: `herramientas/prueba-sp8-pestanas-1440.png`, contenido 613px en una barra de
590px, «Más» oculto). Como el propósito aprobado era explícito («para que las 5 pestañas
quepan visibles a 1440px sin plegarse en «Más»») y `--sp-4` es el token inmediato de la escala, se construyó con `--sp-4`
y se deja aquí la decisión: si se prefiere `--sp-8`, hay que aceptar «Más» a 1440 (y corregir el re-plegado al cargar la
fuente en `record.js`, una línea, fuera del alcance de esta tarea).

## Medido con Playwright (fuente cargada, modo demo), antes → después

| Ficha / ancho | Columnas `.record` | Barra de pestañas (contenido / ancho útil) | «Más» | Botones `.quick` | Fila de propiedad | Fila de asociación |
|---|---|---|---|---|---|---|
| contacto 1440 | 300 / 672 / 300 → **340 / 592 / 340** | 743 / 670 (1 plegada) → **590 / 590 (5 visibles)** | visible → **oculto** | 2 filas, 56px, glifo 18 → **1 fila, 47.5–52.2px, glifo 20** | 59px, 8/2 → **69px, 10/8** | 46px (dos líneas) / 20px → **68px / 40px**, separación 6 → 8 |
| empresa 1440 | ídem | 543 / 590 (5 visibles, ya cabían) | oculto → oculto | ídem | ídem | ídem |
| negocio · ticket · tarea 1440 | ídem | 590 / 590, 5 visibles | oculto | 1 fila | 10/8 | 10/8 |
| contacto · empresa · negocio · ticket · tarea 1280 | 300 / 768 / 44 (derecha plegada) → **igual** | 766 / 766, 5 visibles → **igual** (más pequeñas) | oculto → oculto | 2 filas, 56px, glifo 18 → **igual** | 59 → **69px** | (columna plegada) |

Ninguna ficha desborda la ventana (`scrollWidth` del documento = ancho de la ventana en todos los casos). Datos crudos:
`herramientas/medidas-antes/` y `herramientas/medidas-despues/`; spec y configuración: `herramientas/`.

## Capturas (1440 y 1280)

- Ficha completa: `antes-/despues-ficha-contacto-<ancho>.png`, `…-empresa-…`, `…-negocio-…` (+ `despues-ficha-ticket-…`
  y `despues-ficha-tarea-…` para comprobar las cinco fichas después).
- Recorte de la tarjeta del contacto/empresa (identidad + seis botones): `antes-/despues-ficha-<obj>-tarjeta-recorte-<ancho>.png`.
- Recorte de la barra de pestañas: `antes-/despues-ficha-<obj>-pestanas-recorte-<ancho>.png`.
- Recorte de la primera tarjeta de asociación (derecha, solo a 1440 porque a 1280 la columna está plegada):
  `antes-/despues-ficha-<obj>-asociaciones-recorte-1440.png`.

A 1280 todo vuelve a 300px, dos filas de botones y el mismo plegado de pestañas que hoy (ninguna: a 1280 ya cabían).
Sin texto encimado ni cortado a 1440 ni a 1280.

## Pruebas

- Suite oficial (`contactos`, `pantallas`, `tipos-de-campo`, `selector-propietario`, `papelera`, `icono-papelera`,
  `frontend-contactos`; 166 pruebas a 1440 y 1280, corrida en un servidor propio en el puerto 4223 con la configuración
  oficial de capturas base): **154 en verde, 12 en rojo**, todos visuales y todos esperados:
  - Bandeja ×2 (17 px): pendiente de aprobación desde la tarea del selector de propietario; esta tarea no la toca.
  - Las cinco fichas, **cambiadas por diseño en esta tarea** y sin regenerar: a 1440 (laterales de 340, filas, botones y
    pestañas) contactos-ficha 31 799 px, empresas-ficha 35 371, negocios-ficha 37 885, tickets-ficha 41 429,
    tareas-ficha 34 199; a 1280 (solo filas y pestañas) contactos-ficha 4 100, empresas-ficha 3 352, negocios-ficha
    3 222, tickets-ficha 4 579, tareas-ficha 3 563.
  Las 83 pruebas funcionales (cada botón y enlace responde, sin errores en consola) de las 29 pantallas pasan, las cinco
  fichas incluidas; ninguna otra pantalla cambió (las 48 capturas base restantes siguen en verde).
- `npm run build` en verde.

## Qué falta / para decidir

1. **Capturas base de las cinco fichas** (`contactos-ficha`, `empresas-ficha`, `negocios-ficha`, `tickets-ficha`,
   `tareas-ficha`, a 1440 y 1280): cambian por diseño con esta tarea y **no se regeneraron** (prohibido sin aprobación).
   Al aprobarse, regenerarlas junto con las pendientes de Bandeja ×2 y Contactos (lista/ficha).
2. Decisión sobre el relleno de las pestañas (`--sp-4` construido; `--sp-8` pedido): ver desviación.
3. `.props__row` fuera de la ficha (vista previa de listas, bandeja, ajustes, detalle de llamada) conserva 8px/2px: la
   tarea era solo la columna izquierda de la ficha; unificar sería otra decisión.
4. La tarjeta `.assoc-card` separa sus filas con 6px (valor suelto preexistente, DESIGN.md §4 #14); no estaba en el pedido.
5. Con la barra lateral de navegación **desplegada** (220px) la ficha ya desbordaba a 1440 con laterales de 300px
   (1156px útiles < 1192px) y sigue desbordando con 340px: comportamiento preexistente, fuera del alcance.
6. Hallazgo: `record.js` no vuelve a medir las pestañas cuando termina de cargar la fuente (solo al cambiar el tamaño de
   la barra); hoy no se nota porque las cinco caben o el desborde es grande, pero convendría un `document.fonts.ready
   .then(fitTabs)` cuando se toque esa lógica.
