import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const pages = {
  main: 'index.html',
  reports: 'reports/index.html',
  contacts: 'contacts/index.html',
  'contacts-record': 'contacts/record/index.html',
  companies: 'companies/index.html',
  'companies-record': 'companies/record/index.html',
  deals: 'deals/index.html',
  'deals-record': 'deals/record/index.html',
  tickets: 'tickets/index.html',
  'tickets-record': 'tickets/record/index.html',
  tasks: 'tasks/index.html',
  'tasks-record': 'tasks/record/index.html',
  layout: 'layout/index.html',
  views: 'views/index.html',
  settings: 'settings/index.html',
  data: 'data/index.html',
  'data-import': 'data/import/index.html',
  segments: 'segments/index.html',
};

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // es2022: data.js uses top-level await to load Supabase before first render.
    target: 'es2022',
    rollupOptions: {
      input: Object.fromEntries(Object.entries(pages).map(([k, p]) => [k, resolve(__dirname, p)])),
    },
  },
});
