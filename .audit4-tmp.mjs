// Kanban, panel de creación, tab Personalizar de la ficha.
import { chromium } from '@playwright/test';
const BASE = 'http://localhost:4173';
const OUT = '/tmp/audit-omni';
const browser = await chromium.launch();

for (const width of [1440, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.clock.install({ time: new Date(2026, 10, 22, 9, 0, 0) });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  // Kanban de negocios (primer botón del seg = Vista de panel)
  await page.goto(BASE + '/deals/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const boardBtn = page.locator('button[aria-label="Vista de panel"]').first();
  if (await boardBtn.count()) { await boardBtn.click(); await page.waitForTimeout(900); }
  await page.screenshot({ path: `${OUT}/kanban-deals-w${width}.png` });

  // Panel crear contacto
  await page.goto(BASE + '/contacts/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.click('text=Agregar contactos');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/crear-contacto-w${width}.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Ficha: tab Personalizar
  await page.goto(BASE + '/contacts/record/?id=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const pers = page.locator('button:has-text("Personalizar"), a:has-text("Personalizar")').first();
  if (await pers.count()) { await pers.click(); await page.waitForTimeout(900); }
  await page.screenshot({ path: `${OUT}/ficha-personalizar-w${width}.png`, fullPage: false });

  await page.close();
}
await browser.close();
console.log('listo');
