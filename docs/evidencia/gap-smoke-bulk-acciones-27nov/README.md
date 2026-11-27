# Evidencia — gap-smoke-bulk-acciones-27nov (27-nov-2026)

Pedido: `node scripts/smoke-bulk.mjs` falla en «contact actions»; revisar qué acciones muestra hoy la barra masiva
de Contactos, determinar si es regresión o prueba desactualizada, alinear y dejar el smoke en código 0.

## Diagnóstico: prueba desactualizada, no regresión

Antes del cambio (`node scripts/smoke-bulk.mjs`, árbol en `a40e793`):

```
[bulk] after 2 rows: bar hidden? false | count: 2 contactos seleccionados | highlighted rows: 2 | actions: → Asignar | Editar | Eliminar | + Crear tareas | Más
[bulk] FAIL: contact actions
```

La prueba esperaba el texto `→ Asignar|✎ Editar|🗑 Eliminar|+ Crear tareas|Más` (versión del 22-nov, `d88f1d2`).
La barra sigue teniendo **las mismas cinco acciones en el mismo orden** y el menú «Más» los mismos cuatro
secundarios (Inscribir en secuencia, Inscribir en workflow, Agregar a segmento, Exportar). Lo que cambió, por
decisión del usuario, es cómo se pintan dos iconos:

- «Eliminar»: el carácter 🗑 se sustituyó por el icono `trash` del catálogo (tarea del 25-nov, commit `bcb8690`).
- «Editar» en Contactos: el carácter ✎ se sustituyó por el icono `edit` del catálogo en la homogeneización del
  módulo de Contactos (27-nov, commit `d2518ae`; `src/list.js` L510 lo aplica solo cuando `cfg.type === 'contacts'`).

Un icono SVG no aporta `textContent`, así que los botones leen «Editar» y «Eliminar» a secas. Ningún botón
desapareció ni cambió de orden; ninguna acción dejó de funcionar (el resto del smoke, que ejercita Asignar, Editar,
Eliminar, Crear tareas, segmento y exportación, pasa sin cambios).

## Qué cambió (solo la prueba)

`scripts/smoke-bulk.mjs`, bloque «contact actions»:
- La expectativa pasa a `→ Asignar|Editar|Eliminar|+ Crear tareas|Más`.
- Se añade la comprobación de que «Editar» y «Eliminar» llevan su icono SVG (`.bulk__ico svg` dentro de
  `[data-action="bulk-edit"]` y `[data-action="delete"]`): `contact actions icons (edit, trash)`. Así la prueba
  sigue vigilando que los iconos estén, no solo el texto.

No se tocó código de la app, ni `app.css`, ni DESIGN.md: ninguna pantalla cambia, por eso no hay capturas
antes/después. Las barras de Empresas y Negocios siguen con «✎ Editar» (la homogeneización fue solo de Contactos)
y el smoke lo deja registrado en su salida.

## Pruebas

```
node scripts/smoke-bulk.mjs   → … [bulk] [contacts] OK … [bulk] OK   (código de salida 0)
```

Salida completa después del cambio: `smoke-bulk-despues.txt`. También en verde, sin cambios: `smoke-bulk-enroll`,
`smoke-bulk-tasks`, `smoke-bulk-workflow` (corridos antes del cambio para descartar que fallaran por lo mismo).
No hay otras pruebas (smokes ni Playwright) que esperen los glifos viejos (`grep "✎ Editar\|🗑 Eliminar"` sin
resultados). `npm run build` en verde; `rebuild_check` aprobado.

## Qué falta

Nada para esta tarea. Si más adelante se homogeneiza el icono `edit` en Empresas/Negocios/Tickets, la misma
expectativa de esta prueba para esos objetos («✎ Editar», líneas de companies/deals del smoke) tendrá que
actualizarse igual.
