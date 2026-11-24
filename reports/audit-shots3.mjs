// Auditoría 3: importación completa (revisión), modal de apps, editor de diseño, menús de ficha.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'reports/audit-2026-11-23';
fs.mkdirSync(OUT, { recursive: true });
const CSV = path.resolve('scripts/fixtures/import/contactos-asociacion-empresa.csv');
const browser = await chromium.launch();

async function shot(name, url, width, act, full = false) {
  const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 900 : 800 } });
  await page.goto(`http://localhost:4173${url}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  if (act) await act(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.log(name, 'listo');
  await page.close();
}

// 1. Importación completa hasta la revisión
const fullImport = async (page) => {
  await page.locator('#imp-file').setInputFiles(CSV);
  await page.waitForTimeout(800);
  await page.click('[data-act="next1"]');
  await page.waitForTimeout(600);
  await page.click('[data-act="next2"]');
  await page.waitForTimeout(1000);
  await page.check('#imp-consent');
  await page.waitForTimeout(400);
  await page.click('[data-act="finish"]');
  await page.waitForTimeout(4000);
};
await shot('import-revision-1440', '/data/import/', 1440, fullImport, true);

// 2. Modal «Aplicaciones conectadas»
await shot('datahub-modal-apps-1440', '/data/', 1440, async (page) => {
  await page.click('[data-act="apps"]');
  await page.waitForTimeout(1500);
});

// 3. Editor de diseño de la ficha (personalizar) — guardar y recargar
await shot('layout-editor-1280', '/layout/?type=contacts', 1280, null, true);

// 4. Menú «Acciones» de la ficha
await shot('ficha-menu-acciones-1440', '/contacts/', 1440, async (page) => {
  await page.locator('.table tbody tr td a').first().click();
  await page.waitForTimeout(1500);
  await page.locator('button:has-text("Acciones")').first().click();
  await page.waitForTimeout(600);
});

// 5. Panel de vista previa: hacer scroll al final para ver el corte
await shot('lista-preview-scroll-1440', '/contacts/', 1440, async (page) => {
  const row = page.locator('.table tbody tr').first();
  await row.hover();
  const eye = row.locator('button[aria-label*="prevista" i], button[aria-label*="preview" i], .row-prev, [data-preview]').first();
  if (await eye.count()) await eye.click(); else await row.click();
  await page.waitForTimeout(1200);
  const panel = page.locator('.preview, aside.preview, [class*="preview"]').last();
  await panel.evaluate((el) => { const s = el.querySelector('.preview__body') || el; s.scrollTop = s.scrollHeight; });
  await page.waitForTimeout(500);
});

// 6. Tab «Actividades» de la ficha
await shot('ficha-tab-actividades-1440', '/contacts/', 1440, async (page) => {
  await page.locator('.table tbody tr td a').first().click();
  await page.waitForTimeout(1500);
  const tab = page.locator('.rtabs button:has-text("Actividades"), [role="tab"]:has-text("Actividades")').first();
  if (await tab.count()) { await tab.click(); await page.waitForTimeout(1000); }
}, true);

await browser.close();
console.log('OK');
