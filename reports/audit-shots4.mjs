// Auditoría 4: tickets, empresas, pestañas de ficha, panel previsualización.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const OUT = 'reports/audit-2026-11-23';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

async function shot(name, url, width, act, full = false) {
  const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 900 : 800 } });
  await page.goto(`http://localhost:4173${url}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  if (act) await act(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.log(name, 'listo');
  await page.close();
}

await shot('tickets-lista-1440', '/tickets/', 1440);
await shot('tickets-kanban-1440', '/tickets/', 1440, async (page) => {
  const toggle = page.locator('[aria-label*="tablero" i], [data-view="board"], .vtoggle button').last();
  if (await toggle.count()) await toggle.click();
  await page.waitForTimeout(900);
});
await shot('empresas-lista-1440', '/companies/', 1440);
await shot('ficha-empresa-1440', '/companies/', 1440, async (page) => {
  await page.locator('.table tbody tr td a').first().click();
  await page.waitForTimeout(1600);
}, true);
await shot('ficha-ticket-1440', '/tickets/', 1440, async (page) => {
  await page.locator('.table tbody tr td a').first().click();
  await page.waitForTimeout(1600);
}, true);
// pestaña Descripción e Información avanzada de la ficha de contacto
await shot('ficha-tab-descripcion-1440', '/contacts/', 1440, async (page) => {
  await page.locator('.table tbody tr td a').first().click();
  await page.waitForTimeout(1500);
  const tab = page.locator('.rtabs [data-tab]:has-text("Descripción")').first();
  if (await tab.count()) { await tab.click(); await page.waitForTimeout(800); }
}, true);
await shot('ficha-tab-avanzada-1440', '/contacts/', 1440, async (page) => {
  await page.locator('.table tbody tr td a').first().click();
  await page.waitForTimeout(1500);
  const more = page.locator('.rtabs [data-tab]:has-text("Información avanzada"), .rtabs__more').first();
  if (await more.count()) { await more.click(); await page.waitForTimeout(500); const t2 = page.locator('.menu__item:has-text("Información avanzada")').first(); if (await t2.count()) await t2.click(); await page.waitForTimeout(800); }
}, true);

await browser.close();
console.log('OK');
