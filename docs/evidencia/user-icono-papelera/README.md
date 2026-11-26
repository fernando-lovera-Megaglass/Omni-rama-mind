# Evidencia — user-icono-papelera (25-nov-2026)

Pedido del usuario: «falta el icono de la papelera». La app usaba el emoji 🗑 en cuatro sitios, fuera del
sistema de iconos y contra la homogeneización aprobada.

## Qué cambió

1. **Nuevo icono `trash`** en `ACT_ICONS` (`src/action-icons.js`), familia de línea (24×24, trazo 1.8px,
   `currentColor`): `<path d="M3.5 6h17"/><path d="M19 6v13.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8.5 6V4a2
   2 0 0 1 2-2h3a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>`, tal como se aprobó en el catálogo
   `iconos.html` (sección 6). A 13px se lee bien (ver «Quitar grupo» en el editor de workflows): **no hizo falta
   ajustar el trazo**.
2. **Los 4 emojis 🗑 se reemplazan por el icono** (opacidad .85 según DESIGN.md):
   | Sitio | Archivo | Tamaño |
   |---|---|---|
   | «Eliminar» de la barra de acciones masivas de las listas (Contactos, Empresas, Negocios, Tickets, Tareas) | `src/list.js` (`.bulk__btn` › `.bulk__ico`) | 16px |
   | «Eliminar grupo» del editor «Editar lógica de propiedad» | `src/settings.js` (`.icon-btn--round.icon-btn--sm[data-logic-group-rm]`) | 16px dentro del botón de 32px |
   | «Eliminar etapa» de las etapas del ciclo de vida | `src/settings.js` (`.lctrash`, `.icon-btn--sm`) | 16px dentro del botón de 32px |
   | «Quitar grupo» de los grupos de condiciones del editor de workflows | `src/workflow-editor.js` (`.wfg__h button[data-grp-del]`) | 13px, en línea con «Grupo N · o» |
3. **Entrada «Restaurar registros eliminados»** de los menús «Acciones» (Contactos, Empresas, Tickets) y «⋮»
   (Negocios, Tareas) lleva el icono delante, en un `.menu__ico` de 16px (los menús de columna ya llevan
   iconos `.ico` delante de sus entradas; esta es la variante para un icono de línea).
4. `src/app.css`: tamaños y opacidad del icono en cada contexto (`.bulk__btn .bulk__ico`, `.lctrash svg`,
   `.lgroup__head .icon-btn[data-logic-group-rm] svg`, `.wfg__h button[data-grp-del] svg` 13px) y la clase
   `.menu__item .menu__ico`. Sin tokens nuevos; `.lctrash` conserva su rojo literal `#c4381c` (ya documentado
   en «Inconsistencias», no se tocó).
5. **DESIGN.md §3**: catálogo de línea 68 → 69 (tabla de familias y lista), `trash` en la tabla de iconos
   aprobados el 25-nov con propósito «eliminar / papelera» y la regla: toda acción destructiva usa `trash`, los
   emojis 🗑 quedan prohibidos; la fila «Menú desplegable» documenta `.menu__ico`.

Ya no queda ningún «🗑» en `src/` (solo se menciona en documentación).

## Capturas (antes / después, 1440 y 1280 px; `-recorte` es la zona)

| Pantalla | Archivos |
|---|---|
| Barra masiva de Contactos con «Eliminar» (2 seleccionados) | `antes-/despues-barra-masiva-<ancho>(-recorte).png` |
| Menú «Acciones» con «Restaurar registros eliminados» | `antes-/despues-menu-acciones-<ancho>(-recorte).png` |
| Ajustes › Objetos › Contactos › Etapa del ciclo de vida: «Eliminar etapa» | `antes-/despues-ajustes-etapas-<ancho>(-recorte).png` |
| Editor «Editar lógica de propiedad» con dos grupos: «Eliminar grupo» | `antes-/despues-ajustes-logica-<ancho>(-recorte).png` |
| Editor de workflow, desencadenante con grupos: «Quitar grupo» | `antes-/despues-workflow-grupos-<ancho>(-recorte).png` |

## Pruebas (`tests/icono-papelera.spec.js`, modo demo, 1440 y 1280 px): **10 / 10 en verde**

1. Contactos: «Eliminar» de la barra masiva sin emoji, con el trazo `trash` a 16×16 y opacidad .85; sigue
   abriendo su diálogo de confirmación («Se eliminarán …»); la entrada del menú Acciones lleva el icono a 16px y
   abre la papelera; la página no contiene «🗑».
2. Negocios (menú «⋮»): la entrada también lleva el icono y abre la papelera.
3. Etapas del ciclo de vida: todos los `.lctrash` con el icono a 16px; una etapa borrable sigue pidiendo
   confirmación («¿Eliminar la etapa …?»).
4. Editor de lógica: con dos grupos, «Eliminar grupo» lleva el icono a 16px y quita el grupo (como antes, sin
   confirmación: comportamiento previo).
5. Editor de workflow: «Quitar grupo» lleva el icono a 13px y quita el grupo (como antes, sin confirmación).

Suite completa (`contactos`, `pantallas`, `tipos-de-campo`, `selector-propietario`, `papelera`,
`icono-papelera`): **158 / 160**. Las dos que no pasan son las visuales de **Bandeja** (17 píxeles de la
flecha del campo «Asignar a»), pendientes de aprobación del usuario desde la tarea del selector de propietario;
este cambio no toca Bandeja. **Ninguna captura base cambia por el icono**: el emoji no aparecía en reposo en
ninguna de las 30 pantallas base (la barra masiva, los menús, el editor de lógica y el panel del workflow se
abren con una acción). Sin errores en consola (fixture). `npm run build` en verde. Sin `--update-snapshots`.

Nota operativa: el puerto 4173 lo ocupa el servidor de desarrollo de otro carril y `playwright.config.js`
tiene `reuseExistingServer`; las corridas se hicieron con una copia temporal de la configuración en el puerto
4199 (`-c _pw-tmp.config.js`, no versionada). Otro carril (Kimi) ejecuta a veces la misma suite en paralelo en
esta carpeta; con esa carga alguna visual puede diferir por antialiasing del texto y repetida sola pasa.

## Qué falta / para decidir

- Aprobar las capturas base de Bandeja pendientes desde la tarea del selector de propietario.
- «Eliminar grupo» (lógica) y «Quitar grupo» (workflow) borran sin confirmación; es su comportamiento previo,
  no se cambió.
