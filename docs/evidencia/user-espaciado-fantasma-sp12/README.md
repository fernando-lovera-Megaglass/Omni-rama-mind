# Evidencia — user-espaciado-fantasma-sp12 (27-nov-2026)

Pedido del usuario: borrar el espaciado fantasma de `src/app.css`: las declaraciones que usan `var(--sp-12)` (80) y
`var(--sp-48)` (2, `.pvedit` y `.mv__main`) sin que esos tokens existan en `:root`. Condiciones: cambio visual CERO;
si al quitar una declaración un elemento queda visiblemente sin espaciado, sustituir SOLO esa por el token más cercano
y reportarlo; prohibido añadir `--sp-12`/`--sp-48` a `:root`; pruebas en verde; capturas antes/después de Informes,
Negocios, Bandeja, Configuración y Vistas.

## Resultado en una línea

`src/app.css` ya no tiene ninguna referencia muerta a `--sp-12` ni a `--sp-48` (queda solo una viva, con reserva,
ver «Qué falta»), **sin ningún cambio visual**: 218 estados de pantalla (30 pantallas + 79 sub-estados, a 1440 y
1280px) dan captura idéntica y estilos computados idénticos antes y después. No se tocó `:root` ni ninguna captura
base.

## Hallazgo que cambia el trabajo (y por qué no todo se pudo «borrar»)

La premisa «hoy ya no pintan nada» es cierta solo a medias. Una declaración con `var(--sp-12)` **sí participa en la
cascada**: gana a las reglas anteriores de igual o menor peso, y como su valor es inválido al computarse, la propiedad
queda en su valor inicial (`0`, `normal`, `auto`). Es decir, hoy esas declaraciones **ponen la propiedad a cero y tapan
lo que hubiera debajo**. Al quitarlas pasan dos cosas distintas:

- **60 declaraciones**: no hay nada debajo (ninguna otra regla ni valor del navegador para esa propiedad) → quitarlas
  no cambia nada. **Quitadas**; 10 reglas que quedaron vacías se quitaron enteras.
- **22 declaraciones**: debajo hay una regla anterior (`.table td`, `.menu__panel`, `.estate`, `.tpls__head`,
  `.wfe__bar`, `.drawer__body`, `.ginput`, `.mini-table td`, `.tip__text`, `.record__colbar`) o el valor por defecto
  del navegador (`<p>`, `<ul>`, `<fieldset>`, `<button>`, `<td>`) → quitarlas **sí habría movido** Datos (estado
  vacío compacto), Bandeja (pestañas de redacción), Workflows (cabecera) y el editor de workflows (barra), además de
  sub-estados de Configuración, importación, Vistas y la papelera de vistas. Para cumplir «cambio visual CERO» esas
  22 quedaron **escritas con el valor que ya pintan hoy** (`0`, y `top: auto` en el globo de la columna plegada del
  tablero), sin token fantasma y sin valores sueltos de la escala. Son los casos que el punto 2 de la tarea no
  contemplaba (pérdida de espaciado): aquí lo que ocurre es lo contrario, un espaciado que *aparecería*. Lista y
  motivo de cada una en `inventario.md` (columna «Acción»).
- **1 declaración sin tocar**: `.callreview__section { padding-top: var(--sp-12, 12px) }` (L19064). No es muerta
  (tiene reserva `12px` y pinta 12px) y no está entre las 80 anuladas del hallazgo; ver «Qué falta».

El punto 2 de la tarea (sustituir por `--sp-10`/`--sp-32` cuando se pierda espaciado) **no hizo falta en ningún
caso**: ninguna de las 82 declaraciones aportaba espaciado, así que quitarlas no quita nada.

## Cómo se verificó

1. **Inventario** con postcss de las 83 declaraciones (selector, propiedad, valor, media query):
   `herramientas/_sp12-extract.mjs` → `inventario.md`.
2. **Análisis estático**: para cada una, la etiqueta y todas las clases del elemento real (leídas de las plantillas
   JS) y las reglas de `app.css` que podrían tomar el relevo por orden y especificidad, más el valor por defecto del
   navegador para esa etiqueta: `herramientas/analisis-estatico.txt`.
3. **Medición ANTES / DESPUÉS con Playwright** (`herramientas/_sp12.spec.js` y `_sp12-extra.spec.js`, configuración
   `_pw-sp12.config.js` en el puerto 4199 con capturas de referencia temporales en `/tmp`, nunca las del repo):
   - 30 pantallas (las 29 de `pantallas.spec.js` + lista de Contactos) × 2 anchos.
   - 79 sub-estados × 2 anchos: 39 secciones de Configuración, 28 pestañas de objeto (`#obj-<objeto>:config|pipelines|
     lifecycle|record|preview|index|assoc`), menú lateral plegado, tablero de negocios normal y con columna plegada,
     menú de pipeline abierto, importación en el paso de mapeo (datos pegados), editor de previsualización
     (`/layout/?type=contacts&preview=1`), modal «Programar reunión», editor de segmento existente, pestañas de
     Vistas y su tabla «Todas las vistas», ayuda del editor de workflows.
   - Por cada estado: estilos computados (padding/margin/gap/top por lado) y caja de **cada elemento** alcanzado por las
     83 reglas, y captura comparada con la de referencia tomada antes del cambio.
   - Resultado: **218 / 218 capturas idénticas** (`toHaveScreenshot` contra la referencia «antes»); estilos computados:
     **0 cajas movidas, 1 único valor distinto**: `.wfe__bar` `gap: normal → 0px` (editor y creación de workflows),
     que es el mismo espaciado (en flex, `normal` = 0). `herramientas/diff-estilos-computados.txt`.
