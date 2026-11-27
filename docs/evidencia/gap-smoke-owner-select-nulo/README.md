# Evidencia — gap-smoke-owner-select-nulo (27-nov-2026)

Fallo reportado: `node scripts/smoke-owner-select.mjs` termina con
`TypeError: Cannot set properties of null (setting 'value')` en `input(o1.search, 'lau')` (línea 73): el buscador
del desplegable de propietario que la prueba quiere usar no existe.

## Veredicto: prueba desactualizada, no regresión

- La prueba es del 16-nov (`e0ae4c1`, «Desplegables de propietario con avatar y buscador») y daba por hecho que todo
  desplegable lleva un buscador.
- El 25-nov el usuario aprobó el selector de propietario ligero (`5b51c2c`, tarea
  `user-selector-propietario-ligero`, DESIGN.md §2 «Selector de propietario» y `tests/selector-propietario.spec.js`):
  **el buscador solo se dibuja con más de 8 personas**; con 8 o menos se listan todas las caras y, al abrir, el foco
  va a la persona elegida. El directorio demo tiene 5 personas (`OWNERS` de `src/data.js`), así que en la ficha no
  hay `input` de búsqueda y `o1.search` es `null`.
- No tiene que ver con el frontend de Contactos del 27-nov: `list.js`/`record.js` siguen montando el `<select>`
  marcado (`data-owner-select`) y `enhanceOwnerSelects()` lo envuelve igual; el resto de la prueba (panel de alta,
  «Asignar» masivo, editor de celda, cajón genérico de tickets, Bandeja, inscripción en secuencia) pasa sin cambios.
- La app no se toca.

## Qué cambió (`scripts/smoke-owner-select.mjs`, sección 1 «ficha»)

- En vez de escribir siempre en el buscador, la prueba aplica la regla aprobada: con más de 8 personas exige el
  buscador, escribe «lau» y comprueba que filtra a una opción; con 8 o menos exige que **no** haya buscador y que el
  foco esté en la opción seleccionada (`.osel__opt.is-selected`), y elige «Laura M.» directamente entre las
  opciones. El resto (cambio del `<select>`, evento `change`, cierre, guardado en la ficha) sigue igual.
- Comentario de cabecera y mensaje de registro actualizados a la regla.

## Pruebas

```
node scripts/smoke-owner-select.mjs   → [owner-select] OK, código 0
npm run build                         → en verde
```

Solo cambia un script de prueba: sin cambios en `src/`, `app.css`, DESIGN.md ni capturas base; nada que capturar.

## Qué falta

- Nada pendiente. La cola (`scripts/build-queue.json`) no se edita: el orquestador cierra.
