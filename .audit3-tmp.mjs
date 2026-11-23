// Verificaciones DOM: overflow de tablas, kanban, diálogos, moneda.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const BASE = 'http://localhost:4173';
const OUT = '/tmp/audit-omni';

const browser = await chromium.launch();

// --- A. Overflow horizontal de tablas de lista a 1280 y 1440
for (const [name, url, width] of [
  ['contacts', '/contacts/', 1280], ['contacts', '/contacts/', 1440],
  ['deals', '/deals/', 1440], ['tickets', '/tickets/', 1280], ['tasks', '/tasks/', 1440],
]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.clock.install({ time: new Date(2026, 10, 22, 9, 0, 0) });
  await page.goto(BASE + url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const wrap = document.querySelector('.tablewrap, .list__table, .table')?.closest('div') || document.querySelector('table')?.parentElement;
    const tbl = document.querySelector('table');
    const cont = document.documentElement;
    const out = {
      pageScroll: cont.scrollWidth > cont.clientWidth ? `PÁGINA desborda: sw=${cont.scrollWidth} cw=${cont.clientWidth}` : 'página ok',
    };
    if (tbl) {
      let el = tbl, chain = [];
      while (el && el !== document.body) {
        const cs = getComputedStyle(el);
        chain.push(`${el.className || el.tagName}: sw=${el.scrollWidth} cw=${el.clientWidth} ox=${cs.overflowX}`);
        el = el.parentElement;
        if (chain.length > 6) break;
      }
      out.chain = chain;
      // última celda visible vs corte
      const r = tbl.getBoundingClientRect();
      out.tableRect = `table right=${Math.round(r.right)} vs viewport=${window.innerWidth}`;
    }
    return out;
  });
  console.log(`--- ${name} @${width}:`, JSON.stringify(m, null, 1));
  await page.close();
}

// --- B. Kanban de negocios
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.clock.install({ time: new Date(2026, 10, 22, 9, 0, 0) });
  await page.goto(BASE + '/deals/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const segs = await page.locator('.seg button, .seg a, [class*="seg"] button').all();
  console.log('seg buttons:', segs.length);
  for (const s of segs) console.log('  seg:', (await s.getAttribute('aria-label')) || (await s.textContent()).trim(), await s.getAttribute('class'));
  if (segs[1]) { await segs[1].click(); await page.waitForTimeout(800); }
  await page.screenshot({ path: `${OUT}/deals-kanban-w1440.png` });
  await page.close();
}

// --- C. Diálogo Editar columnas + Acciones masivas en contactos
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.clock.install({ time: new Date(2026, 10, 22, 9, 0, 0) });
  await page.goto(BASE + '/contacts/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const gear = page.locator('button[aria-label*="olumna"], .gear, button:has-text("⚙")').first();
  // botón + de agregar columna
  const addCol = page.locator('.table th:last-child button, button[title*="columna" i]').first();
  if (await addCol.count()) { await addCol.click(); await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/editar-columnas-w1440.png` }); await page.keyboard.press('Escape'); }
  // selección masiva
  const cb = page.locator('.table tbody tr input[type=checkbox]').first();
  await cb.check();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/bulk-bar-w1440.png` });
  await page.close();
}
await browser.close();
console.log('listo B/C');
