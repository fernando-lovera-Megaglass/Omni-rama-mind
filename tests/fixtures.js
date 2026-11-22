// Utilidades compartidas de las pruebas (regla C del proceso, 22-nov-2026).
//
// - El servidor de pruebas arranca SIN credenciales de Supabase (ver
//   playwright.config.js), así que la app corre en modo demo con datos
//   deterministas: src/data.js fija TODAY y construye los registros siempre
//   igual. Las capturas no cambian por los datos.
// - Reloj fijo por si alguna vista usa la fecha real ("hace 2 días", hoy).
import { test as base, expect } from '@playwright/test';

export const FIXED_NOW = new Date(2026, 10, 22, 9, 0, 0); // 22-nov-2026 09:00 local

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.install({ time: FIXED_NOW });
    const consoleErrors = [];
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console: ${msg.text()}`);
    });
    await use(page);
    // Regla C punto 9: ninguna pantalla puede tener errores en consola.
    expect(consoleErrors, `Errores en consola:\n${consoleErrors.join('\n')}`).toEqual([]);
  },
});

export { expect };

// Comprueba que los enlaces visibles "hacen algo": ningún <a> sin href o
// con href="#" (enlace muerto). Los botones se verifican pulsándolos en cada
// prueba de pantalla; aquí no se pueden detectar handlers addEventListener.
export async function deadLinks(page) {
  return page.$$eval('a', (els) => els
    .filter((el) => el.offsetParent !== null) // visibles
    .filter((el) => {
      const href = el.getAttribute('href');
      return !href || href === '#';
    })
    .map((el) => `a "${(el.textContent || '').trim().slice(0, 40)}"`));
}
