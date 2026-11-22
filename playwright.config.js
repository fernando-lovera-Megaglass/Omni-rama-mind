// Playwright — Omni CRM (regla del usuario, 22-nov-2026).
// Pruebas visuales (toHaveScreenshot) y funcionales por pantalla, a 1440px y 1280px.
//
// IMPORTANTE (punto 10 del proceso): las capturas base SOLO se generan o
// actualizan cuando el usuario aprueba la pantalla. Ningún constructor puede
// correr con --update-snapshots para hacer pasar una prueba.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    colorScheme: 'light', // capturas siempre en tema claro
    // Datos fijos: las respuestas de Supabase se interceptan (ver tests/fixtures.js),
    // así las capturas no cambian por los datos.
  },
  // Las capturas base solo se crean si faltan; actualizarlas requiere aprobación
  // del usuario (ver CLAUDE.md punto 4). No usar --update-snapshots.
  updateSnapshots: 'missing',
  projects: [
    { name: 'w1440', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'w1280', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    // Sin credenciales de Supabase la app arranca en modo demo (localStorage),
    // con datos deterministas (TODAY fijo en src/data.js) y sin login.
    command: 'VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run dev -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
