// Test funcional: editor de diseño — mover tarjeta, guardar, recargar, verificar, revertir.
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(6000);
const log = (...a) => console.log('»', ...a);

await page.goto('http://localhost:4173/layout/?type=contacts', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// Tarjetas de la columna derecha (zona right): leer orden actual
const rightTitles = () => page.locator('.llist[data-zone="right"] .lcard .lcard__title').allTextContents().catch(() => []);
let antes = await rightTitles();
log('columna derecha antes:', JSON.stringify(antes));

// Abrir el menú ⋯ de la primera tarjeta de la columna derecha
const firstCard = page.locator('.llist[data-zone="right"] .lcard').first();
await firstCard.hover();
const kebab = firstCard.locator('button[aria-label="Más"]');
log('botones en tarjeta:', await firstCard.locator('button').count());
await kebab.click({ force: true });
await page.waitForTimeout(400);
const down = firstCard.locator('.menu__item:has-text("Mover abajo")');
if (await down.count()) {
  await down.click();
  await page.waitForTimeout(500);
  let despues = await rightTitles();
  log('tras mover abajo:', JSON.stringify(despues));
  // Guardar
  const save = page.locator('[data-lc="save"]');
  log('guardar habilitado:', await save.isEnabled().catch(() => 'n/a'));
  await save.click();
  await page.waitForTimeout(800);
  // Recargar y verificar
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  let trasReload = await rightTitles();
  log('tras RECARGAR:', JSON.stringify(trasReload), JSON.stringify(trasReload) === JSON.stringify(despues) ? 'PERSISTE' : 'NO PERSISTE');
  // Revertir: mover arriba la tarjeta que bajó
  const movedCard = page.locator('.llist[data-zone="right"] .lcard').nth(1);
  await movedCard.hover();
  await movedCard.locator('button').last().click({ force: true });
  await page.waitForTimeout(400);
  const up = movedCard.locator('.menu__item:has-text("Mover arriba")');
  if (await up.count()) { await up.click(); await page.waitForTimeout(400); await page.locator('[data-lc="save"]').click(); await page.waitForTimeout(600); log('revertido'); }
} else {
  log('NO hay «Mover abajo» — menú no abrió');
  await page.screenshot({ path: 'reports/audit-2026-11-23/layout-menu-fallo.png' });
}
await browser.close();
console.log('FIN');
