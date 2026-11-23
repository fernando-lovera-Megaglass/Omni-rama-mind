// Recorrido interactivo: wizard de importación, ficha, panel de vista previa, kanban.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:4173';
const OUT = '/tmp/audit-omni';
fs.mkdirSync(OUT, { recursive: true });
const CSV = '/Users/fernandolovera/Documents/Craft Anything/app-hubspot-com/app/scripts/fixtures/import/contactos-asociacion-empresa.csv';

const browser = await chromium.launch();
for (const width of [1440, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.clock.install({ time: new Date(2026, 10, 22, 9, 0, 0) });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  // 1. Wizard paso 1
  await page.goto(BASE + '/data/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.click('text=Importar datos');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/wizard1-w${width}.png` });

  // 2. Subir CSV -> paso 2 mapeo
  const input = page.locator('input[type=file]').first();
  if (await input.count()) {
    await input.setInputFiles(CSV);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/wizard1b-archivo-w${width}.png` });
    const next = page.locator('[data-act="next1"]');
    if (await next.isEnabled()) {
      await next.click();
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/wizard2-mapeo-w${width}.png`, fullPage: false });
      // paso 3
      const next2 = page.locator('[data-act="next2"]');
      if (await next2.count() && await next2.isEnabled()) {
        await next2.click();
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${OUT}/wizard3-opciones-w${width}.png` });
      }
    }
  } else {
    console.log('NO file input en wizard paso 1 @' + width);
  }

  // 3. Ficha de contacto
  await page.goto(BASE + '/contacts/record/?id=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/ficha-contacto-w${width}.png` });

  // 4. Lista contactos -> abrir vista previa (ojo / preview)
  await page.goto(BASE + '/contacts/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const eye = page.locator('[data-action*="preview"], .row-preview, button[title*="vista"], .table tbody tr').first();
  // intenta abrir preview con el botón de la fila si existe
  const pvBtn = page.locator('.table tbody tr button').first();
  if (await pvBtn.count()) { await pvBtn.click(); await page.waitForTimeout(600); }
  await page.screenshot({ path: `${OUT}/lista-preview-w${width}.png` });

  // 5. Negocios tablero
  await page.goto(BASE + '/deals/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const boardBtn = page.locator('[data-view="board"], button:has-text("Tablero"), .seg button:has-text("Tablero")').first();
  if (await boardBtn.count()) { await boardBtn.click().catch(() => {}); await page.waitForTimeout(700); }
  await page.screenshot({ path: `${OUT}/deals-board-w${width}.png` });

  await page.close();
}
await browser.close();
console.log('listo');
