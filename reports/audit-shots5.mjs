// Auditoría 5: menú +, acciones de lista, barra masiva, notificaciones.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const OUT = 'reports/audit-2026-11-23';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

async function shot(name, url, width, act) {
  const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 900 : 800 } });
  page.setDefaultTimeout(6000);
  await page.goto(`http://localhost:4173${url}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  try { if (act) await act(page); } catch (e) { console.log(name, 'ACCIÓN FALLÓ:', e.message.split('\n')[0]); }
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name, 'listo');
  await page.close();
}

await shot('topbar-menu-mas-1440', '/contacts/', 1440, async (page) => {
  await page.locator('.topbar button:has-text("+"), .topbar [aria-label*="Crear" i], .topbar .icon-btn:has-text("+")').first().click({ timeout: 4000 });
  await page.waitForTimeout(500);
});
await shot('lista-menu-acciones-1440', '/contacts/', 1440, async (page) => {
  await page.locator('button:has-text("Acciones")').first().click();
  await page.waitForTimeout(500);
});
await shot('lista-bulk-1440', '/contacts/', 1440, async (page) => {
  await page.locator('.table tbody tr input[type="checkbox"]').nth(0).click({ force: true });
  await page.locator('.table tbody tr input[type="checkbox"]').nth(1).click({ force: true });
  await page.waitForTimeout(700);
});
await shot('topbar-notificaciones-1440', '/contacts/', 1440, async (page) => {
  await page.locator('.topbar [aria-label*="notific" i], .topbar .icon-btn:has-text("🔔")').first().click({ timeout: 4000 });
  await page.waitForTimeout(700);
});
await shot('topbar-ayuda-1440', '/contacts/', 1440, async (page) => {
  await page.locator('.topbar [aria-label*="ayuda" i], .topbar [aria-label*="help" i]').first().click({ timeout: 4000 });
  await page.waitForTimeout(700);
});

await browser.close();
console.log('OK');
