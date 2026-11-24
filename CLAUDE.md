# CLAUDE.md — Omni CRM

CRM de Megaglass. App Vite + Supabase en `app/`.

## Reglas de proceso (fijadas por el usuario el 23-nov-2026; reemplazan las del 22-nov)

1. **Estilo propio**: Omni NO copia HubSpot. Conserva el estilo de UI que tiene
   hoy en `mind`. Nadie rediseña ni «mejora» nada que el usuario no haya pedido.
2. **Un solo constructor**: Claude Code construye todo (UI y backend).
3. **Cambios de UI solo a petición**: cada cambio de UI lo pide el usuario, uno
   por uno, y se hace EXACTAMENTE lo pedido, nada más. Si la instrucción es
   ambigua o choca con DESIGN.md, se pregunta antes de construir. Las tareas de
   la cola con estado `backlog` NO se construyen: esperan decisión del usuario.
   Solo se construye lo que está en `pending` (aprobado).
4. **Sistema de diseño**: [`DESIGN.md`](./DESIGN.md) documenta los tokens y
   componentes que YA usa el diseño actual (colores, tipografía, espaciados,
   radios, alturas y paddings de botones, campos, filas e iconos). No se
   inventan valores nuevos. Todo cambio usa esos tokens; prohibido escribir
   valores sueltos de color, tamaño o espaciado.
5. **Pruebas y capturas base**: Playwright en `app/tests/` (`npx playwright
   test`), con MCP de Playwright declarado en `.mcp.json` para abrir Omni y ver
   lo que se construye antes de entregar. Cada pantalla tiene captura base a
   1440px y 1280px tal como está hoy (`app/tests/**/__snapshots__` o
   `-snapshots/`); sirven para detectar si un cambio movió algo que no se
   pidió. Las capturas base SOLO se actualizan cuando el usuario aprueba un
   cambio. Prohibido `--update-snapshots` por cuenta propia.
6. **Entrega de cada cambio**: captura antes/después de la zona cambiada en
   `docs/evidencia/<tarea>/`. Verificación obligatoria: cada botón y enlace de
   la pantalla hace algo; sin errores en consola; sin texto encimado ni cortado
   a 1440px y 1280px; elementos alineados con los tamaños de DESIGN.md; ninguna
   otra pantalla cambió (comparación contra capturas base). Si no se puede
   hacer tal como se pidió, se reporta qué no se pudo y por qué; no se entrega
   algo parecido como si fuera lo pedido.
7. **Cierre y aprobación**: el constructor no cierra tareas: deja evidencia y la
   cola marca `review`; Kimi revisa y cierra. Solo el usuario aprueba
   integraciones a `mind`. [`PANTALLAS.md`](./PANTALLAS.md) lleva el estado de
   cada pantalla.
8. **Backend**: cambios a la base de datos SOLO por migraciones
   (`supabase/*.sql`), con respaldo antes de cada una. PROHIBIDO borrar tablas,
   columnas o datos sin aprobación del usuario. Toda tarea de backend cierra
   con pruebas automáticas en verde, adjuntas a la evidencia. Desarrollo y
   pruebas contra base de datos de prueba, NUNCA contra datos reales.
9. **Auditorías**: las auditorías nocturnas comparan Omni contra DESIGN.md
   (tamaños distintos, desalineados, texto encimado o cortado, botones que no
   hacen nada, errores en consola) y SOLO reportan; el usuario decide qué se
   corrige.

## Comandos

```bash
cd app
npm run dev        # desarrollo local
npm run build      # build de producción (debe pasar siempre)
npx playwright test  # pruebas visuales y funcionales
```
