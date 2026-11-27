// Copia temporal de playwright.config.js en el puerto 4199 (el 4173 lo ocupa otro carril). No versionar.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
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
