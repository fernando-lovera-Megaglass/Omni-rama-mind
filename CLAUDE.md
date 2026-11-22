# CLAUDE.md — Omni CRM

Clon de HubSpot para Megaglass. App Vite + Supabase en `app/`.

## Reglas de proceso (fijadas por el usuario el 22-nov-2026)

1. **Carriles**: Claude Code es el único que toca UI (pantallas, componentes,
   estilos, `src/app.css`, HTML). Codex solo backend/lógica.
2. **Sistema de diseño**: [`DESIGN.md`](./DESIGN.md) es la fuente de verdad de
   tokens y componentes. Prohibido usar estilos o componentes que no estén ahí;
   si falta uno, primero se documenta en DESIGN.md.
3. **Referencia visual**: `docs/referencia-hubspot/` guarda las capturas del
   HubSpot real del usuario a 1440px y 1280px. Toda pantalla se compara con la
   suya antes de darse por terminada.
4. **Pruebas**: Playwright en `app/tests/` (`npx playwright test`). Ningún
   cambio se integra sin las pruebas visuales y funcionales en verde. Prohibido
   `--update-snapshots` para hacer pasar una prueba; las capturas base solo se
   actualizan cuando el usuario aprueba la pantalla.
5. **Definición de terminado (UI)**: captura antes/después con Playwright junto
   a la referencia en `docs/evidencia/<tarea>/`, sin texto encimado/cortado a
   1440px y 1280px, todos los botones funcionan, pruebas en verde.
6. **Cierre**: los constructores no cierran tareas. Dejan evidencia en
   `docs/evidencia/<tarea>/` y la cola marca `review`; Kimi revisa y cierra.
7. **Aprobación de pantallas**: ver [`PANTALLAS.md`](./PANTALLAS.md). Solo el
   usuario aprueba. No se avanza a la siguiente pantalla sin su aprobación.

## Comandos

```bash
cd app
npm run dev        # desarrollo local
npm run build      # build de producción (debe pasar siempre)
npm run test:e2e   # pruebas visuales y funcionales (Playwright)
```

El MCP de Playwright está declarado en `.mcp.json` para que Claude Code pueda
abrir Omni y ver lo que construye.
