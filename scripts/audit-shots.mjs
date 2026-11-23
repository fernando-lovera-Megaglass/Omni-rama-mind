// Auditoría visual: capturas de las pantallas clave a 1440 y 1280.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const OUT = '/tmp/omni-audit';
fs.mkdirSync(OUT, { recursive: true });

const pages = [
  ['integracion', '/data/'],
  ['import-wizard', '/data/import/'],
  ['contactos-lista', '/contacts/'],
  ['contactos-ficha', '/contacts/record/?id=1'],
  ['empresas-ficha', '/companies/record/?id=1'],
  ['negocios-kanban', '/deals/?view=board'],
  ['negocios-lista', '/deals/'],
  ['tickets-lista', '/tickets/'],
  ['tickets-ficha', '/tickets/record/?id=1'],
];

const browser = await chromium.launch();
for (const width of [1440, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 800 }, locale: 'es-MX', timezoneId: 'America/Mexico_City' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  for (const [name, url] of pages) {
    try {
      await page.goto(`http://localhost:4173${url}`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(900);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${OUT}/${name}-${width}.png` });
      // dead links visibles en esta pantalla
      const dead = await page.$$eval('a', (els) => els.filter((el) => el.offsetParent !== null).filter((el) => { const h = el.getAttribute('href'); return !h || h === '#'; }).map((el) => `a "${(el.textContent || '').trim().slice(0, 50)}"`));
      if (dead.length) console.log(`DEAD-LINKS ${name} @${width}:`, JSON.stringify(dead.slice(0, 12)));
      console.log(`OK ${name} @${width}`);
    } catch (e) {
      console.log(`FAIL ${name} @${width}: ${e.message.split('\n')[0]}`);
    }
  }
  if (errors.length) console.log(`ERRORES CONSOLA @${width}:`, JSON.stringify([...new Set(errors)].slice(0, 10), null, 1));
  await ctx.close();
}
await browser.close();
console.log('DONE');
