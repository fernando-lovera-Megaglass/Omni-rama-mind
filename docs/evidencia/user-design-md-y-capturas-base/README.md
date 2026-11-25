# Evidencia — user-design-md-y-capturas-base (24-nov-2026)

Tarea: documentar el sistema de diseño **existente** y crear las capturas base de todas las
pantallas. **No se cambió ningún estilo ni componente**: solo documentación y pruebas.

## Qué se hizo

1. **`DESIGN.md`** (raíz de `app/`), reescrito como fuente de verdad del diseño actual de `mind`:
   - Tokens leídos de `src/app.css` `:root` (tipografía, colores claro/oscuro, espaciado, radios,
     estructura) y los valores literales que la hoja usa sin token (sombras, tamaños de letra,
     colores de estado).
   - Medidas reales de los componentes base (alto, relleno, fuente, radio, colores): botones y sus
     variantes, botones de icono, campos, buscadores, tabla, iconos, píldoras, chips, etiquetas,
     avatares, badges, tarjetas, panel lateral, panel de creación, modal, menú, tooltip, toast,
     títulos, barra lateral y superior. Se leyeron de `app.css` y se midieron en el navegador
     (`getComputedStyle` + `getBoundingClientRect`) en las 30 rutas a 1440 px.
   - Sección **«Inconsistencias detectadas»** (16 filas): variantes del mismo componente con
     medidas distintas, **sin unificar**, para que el usuario elija (resumen abajo).
   - Reglas de uso (incluida la de capturas base).
2. **`CLAUDE.md`** ya enlaza `[DESIGN.md](./DESIGN.md)` (punto 4); el archivo existe en la misma
   carpeta, el enlace resuelve. No se tocó `CLAUDE.md`.
3. **`tests/pantallas.spec.js`**: por cada ruta del router (`vite.config.js`) y por cada ancho
   (proyectos `w1440` 1440×900 y `w1280` 1280×800):
   - **visual**: `toHaveScreenshot()` de la pantalla tal como está hoy (modo demo determinista,
     reloj fijo del fixture). Las 58 capturas base se crearon en la primera corrida
     (`updateSnapshots: 'missing'`) en `tests/pantallas.spec.js-snapshots/` y pasaron en la
     segunda. No se usó `--update-snapshots`.
   - **funcional**: sin errores en consola (fixture); `deadLinks()` enumera los enlaces sin `href`
     o con `#` y el barrido los pulsa uno a uno junto con cada botón visible del contenido
     principal (hasta 40 por pantalla), exigiendo una respuesta real (mutación del DOM, panel o
     menú abierto, navegación, desplazamiento, descarga, ventana o diálogo). Lo que no responde
     debe coincidir con la lista `inert` documentada de la pantalla; lo que no se puede alcanzar
     tras reabrir la pantalla limpia hace fallar la prueba.
   - La lista de Contactos conserva su prueba y su base en `tests/contactos.spec.js`.

## Pantallas cubiertas (29 rutas nuevas + Contactos lista = 30 del router)

| Prueba | Ruta | Base 1440 / 1280 |
|---|---|---|
| inicio-sesion | `/` (acceso, sin barra lateral) | `inicio-sesion-w1440-darwin.png` / `-w1280-` |
| informes | `/reports/` | ✓ / ✓ |
| contactos (lista) | `/contacts/` | `tests/contactos.spec.js-snapshots/contactos-lista-*` (ya existía) |
| contactos-ficha | `/contacts/record/?id=1` | ✓ / ✓ |
| empresas-lista | `/companies/` | ✓ / ✓ |
| empresas-ficha | `/companies/record/?id=1` | ✓ / ✓ |
| negocios-lista | `/deals/` | ✓ / ✓ |
| negocios-ficha | `/deals/record/?id=1` | ✓ / ✓ |
| tickets-lista | `/tickets/` | ✓ / ✓ |
| tickets-ficha | `/tickets/record/?id=1` | ✓ / ✓ |
| tareas-lista | `/tasks/` | ✓ / ✓ |
| tareas-ficha | `/tasks/record/?id=1` | ✓ / ✓ |
| diseno-de-registro | `/layout/?type=contacts` | ✓ / ✓ |
| administrar-vistas | `/views/` | ✓ / ✓ |
| configuracion | `/settings/` | ✓ / ✓ |
| datos | `/data/` | ✓ / ✓ |
| datos-importar | `/data/import/?from=contacts` | ✓ / ✓ |
| segmentos | `/segments/` | ✓ / ✓ |
| segmento-crear | `/segments/editor/` | ✓ / ✓ |
| bandeja | `/inbox/` | ✓ / ✓ |
| llamadas | `/calls/` | ✓ / ✓ |
| marketing-preferencias | `/marketing/preferences/` | ✓ / ✓ |
| marketing-correo | `/marketing/email/` | ✓ / ✓ |
| plantillas | `/templates/` | ✓ / ✓ |
| fragmentos | `/snippets/` | ✓ / ✓ |
| secuencias | `/sequences/` | ✓ / ✓ |
| secuencia-crear | `/sequences/create/` | ✓ / ✓ |
| workflows | `/automation/` | ✓ / ✓ |
| workflow-editor | `/automation/editor/?id=d9000000-…-000000000003` (workflow de demo) | ✓ / ✓ |
| workflow-crear | `/automation/create/` | ✓ / ✓ |

Las capturas base están en `tests/pantallas.spec.js-snapshots/<prueba>-<ancho>-darwin.png` (58
archivos, 6,5 MB). No hay «antes/después» porque esta tarea no cambia ninguna zona de la UI.

