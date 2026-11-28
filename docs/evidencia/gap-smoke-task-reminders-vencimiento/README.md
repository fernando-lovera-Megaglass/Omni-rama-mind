# Evidencia — gap-smoke-task-reminders-vencimiento (27-nov-2026)

Fallo reportado: `node scripts/smoke-task-reminders.mjs` termina con
`FAIL: not due yet: due=[["Llamar al arquitecto","2026-11-26T21:30:00.000Z"],["Visita técnica Cristales Norte",
"2026-11-24T15:00:00.000Z"]] …`: tareas con recordatorio del 24 y 26-nov aparecen como vencidas cuando la prueba
esperaba que no lo estuvieran.

## Veredicto: prueba sensible a la fecha (datos envejecidos), no regresión

- La sección 1 del smoke creaba tres tareas con fechas **fijas** (vencen el 25, 26 y 27-nov-2026; recordatorios el
  24-nov a las 9:00 y el 26-nov a las 15:30) y una cuarta con vencimiento el 30-nov. La sección 2 toma la hora real
  (`Date.now()`) y exige que no haya ningún recordatorio vencido antes de crear el que vence en 1 minuto.
- Cuando se escribió (20/21-nov, `edaea23`/`71b145c`) esas fechas estaban en el futuro; el 27-nov por la tarde los
  recordatorios del 24 y del 26 ya habían pasado y `dueReminders()` (`src/task-reminders.js` L21: pendiente y
  `reminderAt <= ahora`) los devuelve, que es lo correcto: un recordatorio pasado y no avisado está vencido.
- La lógica de vencidos no cambia; la app no se toca.

## Qué cambió (`scripts/smoke-task-reminders.mjs`, sección 1)

- Las fechas de las tareas pasan a ser **relativas a hoy** (`at(días, h, min)` y `ymd(días)` sobre la medianoche
  local de hoy): vencimientos a +3, +4, +5 y +6 días, recordatorio «1 día antes» a +2 días 09:00, recordatorio
  personalizado a +4 días 15:30. Así la sección 2 («nada vencido a la hora real») se cumple cualquier día que se
  corra.
- Las comprobaciones unitarias de `reminderFromDue()` con fechas fijas se mantienen: no dependen de la hora actual.
- El mensaje de registro muestra las fechas resultantes con `reminderText()` en lugar del texto fijo «24 nov 09:00».

## Pruebas

```
node scripts/smoke-task-reminders.mjs   → [task-reminders] OK, código 0
  (saved as 29 nov 2026 a las 09:00 (1 día antes), 1 dic 2026 a las 15:30 (custom), none)
npm run build                           → en verde
```

Solo cambia un script de prueba: sin cambios en `src/`, `app.css`, DESIGN.md ni capturas base; nada que capturar.

## Qué falta

- Nada pendiente. La cola (`scripts/build-queue.json`) no se edita: el orquestador cierra.
