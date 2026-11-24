import { chromium } from '@playwright/test';
const BASE = 'http://localhost:4173';
const OUT = '/tmp/audit-24nov';
const browser = await chromium.launch();

for (const width of [1440, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  // 1. Revisión de importación REAL
  await page.goto(BASE + '/data/import/?id=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/w${width}-revision2.png`, fullPage: false });
  const url1 = page.url();
  console.log('revision URL:', url1, '| title:', await page.locator('h1, h2').first().textContent().catch(()=>'?'));

  // 2. Ficha: inspeccionar .slideover y selects nativos
  await page.goto(BASE + '/contacts/record/?id=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const info = await page.evaluate(() => {
    const r = {};
    r.docW = document.documentElement.scrollWidth;
    r.winW = innerWidth;
    r.slideovers = [...document.querySelectorAll('.slideover')].map(el => {
      const cs = getComputedStyle(el);
      return { sw: el.scrollWidth, cw: el.clientWidth, pos: cs.position, transform: cs.transform.slice(0,40), visible: el.offsetParent !== null, cls: el.className.slice(0,60) };
    });
    r.selects = [...document.querySelectorAll('select')].filter(s => s.offsetParent).map(s => {
      const card = s.closest('.card, .drawer, .bmodal, section, div');
      return (s.name || s.id || s.className || '?') + ' :: ' + ((card && card.querySelector('h2,h3,h4,.card__title')) ? card.querySelector('h2,h3,h4,.card__title').textContent.trim().slice(0,40) : '?');
    });
    return r;
  });
  console.log(`ficha w${width}:`, JSON.stringify(info, null, 1));

  // 3. Vista previa (preview panel) desde la lista
  await page.goto(BASE + '/contacts/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const prevBtn = page.locator('button[aria-label*="ista previa"], .js-preview, [data-preview]').first();
  if (await prevBtn.count()) { await prevBtn.click().catch(()=>{}); await page.waitForTimeout(800); }
  await page.screenshot({ path: `${OUT}/w${width}-preview.png` });

  // 4. Kanban tickets
  await page.goto(BASE + '/tickets/?view=board', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const bb = page.locator('button[aria-label="Vista de panel"]').first();
  if (await bb.count()) { await bb.click().catch(()=>{}); await page.waitForTimeout(800); }
  await page.screenshot({ path: `${OUT}/w${width}-tickets-kanban.png` });

  // 5. Ficha de ticket (barra de etapas)
  await page.goto(BASE + '/tickets/record/?id=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/w${width}-ficha-ticket.png` });

  await page.close();
}
await browser.close();
console.log('LISTO');
