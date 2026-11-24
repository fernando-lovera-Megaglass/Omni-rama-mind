import { chromium } from '@playwright/test';
const BASE = 'http://localhost:4173';
const OUT = '/tmp/audit-24nov';
const browser = await chromium.launch();

async function overflowInfo(page) {
  return await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('*').forEach((el) => {
      const cs = getComputedStyle(el);
      // elementos con scroll horizontal interno no deseado
      if (el.scrollWidth > el.clientWidth + 6 && el.clientWidth > 0) {
        const cls = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || el.tagName;
        if (!/table-wrap|kanban|board|tabs|scroll/i.test(String(cls))) {
          bad.push(`HSCROLL ${String(cls).slice(0,60)} sw=${el.scrollWidth} cw=${el.clientWidth}`);
        }
      }
    });
    return { docW: document.documentElement.scrollWidth, winW: innerWidth, bad: bad.slice(0, 20) };
  });
}

for (const width of [1440, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0,140)); });

  // 1. Wizard paso 3 (modo) — necesitamos pasar por pasos 1 y 2
  await page.goto(BASE + '/data/import/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/w${width}-import-p1.png` });
  // subir un csv de prueba
  const csv = 'nombre,email,telefono\nAna,ana@x.com,123\nLuis,luis@x.com,456';
  const input = page.locator('input[type=file]').first();
  if (await input.count()) {
    await input.setInputFiles({ name: 'prueba.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/w${width}-import-p1-archivo.png` });
    // continuar al mapeo
    const next = page.locator('button:has-text("Siguiente"), button:has-text("Continuar")').first();
    if (await next.count()) { await next.click(); await page.waitForTimeout(1200); }
    await page.screenshot({ path: `${OUT}/w${width}-import-p2-mapeo.png`, fullPage: false });
    const next2 = page.locator('button:has-text("Siguiente"), button:has-text("Continuar")').first();
    if (await next2.count()) { await next2.click(); await page.waitForTimeout(1200); }
    await page.screenshot({ path: `${OUT}/w${width}-import-p3.png`, fullPage: false });
    const next3 = page.locator('button:has-text("Siguiente"), button:has-text("Continuar"), button:has-text("Finalizar"), button:has-text("Importar")').first();
    if (await next3.count()) { await next3.click(); await page.waitForTimeout(1200); }
    await page.screenshot({ path: `${OUT}/w${width}-import-p4.png`, fullPage: false });
  }
  console.log('import', width, JSON.stringify(await overflowInfo(page)));

  // 2. Página de revisión de importación
  await page.goto(BASE + '/data/import/review/?id=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/w${width}-import-revision.png` });
  console.log('revision', width, JSON.stringify(await overflowInfo(page)));

  // 3. Ficha de contacto — cronología y menús
  await page.goto(BASE + '/contacts/record/?id=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/w${width}-ficha.png` });
  console.log('ficha', width, JSON.stringify(await overflowInfo(page)));

  // tab Actividad
  const act = page.locator('a:has-text("Actividad"), button:has-text("Actividad")').first();
  if (await act.count()) { await act.click().catch(()=>{}); await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}/w${width}-ficha-actividad.png` }); }

  await page.close();
}
await browser.close();
console.log('LISTO');
