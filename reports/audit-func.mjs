// Pruebas funcionales de personalización (robusta, con pasos).
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(6000);
const log = (...a) => console.log('»', ...a);

try {
  await page.goto('http://localhost:4173/contacts/', { waitUntil: 'networkidle' });
  await page.locator('.table tbody tr td a').first().click();
  await page.waitForTimeout(1500);
  const before = await page.locator('#rec-props .props__row dt').allTextContents();
  log('props antes:', before.length, JSON.stringify(before.slice(0, 4)));

  await page.locator('.props__custom [data-act="customize-props"], .card [data-act="customize-props"].icon-btn').first().click();
  await page.waitForTimeout(700);
  log('modal abierto:', await page.locator('.drawer.is-open').count());
  const firstCheck = page.locator('[data-cardkey]').first();
  const keyName = await firstCheck.getAttribute('data-cardkey');
  log('desmarco:', keyName);
  await firstCheck.click({ force: true });
  await page.waitForTimeout(300);
  await page.locator('[data-confirm="card-save"]').click({ force: true });
  await page.waitForTimeout(900);
  const after = await page.locator('#rec-props .props__row dt').allTextContents();
  log('props tras guardar:', after.length);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const afterReload = await page.locator('#rec-props .props__row dt').allTextContents();
  log('props tras RECARGAR:', afterReload.length, afterReload.length === after.length ? 'PERSISTE' : 'NO PERSISTE');

  // revertir con Restablecer
  await page.locator('.props__custom [data-act="customize-props"], .card [data-act="customize-props"].icon-btn').first().click();
  await page.waitForTimeout(600);
  await page.locator('[data-confirm="card-reset"]').click({ force: true });
  await page.waitForTimeout(700);
  log('props tras restablecer:', (await page.locator('#rec-props .props__row dt').allTextContents()).length);
} catch (e) { console.log('FALLO test 1:', e.message.split('\n')[0]); }

try {
  await page.goto('http://localhost:4173/layout/?type=contacts', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  log('layout: botón guardar:', await page.locator('button:has-text("Guardar")').count());
  // mover la primera tarjeta de la columna derecha hacia abajo con su menú ⋯
  const cardKebab = page.locator('.ledit__card [aria-label*="opciones" i], .ledit__card .icon-btn').first();
  log('layout: tarjetas con ⋯:', await cardKebab.count());
} catch (e) { console.log('FALLO test 2:', e.message.split('\n')[0]); }

await browser.close();
console.log('FIN');