4. **Capturas de evidencia** (ventana completa, 1440 y 1280): `antes-/despues-<pantalla>-<ancho>.png` para
   informes, negocios-lista, negocios-ficha, bandeja, configuracion y administrar-vistas. 11 de los 12 pares son
   **byte a byte idénticos**; `administrar-vistas-1440` difiere en 35 píxeles de 1 296 000 con una diferencia máxima
   de 2/255 por canal (suavizado de texto; invisible).
5. **Suite oficial** (los 7 specs permanentes: `contactos`, `pantallas`, `tipos-de-campo`, `selector-propietario`,
   `papelera`, `icono-papelera`, `frontend-contactos`; 166 pruebas a 1440 y 1280; corrida con el carril de empresa
   principal editando `record.js`/`contacts.js` en el mismo árbol): **157 en verde, 9 en rojo**, y ninguno de los 9
   es de esta tarea:
   - 6 esperados de tareas anteriores, pendientes de aprobación del usuario: `contactos-lista` ×2 y `contactos-ficha`
     ×2 (homogeneización de Contactos), Bandeja ×2 (17 px, selector de propietario).
   - `tickets-ficha` (369 px) y `tareas-ficha` (352 px) a 1440: el diff es la etiqueta «Principal» de la tarjeta de
     asociaciones que está metiendo la tarea user-ficha-empresa-principal (otro carril, `src/record.js` sin
     commitear); a 1280 pasan porque la ficha pliega la columna derecha. Esta tarea no toca esas pantallas (los 218
     estados medidos las incluyen y dieron idénticas).
   - `tickets-lista` funcional a 1440: ruido de la corrida concurrente; repetida sola, pasa (6 / 6 con las dos
     visuales anteriores de nuevo en rojo por lo mismo).
   El spec `tests/empresa-principal.spec.js` (de esa otra tarea, en construcción) se excluyó de la corrida.
6. `npm run build` en verde.

## Qué cambió en el código

- `src/app.css`: −106 líneas, +23. 60 declaraciones quitadas (10 reglas vacías quitadas enteras:
  `.sedit__ai`, `.sedit__addmember`, `.pvmock__foot`, `.mv__list`, `.mv__main`, `.lgroup > .pill`,
  `.lpreview__field`, `.wfe__help section + section`, `.custom-library .search`, `.custom-library form > .field`),
  22 declaraciones reescritas con el valor actual (`0` / `auto`). Ningún token nuevo, nada en `:root`.
- `DESIGN.md` §1 «Espaciado»: solo se actualiza la nota entre paréntesis que decía que «unas 80 reglas» usaban
  `--sp-12`, porque ya no es cierto; la regla (12px se escribe `calc(var(--sp-8) + var(--sp-4))` hasta que el usuario
  decida) no cambia.
- No se tocó ninguna captura base ni otro archivo.
- Nota de orden: el commit `cb21008` del orquestador («Claude: user-ficha-empresa-principal», 15:09) arrastró
  al repo esta carpeta de evidencia a medias y los scripts temporales de medición de la raíz (`_sp12-*.mjs`,
  `_pw-sp12.config.js`, `_sp12-tests/`); en el commit de esta tarea se retiran del repo (las copias de trabajo
  están en `herramientas/`) y `_pw-tmp.config.js` vuelve a no versionarse. `src/app.css` no entró en ese commit:
  el cambio real de la tarea está en el commit propio.

## Qué falta / decisiones del usuario

1. **Las 22 propiedades escritas en `0`/`auto`** reproducen el aspecto actual, que es lo pedido. Si para alguna se
   prefiere recuperar el espaciado que el autor quiso (12px → `--sp-10`, o el valor de la regla que tapaban, p. ej.
   `.wfe__bar` 16px, `.tpls__head` 16px, `.table td` 0 16px), es una decisión aparte: cada una está en `inventario.md`
   con la regla o el valor del navegador que aparecería.
2. **`.callreview__section { padding-top: var(--sp-12, 12px) }`** (panel de revisión de llamada): referencia viva al
   token inexistente con un `12px` suelto de reserva. Opciones: `calc(var(--sp-8) + var(--sp-4))` (12px, cero cambio,
   convención de DESIGN.md) o `var(--sp-10)` (10px, como el punto 2 de la tarea). No se cambió por no estar en el
   alcance (no es una declaración anulada).
3. **Otros `12px` y `48px` sueltos** en `app.css` (p. ej. `.toast` 12px 20px, `.pmenu__item` 12px) no eran parte del
   pedido (DESIGN.md §4 #14 ya los lista).
4. Hallazgo colateral, no corregido: en Configuración › Usuarios y equipos, el botón **«Crear ajuste
   preestablecido»** (`data-act="new-preset"`) deja la página sin responder en modo demo (Playwright no consigue
   terminar el clic en 90 s a 1440 ni a 1280). Pendiente de reproducir a mano.
5. Capturas base que siguen en rojo por tareas anteriores, no por esta: Bandeja ×2 (17 px, selector de propietario) y
   contactos-lista / contactos-ficha ×2 (homogeneización de Contactos), pendientes de aprobación del usuario.
6. Las 22 líneas con `0` no cubren los sub-estados que no se pudieron medir (recorte de avatar, revisión de llamada,
   etiquetas de negocio, modal de ajuste preestablecido): para ellos vale el análisis estático de
   `herramientas/analisis-estatico.txt`, que es el que decidió qué se quita y qué se escribe en `0`.
