// Auditoría profunda: wizard de importación con archivo real, ficha de registro, panel de vista previa.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'reports/audit-2026-11-23';
fs.mkdirSync(OUT, { recursive: true });
const CSV = path.resolve('scripts/fixtures/import/contactos-asociacion-empresa.csv');

const browser = await chromium.launch();
const ctx = await browser.newPage().then(p => p.context());

async function shot(name, url, width, act, full = false) {
  const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 900 : 800 } });
  await page.goto(`http://localhost:4173${url}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  if (act) await act(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  const over = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('*').forEach((el) => {
      if (el.children.length === 0 && el.textContent.trim()) {
        const r = el.getBoundingClientRect();
        // texto que se sale de su contenedor visible
        const p = el.closest('.card, td, th, button, .dint__card, .imp__card, .pvcard, label, a, section, .menu__item');
        if (p && (r.right > p.getBoundingClientRect().right + 6)) bad.push(`«${el.textContent.trim().slice(0, 40)}» (${el.tagName}.${String(el.className).slice(0, 30)}) sale ${Math.round(r.right - p.getBoundingClientRect().right)}px`);
      }
    });
    const scrolls = [];
    document.querySelectorAll('table, .table-wrap, .card, .dint__card, .imp__card, aside').forEach((el) => {
      if (el.scrollWidth > el.clientWidth + 4) scrolls.push(`${String(el.className).slice(0, 40)}: ${el.scrollWidth}>${el.clientWidth}`);
    });
    return { bad: bad.slice(0, 10), scrolls: scrolls.slice(0, 10) };
  });
  console.log(name, JSON.stringify(over));
  await page.close();
}

// 1. Wizard paso 2 con archivo real (mapeo) a 1440 y 1280
const withFile = async (page) => {
  const input = page.locator('#imp-file');
  await input.setInputFiles(CSV);
  await page.waitForTimeout(800);
  await page.click('[data-act="next1"]');
  await page.waitForTimeout(800);
};
await shot('wizard-paso2-1440', '/data/import/', 1440, withFile, true);
await shot('wizard-paso2-1280', '/data/import/', 1280, withFile, true);

// 2. Wizard paso 3 (detalles/duplicados)
const toStep3 = async (page) => {
  await withFile(page);
  await page.click('[data-act="next2"]');
  await page.waitForTimeout(1200);
};
await shot('wizard-paso3-1440', '/data/import/', 1440, toStep3, true);
await shot('wizard-paso3-1280', '/data/import/', 1280, toStep3, true);

// 3. Transferencia inteligente
await shot('wizard-transfer-1440', '/data/import/?transfer=1', 1440, null, true);

// 4. Ficha de contacto (primera de la lista)
const openRecord = async (page) => {
  const link = page.locator('.table tbody tr td a').first();
  await link.click();
  await page.waitForTimeout(1500);
};
await shot('ficha-contacto-1440', '/contacts/', 1440, openRecord, true);
await shot('ficha-contacto-1280', '/contacts/', 1280, openRecord, true);

// 5. Panel de vista previa en la lista (clic en «Vista previa»/ojo o clic en fila)
const openPreview = async (page) => {
  await page.waitForTimeout(500);
  const row = page.locator('.table tbody tr').first();
  await row.hover();
  const eye = row.locator('button[aria-label*="prevista" i], button[aria-label*="preview" i], .row-prev, [data-preview]').first();
  if (await eye.count()) await eye.click(); else await row.click();
  await page.waitForTimeout(1200);
};
await shot('lista-preview-1440', '/contacts/', 1440, openPreview);
await shot('lista-preview-1280', '/contacts/', 1280, openPreview);

await browser.close();
console.log('OK');
