// Auditoría visual automática de Omni (modo demo).
// Recorre las pantallas clave, captura a 1440 y 1280, y reporta:
//  - errores de consola
//  - enlaces muertos (a[href="#"] visibles)
//  - elementos con texto desbordado (scrollWidth > clientWidth)
//  - elementos aplastados (alto >> ancho por carácter -> posible apilado)
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:4173';
const OUT = '/tmp/audit-omni';
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  ['data', '/data/'],
  ['contacts', '/contacts/'],
  ['companies', '/companies/'],
  ['deals', '/deals/'],
  ['tickets', '/tickets/'],
  ['tasks', '/tasks/'],
];

async function audit(page, name, url, width) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(BASE + url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT}/${name}-w${width}.png` });

  const report = await page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const dead = [...document.querySelectorAll('a')].filter(vis)
      .filter((a) => !a.getAttribute('href') || a.getAttribute('href') === '#')
      .map((a) => `a "${(a.textContent || '').trim().slice(0, 50)}" @ ${a.className}`);
    const overflow = [...document.querySelectorAll('th, td, .chip, button, a, label, span, h1, h2, h3, h4')]
      .filter(vis)
      .filter((el) => el.scrollWidth > el.clientWidth + 2 && el.children.length === 0 || (el.scrollWidth > el.clientWidth + 2 && el.tagName === 'TD'))
      .slice(0, 30)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${el.tagName}.${(el.className || '').toString().slice(0, 40)} "${(el.textContent || '').trim().slice(0, 40)}" sw=${el.scrollWidth} cw=${el.clientWidth} @(${Math.round(r.x)},${Math.round(r.y)})`;
      });
    // posible texto apilado: contenedores estrechos con muchas líneas
    const squished = [...document.querySelectorAll('span, a, div, td, th, label')]
      .filter(vis)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const t = (el.textContent || '').trim();
        if (t.length < 4 || t.length > 40) return false;
        if (el.children.length > 0) return false;
        const lines = r.height / (parseFloat(getComputedStyle(el).lineHeight) || 16);
        const charsPerLine = t.length / lines;
        return lines >= 3 && charsPerLine <= 4; // 1-4 caracteres por línea
      })
      .slice(0, 20)
      .map((el) => `${el.tagName}.${(el.className || '').toString().slice(0, 40)} "${(el.textContent || '').trim()}"`);
    return { dead: dead.slice(0, 40), overflow, squished, title: document.title };
  });
  return { name, url, width, errors, ...report };
}

const browser = await chromium.launch();
const results = [];
for (const width of [1440, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.clock.install({ time: new Date(2026, 10, 22, 9, 0, 0) });
  for (const [name, url] of PAGES) {
    try {
      results.push(await audit(page, name, url, width));
    } catch (e) {
      results.push({ name, url, width, fatal: e.message });
    }
  }
  await page.close();
}
await browser.close();

for (const r of results) {
  console.log(`\n===== ${r.name} ${r.url} @${r.width} =====`);
  if (r.fatal) { console.log('FATAL:', r.fatal); continue; }
  if (r.errors.length) console.log('ERRORES CONSOLA:', r.errors.slice(0, 5));
  if (r.dead.length) console.log('ENLACES MUERTOS:', JSON.stringify(r.dead, null, 1));
  if (r.overflow.length) console.log('OVERFLOW:', JSON.stringify(r.overflow, null, 1));
  if (r.squished.length) console.log('APLASTADO:', JSON.stringify(r.squished, null, 1));
  if (!r.errors.length && !r.dead.length && !r.overflow.length && !r.squished.length) console.log('OK');
}
