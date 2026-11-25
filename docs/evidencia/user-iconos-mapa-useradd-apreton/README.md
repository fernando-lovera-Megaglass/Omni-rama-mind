# Evidencia — user-iconos-mapa-useradd-apreton (25-nov-2026)

Tres cambios en el sistema de iconos de línea (`src/action-icons.js`: viewBox 24×24, trazo 1.8px,
`stroke: currentColor`, `fill: none`), aprobados por el usuario en el catálogo `iconos.html` (sección 6).

## Qué cambió

1. **Nuevo `map`** en `ACT_ICONS`: mapa plegado en tres paneles
   (`<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>`). Propósito: direcciones y
   ubicación. Todavía no lo usa ninguna pantalla (queda en el catálogo para la próxima tarea que lo pida).
2. **Nuevo `user-add`** en `ACT_ICONS`: la misma cabeza (r3.5) y el cuerpo con arco de `user`, desplazados a la
   izquierda, más un «+» (`<circle cx="9.5" cy="8" r="3.5"/><path d="M3 20v-1a6.5 6.5 0 0 1 12-3.5"/><path
   d="M18.5 14v6M15.5 17h6"/>`). Propósito: agregar o invitar a una persona. Tampoco lo usa aún ninguna pantalla.
3. **`deal` pasa del diamante al apretón de manos** (trazo aprobado, cinco `path`). El alias `OBJECT_ICONS.deals`
   sigue apuntando a `deal`, así que cambia en todos sus usos sin tocar otro archivo.

**DESIGN.md §3 «Iconos»**: el catálogo de línea pasa de 66 a 68 (tabla de familias y lista), `map` y `user-add`
entran como nuevos con fecha y aprobación, la entrada de `deal` indica el apretón de manos (25-nov-2026, aprobado
por el usuario; antes un diamante) y una tabla nueva recoge trazo y propósito de los tres.

## Todos los sitios donde aparecía `deal` (grep `ACT_ICONS.deal` / `OBJECT_ICONS.deals` en `src/`)

| Sitio | Archivo | Tamaño al que se dibuja | Se lee bien |
|---|---|---|---|
| Registros asociados del panel de vista previa de las listas (icono por tipo de objeto, `.pvcard__record-icon`) | `src/list.js:2228` | 20px | sí (ver rejilla 20px). La tarjeta «Negocios» del panel no está activa en la distribución por defecto del modo demo, por eso la captura del panel no la muestra; el icono se dibuja ahí cuando el usuario la activa en «Personalizar» |
| «Crear negocio» en el menú «Más» de la ficha (y en la fila de acciones rápidas si el usuario lo sube ahí) | `src/record.js:408` | 17px en el menú (`.more-item__ico`), 18px en la fila (`.quick__ico svg`) | sí (`despues-ficha-menu-mas-<ancho>-recorte.png`) |
| `OBJECT_ICONS.deals` → Ajustes › Objetos (selector de objeto y páginas del objeto) | `src/settings.js:1010`, `src/action-icons.js:60` | 18px (`.objsel__ico svg`) | sí (`despues-ajustes-objetos-<ancho>.png`) |
| `OBJECT_ICONS.deals` → ilustración de estado vacío de Negocios (glifo dentro del distintivo naranja) | `src/empty-state.js:12` | ~17px dentro de un círculo de 34px | sí (`despues-negocios-estado-vacio-<ancho>-recorte.png`) |
| Barra lateral oscura | `src/shell.js` + `src/app.css` | — | **no aplica**: «Negocios» cuelga del módulo «Ventas», cuyo icono es la máscara `.ico--sales` (gráfica); no hay máscara `.ico--deal` ni clases `.m-*` en `app.css`, así que no se tocó |

Observación ajena a la tarea: `src/workflow-create.js:75` pide `ACT_ICONS[k]` con las claves de objeto
(`contacts`, `companies`, `deals`, `tickets`), que no existen en `ACT_ICONS` (existen en `OBJECT_ICONS`), así que
las opciones de «Elige el tipo de workflow» no muestran icono para ningún objeto, ni antes ni ahora. No se cambió
(no es un uso de `deal`); se deja para que el usuario decida.

## Capturas (antes / después, 1440 y 1280 px; `-recorte` es la zona ampliada)

| Pantalla | Archivos |
|---|---|
| Lista de negocios | `antes-/despues-lista-negocios-<ancho>.png` (no muestra el icono: la lista no lo usa; se incluye porque la tarea la pide) |
| Lista de contactos, panel de vista previa | `antes-/despues-contactos-vista-previa-<ancho>(-recorte).png` |
| Ficha de contacto, menú «Más» con «Crear negocio» | `despues-ficha-menu-mas-<ancho>(-recorte).png` con el menú abierto. En la pasada «antes» el menú no llegó a abrirse (la captura automática muestra la ficha cerrada), así que el diamante anterior se ve en `antes-rejilla-iconos-20-16-13-<ancho>.png`, no en el menú |
| Ajustes › Objetos (selector con icono) | `antes-/despues-ajustes-objetos-<ancho>.png` |
| Crear workflow (tipos de objeto) | `antes-/despues-crear-workflow-<ancho>(-recorte).png` (sin icono antes ni después, ver observación) |
| Negocios sin resultados (estado vacío) | `antes-/despues-negocios-estado-vacio-<ancho>(-recorte).png` |
| **Rejilla de verificación** de `map`, `user-add`, `deal` y `user` a **20 / 16 / 13 px** sobre fondo claro, barra lateral oscura y color de enlace | `despues-rejilla-iconos-20-16-13-<ancho>.png` (página temporal montada con Playwright sobre el módulo real `src/action-icons.js`; no versionada). `antes-rejilla-…` muestra el diamante y «—» donde los nuevos aún no existían |

## Pruebas

- Suite completa (`contactos`, `pantallas`, `tipos-de-campo`, `selector-propietario`): **138 / 140**. Las dos
  que no pasan son las visuales de **Bandeja**, que ya estaban pendientes de aprobación del usuario desde la
  tarea del selector de propietario (17 píxeles: la flecha del campo «Asignar a»); este cambio no toca Bandeja.
  **Ninguna captura base cambia por el icono**: el `deal` no aparece en reposo en ninguna de las 30 pantallas
  base (ni en la lista de Negocios ni en Ajustes, cuya base muestra la sección General).
- Sin errores en consola (fixture). `npm run build` en verde. Sin `--update-snapshots`.
- Los dos iconos nuevos renderizados a 20/16/13 en la rejilla; el apretón se lee a 20 y 16 y queda
  reconocible a 13 (trazo denso: se recomienda no usarlo por debajo de 13).

Nota operativa: el puerto 4173 lo ocupa el servidor de desarrollo de otro carril y `playwright.config.js`
tiene `reuseExistingServer`; las corridas se hicieron con una copia temporal de la configuración en el puerto
4199 (`-c _pw-tmp.config.js`, no versionada).

## Qué falta / para decidir

- Dónde usar `map` y `user-add` (esta tarea solo los añade al catálogo).
- Si se corrige la falta de icono en «Elige el tipo de workflow» (`ACT_ICONS[k]` → `OBJECT_ICONS[k]`).
- Aprobar las capturas base de Bandeja pendientes de la tarea anterior.
