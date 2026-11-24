// Capturas de auditoría: pantallas clave a 1440 y 1280.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const OUT = 'reports/audit-2026-11-23';
fs.mkdirSync(OUT, { recursive: true });

const shots = [
  // [nombre, url, acción opcional]
  ['datahub-1440', '/data/', null, 1440],
  ['datahub-1280', '/data/', null, 1280],
  ['import-paso1-1440', '/data/import/', null, 1440],
  ['contacts-lista-1440', '/contacts/', null, 1440],
  ['deals-kanban-1440', '/deals/?view=board', null, 1440],
];

const browser = await chromium.launch();
for (const [name, url, act, width] of shots) {
  const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 900 : 800 } });
  await page.goto(`http://localhost:4173${url}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  if (act) await act(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  // medir desbordes horizontales
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const over = [];
    document.querySelectorAll('table, .table-wrap, .card, .dint__card').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth + 4) over.push(`${el.className || el.tagName}: scroll ${el.scrollWidth} > ${el.clientWidth}`);
    });
    return { docW: doc.scrollWidth, winW: window.innerWidth, over: over.slice(0, 12) };
  });
  console.log(name, JSON.stringify(metrics));
  await page.close();
}
await browser.close();
console.log('OK');
