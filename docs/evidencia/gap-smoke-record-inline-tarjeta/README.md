# Evidencia — smoke-record-inline, fallo del 27-nov-2026 («the customised card should show the saved custom property value»)

(La tarea original `gap-smoke-record-inline-tarjeta` del 21-nov no dejó carpeta de evidencia en el repo; este archivo
documenta el fallo del 27-nov y su arreglo.)

Fallo reportado: `node scripts/smoke-record-inline.mjs` termina con
`FAIL: the customised card should show the saved custom property value`.

## Veredicto: prueba desactualizada, no regresión

- La aserción (línea 168) comparaba el texto de la celda de valor con `'Sofía R.✎'`: el valor guardado **más el
  carácter ✎** del botón de editar que la celda contiene.
- El 27-nov la homogeneización de Contactos (`d2518ae`, aprobada por el usuario en `c660920`) sustituyó en las fichas
  de contacto el carácter ✎ por el icono de línea `edit` del catálogo (`src/record.js` L63:
  `PEN = type === 'contacts' ? ACT_ICONS.edit : '✎'`). Un SVG no aporta texto, así que la celda ahora dice
  `'Sofía R.'` y la comparación literal fallaba. El valor guardado **sí** se muestra: la tarjeta personalizada sigue
  mostrando la propiedad personalizada con su valor y con su lápiz.
- La app no se toca.

## Qué cambió (`scripts/smoke-record-inline.mjs`)

- La aserción compara solo el valor (quita un ✎ final si lo hubiera, para los objetos que siguen usando el carácter)
  y comprueba aparte que la fila conserva su botón de editar (`.props__edit`, con SVG en contactos).

## Pruebas

```
node scripts/smoke-record-inline.mjs   → [record-inline] OK, código 0
npm run build                          → en verde
```

Solo cambia un script de prueba: sin cambios en `src/`, `app.css`, DESIGN.md ni capturas base; nada que capturar.

## Qué falta

- Nada pendiente. La cola (`scripts/build-queue.json`) no se edita: el orquestador cierra.