## Inconsistencias encontradas (detalle y dónde: `DESIGN.md` §3)

1. **Botones**: `.btn` 40 px / 0 16 px; píldoras de 40, 36 y 44 px (listas, Datos, Segmentos);
   `.btn--sm` 32 px (fichas, Marketing, Bandeja); 44 px en la vista previa; un primario de 40 px
   con relleno 6 12 y 12,8 px en Datos; un «+» redondo de 32 px en Bandeja.
2. **Botones de icono**: 32 px cuadrado 18 px, 40 px redondo 16 px, 32 px redondo 15 px, 34 px en
   fichas, 22 px (`--xs`), 16 px (`.pmoves`).
3. **Campos**: 40 px base; 48 px / 16 px en Configuración; 44, 42, 38, 36, 34, 32, 30 y 28 px en
   segmentos, importación, filtros avanzados, Bandeja, Informes y fichas.
4. **Buscadores**: 32 px `--r-sm` (base) vs 40 px píldora con borde `--c-nav` (listas) vs 44 px
   (Configuración).
5. **Filas de tabla**: th 44 / td 48 (base); th 45 en listas; th 40 / td 32 en Datos; 36 px
   (`.table--compact`); 60–61 px (Segmentos); 71 / 105 px (Plantillas); 65 px en celdas de dos
   líneas.
6. **Iconos `.ico`**: 20 px base; 16, 13, 14, 15, 18 y 19 px según el sitio.
7. **Píldoras**: 40 px (listas), 32 px (fichas), 44 px (Diseño de registro, Vistas), 36 px (`--xs`).
8. **Avatares**: `.avatar--sm` con dos reglas (28 → 24 px); `.avatar--xs` con dos tamaños de fuente
   (10 → 13 px); 28 px en la barra superior; 84 px en el perfil.
9. **Etiquetas**: 24 px / 12,8 px vs 22 px / 12 px (`.tag--beta`) y relleno vertical 3 px en fichas.
10. **Títulos h1**: 22/600 (`.page-title`), 22/500 (`h1` base), 20/500 (Datos, Importar, Crear
    segmento), 24/600 (Workflows), 16/600 (editor y creación de workflow).
11. **Títulos h2**: 16, 22, 18, 17, 15 y 12,8 px según pantalla.
12. **Tamaños de letra sin token**: 15 px (67 reglas), 12, 13, 18, 20, 24, 17, 11, 10, 28, 26, 9 px.
13. **Colores sin token**: 205 literales fuera de `:root` (rojo `#d94c53` ×25, azul `#0091ae`,
    verde `#1f9a63`, `#cbd6e2`, `#e3e8ee`…): faltan tokens de error, éxito e info.
14. **Rellenos sin token**: `.menu__item` 11 20, `.tip__text` 10 14, `.toast` 12 20, `.badge` 0 5.
15. **Enlaces sin acción**: en la pantalla de acceso el logotipo («Página principal»), «Solicitar
    demostración», «Política de privacidad», «Administrar las cookies» y «Política de cookies» son
    `#` sin manejador. La flecha «‹» de las métricas de Negocios no hace nada al cargar (la pista
    ya está al principio).
16. **Errores de consola al pulsar**: en la ficha de tarea, «Notas +», «Recordatorio +» y
    «Repetir +» lanzan `Cannot read properties of null (reading 'scrollIntoView')`. En la lista de
    tareas, «Crear cola» es el envío del formulario de «Cola ▾» y solo es alcanzable con ese panel
    abierto. Las pruebas omiten estos cuatro controles (`skip`) y los dejan documentados; no se
    corrigieron porque la tarea no cambia componentes.

## Pruebas

- Primera corrida de `tests/pantallas.spec.js` (crea las 58 capturas base): **116 / 116 en verde**.
- Segunda corrida completa (`tests/contactos.spec.js` + `tests/pantallas.spec.js`, 1440 y 1280):
  **120 / 120 en verde** (114 en la pasada principal; 6 de las pantallas de workflows se
  repitieron y pasaron porque el servidor de desarrollo de la prueba se cayó al final de esa
  pasada mientras corría `npm run build` en paralelo; no fue un fallo de la pantalla).
- `npm run build`: en verde.
- Barrido funcional: 29 pantallas × 2 anchos, hasta 40 controles por pantalla; sin errores en
  consola salvo los documentados en el punto 16 (omitidos por `skip`).

Nota operativa: el puerto 4173 lo ocupa un servidor de desarrollo de otro carril (Kimi) y
`playwright.config.js` tiene `reuseExistingServer: true`, así que las corridas de esta tarea se
hicieron con una copia temporal de la configuración en el puerto 4199 (`npx playwright test -c
_pw-tmp.config.js`, archivo no versionado: importa `./playwright.config.js` y cambia solo el puerto
y `baseURL`). Con el servidor del 4173 en modo demo, `npx playwright test` da el mismo resultado.

## Qué falta / decisiones del usuario

- Elegir, por cada fila de «Inconsistencias detectadas», qué variante queda; esta tarea no unifica.
- Decidir si se corrigen los enlaces sin acción de la pantalla de acceso y los tres botones de la
  ficha de tarea que lanzan error (puntos 15 y 16).
- `PANTALLAS.md` sigue marcando las capturas base como «—»: ahora existen para las 30 rutas,
  generadas «tal como está hoy» por esta tarea y sin aprobación visual del usuario (la tarea pide
  crearlas ahora; la aprobación de cada pantalla sigue siendo del usuario).
