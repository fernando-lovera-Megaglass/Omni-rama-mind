# Evidencia — user-papelera-buscador-interno (25-nov-2026)

Bug reportado por el usuario y reproducido por Kimi: con el panel modal «Restaurar registros eliminados» abierto
la barra superior «Buscar en Omni» no responde y el panel no tenía buscador propio, así que con cientos de
registros eliminados no había forma de encontrar el que se quiere restaurar.

## Qué cambió (`src/list.js` `renderTrash`, un solo componente para Contactos, Empresas, Negocios y Tickets)

1. **Buscador dentro del panel**, encima de la tabla: el mismo campo `.search.search--sm` de 32px que usan los
   paneles de la ficha (icono `.ico--search` de 16px, `input type="search"`, placeholder y `aria-label`
   «Buscar en eliminados»), de 280px de ancho como el de «Todas las vistas» (`.trash__search`). Filtra las filas
   por **nombre, correo (o dominio en Empresas) y propietario** mientras se escribe, sin distinguir mayúsculas.
   Solo se redibuja la tabla (`#trash-list`), así el campo conserva el foco y el texto. El título sigue mostrando
   el total de la papelera. Al abrir la papelera el filtro empieza vacío y el campo recibe el foco (el cajón ya
   enfocaba su primer campo).
2. **Sin coincidencias**: en lugar de la tabla, el mensaje «Ningún registro eliminado coincide con «lo que se
   escribió».» (`.trash__empty`, `role="status"`). La papelera vacía sigue diciendo «La papelera está vacía.»
3. **Botones de cierre del panel**: el cajón de acciones se crea después del cableado genérico de los cajones,
   así que «×», «Cerrar» y el velo se cierran ahora desde su propio listener. Antes, «Cerrar» del pie dejaba de
   responder en cuanto se restauraba un registro (el pie se redibuja); lo detectó la prueba y era obligatorio
   corregirlo (regla «cada botón hace algo») dentro del mismo panel.
4. **No se tocó la barra superior**: el panel es modal y bloquea la página a propósito, como pide la tarea.
5. `src/app.css`: `.trash__search` (280px, margen inferior `--sp-16`) y `.trash__empty` (sin margen). Sin tokens
   nuevos.

«Restaurar todos» sigue restaurando **toda** la papelera, no solo lo filtrado (no se pidió cambiarlo; se anota
por si el usuario quiere que respete el filtro).

## Capturas (1440 y 1280 px; `-recorte` es el panel)

| Antes | Después |
|---|---|
| `antes-papelera-<ancho>(-recorte).png`: panel con tres contactos borrados y sin buscador | `despues-papelera-<ancho>(-recorte).png`: el buscador encima de la tabla |
| — | `despues-papelera-filtro-<ancho>-recorte.png`: filtrando «ana» |
| — | `despues-papelera-sin-resultados-<ancho>-recorte.png`: «Ningún registro eliminado coincide con «zzzz».» |

## Pruebas (`tests/papelera.spec.js`, modo demo, 1440 y 1280 px): **10 / 10 en verde** (5 pruebas × 2 anchos)

1. Contactos: borra dos contactos con la barra masiva, abre la papelera (título «· 2»), comprueba el campo (32px,
   icono, placeholder), filtra por nombre (1 fila, el campo conserva el foco), por propietario y por correo, sin
   resultados (mensaje exacto), restaura desde el filtro (toast «Registro restaurado», título «· 1»), cierra con
   «Cerrar» y confirma que el contacto vuelve a la lista (conteo y nombre) y el otro sigue borrado.
2. Contactos: Escape en el campo lo vacía y vuelven todas las filas (comportamiento nativo de `type="search"`);
   el panel se cierra con «×» y con «Cerrar». Los cajones de Omni no se cierran con Escape (comportamiento
   previo, no se cambió).
3. Empresas, Negocios y Tickets: borra un registro, abre la papelera («Acciones» o «⋮» según el módulo), el
   mismo buscador filtra por nombre, sin resultados avisa, restaurar devuelve el registro a la lista.

Suite completa (`contactos`, `pantallas`, `tipos-de-campo`, `selector-propietario`, `papelera`): **148 / 150**.
Las dos que no pasan son las visuales de **Bandeja**, pendientes de aprobación del usuario desde la tarea del
selector de propietario (17 píxeles de la flecha del campo «Asignar a»); este cambio no toca Bandeja ni ninguna
captura base (el panel de la papelera no aparece en reposo en ninguna pantalla). Sin errores en consola
(fixture). `npm run build` en verde. Sin `--update-snapshots`.

Nota: durante las corridas finales otro carril (Kimi) ejecutaba la misma suite en paralelo en esta carpeta, y
con esa carga algunas visuales difirieron por el antialiasing del texto (píxeles sueltos repartidos por las
letras, 295–782 por captura, sin cambio de distribución): «Administrar vistas», «Segmentos», «Llamadas»,
«Fragmentos» y «Contactos — lista» en distintas pasadas, nunca las mismas. Repetidas solas pasan todas (la
última pasada completa quedó 147 / 150: Bandeja ×2 y «Contactos — lista» 1440 por ese ruido; Contactos repetida
sola, 4 / 4). Es ruido de carga, no un cambio de UI; el panel de la papelera no aparece en ninguna captura base.

Nota operativa: el puerto 4173 lo ocupa el servidor de desarrollo de otro carril y `playwright.config.js`
tiene `reuseExistingServer`; las corridas se hicieron con una copia temporal de la configuración en el puerto
4199 (`-c _pw-tmp.config.js`, no versionada).

## Qué falta / para decidir

- Si «Restaurar todos» debe respetar el filtro activo.
- Si los cajones modales deben cerrarse con Escape (hoy ninguno lo hace).
- Aprobar las capturas base de Bandeja pendientes de la tarea anterior.
