import { chromium } from '@playwright/test';
const BASE = 'http://localhost:4173';
const OUT = '/tmp/audit-24nov';
const browser = await chromium.launch();

async function sweep(page, tag, width) {
  const info = await page.evaluate(() => {
    const out = { emoji: [], nativeSelects: 0, promptUsage: 0, hscroll: [] };
    document.querySelectorAll('select').forEach(s => { if (s.offsetParent) out.nativeSelects++; });
    // emoji en UI (fuera de avatares con iniciales)
    const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
    document.querySelectorAll('button, a, .card, h1, h2, h3, h4, th, td, label, span.tip__text').forEach(el => {
      const t = (el.childElementCount === 0 ? el.textContent : '') || '';
      if (emojiRe.test(t) && el.offsetParent) {
        const c = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).slice(0,40);
        out.emoji.push(`${el.tagName}.${c}: ${t.trim().slice(0,40)}`);
      }
    });
    document.querySelectorAll('*').forEach(el => {
      if (el.scrollWidth > el.clientWidth + 6 && el.clientWidth > 40) {
        const cls = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || el.tagName);
        if (!/table|wrap|board|kanban|tabs|scroll|menu__panel|vp/i.test(cls)) out.hscroll.push(`${cls.slice(0,50)} ${el.scrollWidth}>${el.clientWidth}`);
      }
    });
    out.emoji = out.emoji.slice(0, 12);
    out.hscroll = out.hscroll.slice(0, 10);
    return out;
  });
  console.log(`[${tag} w${width}]`, JSON.stringify(info));
}

for (const width of [1440, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  // Revisión de importación
  await page.goto(BASE + '/data/import/review/?id=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/w${width}-revision.png` });
  await sweep(page, 'revision', width);

  // Ficha contacto
  await page.goto(BASE + '/contacts/record/?id=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${OUT}/w${width}-ficha.png` });
  await sweep(page, 'ficha', width);

  // Drawer crear contacto
  await page.goto(BASE + '/contacts/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.click('text=Agregar contactos').catch(()=>{});
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/w${width}-crear-contacto.png` });
  await sweep(page, 'crear-contacto', width);
  await page.keyboard.press('Escape');

  // Editar columnas (dialog)
  await page.goto(BASE + '/contacts/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const gear = page.locator('button[aria-label*="olumna"], button:has-text("Editar columnas")').first();
  if (await gear.count()) { await gear.click().catch(()=>{}); await page.waitForTimeout(700); }
  await page.screenshot({ path: `${OUT}/w${width}-editar-columnas.png` });
  await sweep(page, 'editar-columnas', width);

  await page.close();
}
await browser.close();
console.log('LISTO');
