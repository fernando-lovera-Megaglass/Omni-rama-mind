// Temporal (no versionar): solo para tests/_sp12.spec.js. Capturas de referencia temporales en /tmp
// (nunca toca tests/*-snapshots). Puerto 4199 porque el 4173 lo ocupa otro carril.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './_sp12-tests',
  testMatch: /_sp12(-extra)?\.spec\.js/,
  timeout: 90000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  snapshotPathTemplate: '/tmp/sp12-base/{arg}-{projectName}{ext}',
  use: {
    baseURL: 'http://localhost:4199',
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    colorScheme: 'light',
  },
  updateSnapshots: 'missing',
  projects: [
    { name: 'w1440', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'w1280', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run dev -- --port 4199 --strictPort',
    url: 'http://localhost:4199',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
