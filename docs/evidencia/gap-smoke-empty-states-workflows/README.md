# Evidencia — gap-smoke-empty-states-workflows (27-nov-2026)

Fallo reportado: `node scripts/smoke-empty-states.mjs` termina con
`FAIL: workflows: «Crear workflow» opens the «Desde cero» dialog` (precedido por el aviso de jsdom
«Not implemented: navigation to another Document»).

## Veredicto: prueba desactualizada, no regresión

- El 22-nov-2026 a las 15:39, el commit `78a2fb9` («Codex: gap-backend-workflows-motor-real») cambió a propósito
  la creación de workflows: el menú «Crear workflow» pasó de botones que abrían un diálogo (`data-wa="new-blank"`
  → modal con `#wfm-name`) a enlaces a la página de creación (`create/?mode=blank|template|ai`,
  `src/workflow-create.js`, pantalla `workflow-crear` de las capturas base). El CTA del estado vacío hace lo mismo:
  `src/automation.js` L254 `else if (a === 'create') { location.href = 'create/?mode=blank'; }`.
- El smoke se había actualizado por última vez esa misma mañana (`8f98c04`, 08:35), antes de ese cambio, y seguía
  esperando el diálogo. El flujo nuevo ya lo cubre `scripts/smoke-workflows.mjs` (enlaces del menú y la página
  `create/` en sus tres modos).
- La app no se toca: el comportamiento actual es el pedido en esa tarea.

## Qué cambió (`scripts/smoke-empty-states.mjs`, sección 6 «Workflows»)

- jsdom no sabe navegar, así que antes de importar `automation.js` la prueba sustituye el `location` global por un
  sustituto que conserva `href/search/pathname/origin/hash` y registra lo que se le asigna (`href =`, `assign`,
  `replace`). Es un shim en la prueba, no en la app (criterio de la tarea hermana `gap-smoke-empty-states-inbox`).
- Tras pulsar «Crear workflow» se exige que la dirección registrada sea exactamente `create/?mode=blank` y que no se
  haya abierto ningún `#wf-modal`; el resto (estado vacío con ilustración, título, texto, CTA; vista «eliminados»
  con «Ver todos los workflows») queda igual. Se actualizan el comentario de cabecera y el mensaje de registro.

## Pruebas

```
node scripts/smoke-empty-states.mjs   → [empty-states] OK, código 0
node scripts/smoke-workflows.mjs      → código 0 (sin cambios, comprobación de regresión del mismo módulo)
npm run build                         → en verde
```

Sin cambios en `src/`, en `app.css`, en DESIGN.md ni en capturas base; nada que capturar antes/después (solo cambia
un script de prueba).

## Qué falta

- Nada pendiente de esta tarea. La cola (`scripts/build-queue.json`) no se edita: el orquestador cierra.
