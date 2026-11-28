// Temporal, fuera del repo: mediciones y capturas de la tarea user-ficha-laterales-340.
import { defineConfig } from '/Users/fernandolovera/Documents/Craft Anything/app-hubspot-com/app/node_modules/@playwright/test/index.mjs';

const APP = '/Users/fernandolovera/Documents/Craft Anything/app-hubspot-com/app';

export default defineConfig({
  testDir: '/tmp/l340-w/tests',
  timeout: 90000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4223', locale: 'es-MX', timezoneId: 'America/Mexico_City', colorScheme: 'light' },
  projects: [
    { name: 'w1440', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'w1280', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run dev -- --port 4223 --strictPort',
    cwd: APP,
    url: 'http://localhost:4223',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
