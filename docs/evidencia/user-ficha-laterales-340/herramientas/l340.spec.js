// Temporal, fuera del repo (sesión dueña, token en /tmp/l340-w/OWNER). FASE=antes|despues.
import fs from 'node:fs';
import { test, expect } from '/Users/fernandolovera/Documents/Craft Anything/app-hubspot-com/app/tests/fixtures.js';

const FASE = process.env.FASE || 'antes';
const OUT = `/tmp/l340-w/medidas/${FASE}`;
const EVID = '/Users/fernandolovera/Documents/Craft Anything/app-hubspot-com/app/docs/evidencia/user-ficha-laterales-340';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(EVID, { recursive: true });

const FICHAS = [
  { id: 'contacto', url: '/contacts/record/?id=1', recortes: true },
  { id: 'empresa', url: '/companies/record/?id=1', recortes: true },
  { id: 'negocio', url: '/deals/record/?id=1', recortes: false },
  { id: 'ticket', url: '/tickets/record/?id=1', recortes: false },
  { id: 'tarea', url: '/tasks/record/?id=1', recortes: false },
];

for (const f of FICHAS) {
  test(`l340 ${f.id}`, async ({ page }, testInfo) => {
    const w = testInfo.project.use.viewport.width;
    await page.goto(f.url);
    await page.locator('h1').first().waitFor({ state: 'visible', timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 }; };
      const cs = (el, props) => { if (!el) return null; const c = getComputedStyle(el); return Object.fromEntries(props.map((p) => [p, c.getPropertyValue(p)])); };
      const ctx = document.createElement('canvas').getContext('2d');
      const textW = (txt, font) => { ctx.font = font; return Math.round(ctx.measureText(txt).width * 10) / 10; };
      const out = { viewport: innerWidth, docScrollW: document.documentElement.scrollWidth };
      const rec = document.querySelector('.record');
      out.record = { rect: r(rec), ...cs(rec, ['grid-template-columns', 'gap']), className: rec?.className, cols: [...(rec?.children || [])].map((c) => ({ cls: c.className.split(' ').slice(0, 2).join(' '), rect: r(c) })) };
      const bar = document.getElementById('rec-tabs');
      out.rtabs = bar ? {
        rect: r(bar), scrollW: bar.scrollWidth, clientW: bar.clientWidth, isScroll: bar.classList.contains('is-scroll'),
        moreHidden: bar.querySelector('.rtabs__more')?.hidden, moreRect: r(bar.querySelector('.rtabs__more')),
        tabs: [...bar.querySelectorAll('.rtabs__tab, .rtabs__custom')].map((t) => ({ text: t.textContent.trim(), cls: t.className, hidden: t.hidden, rect: r(t), ...cs(t, ['font-size', 'font-weight', 'padding-left', 'padding-right', 'border-right-width', 'flex']), textW: textW(t.textContent.trim(), `${getComputedStyle(t).fontWeight} ${getComputedStyle(t).fontSize} ${getComputedStyle(t).fontFamily}`), textW128: textW(t.textContent.trim(), `${getComputedStyle(t).fontWeight} 12.8px ${getComputedStyle(t).fontFamily}`) })),
      } : null;
      const q = document.getElementById('quick-row');
      out.quick = q ? {
        rect: r(q), ...cs(q, ['flex-wrap', 'gap', 'column-gap']), card: r(q.closest('.card')), cardPadding: cs(q.closest('.card'), ['padding-left', 'padding-right']),
        btns: [...q.querySelectorAll('.quick')].map((b) => ({ text: b.textContent.trim(), rect: r(b), ...cs(b, ['font-size', 'font-weight', 'width', 'flex', 'white-space']), ico: r(b.querySelector('.quick__ico')), svg: r(b.querySelector('svg')), textW: textW(b.textContent.trim(), `600 ${getComputedStyle(b).fontSize} ${getComputedStyle(b).fontFamily}`), textW128: textW(b.textContent.trim(), `600 12.8px ${getComputedStyle(b).fontFamily}`) })),
      } : null;
      out.props = [...document.querySelectorAll('.record__left .props__row')].slice(0, 4).map((row) => ({ key: row.dataset.key, rect: r(row), ...cs(row, ['padding-top', 'padding-bottom']), dt: r(row.querySelector('dt')), dd: r(row.querySelector('dd')), ddMarginTop: cs(row.querySelector('dd'), ['margin-top'])?.['margin-top'] }));
      out.propsCount = document.querySelectorAll('.record__left .props__row').length;
      out.assocRows = [...document.querySelectorAll('.record__right .assoc-card__row')].slice(0, 4).map((row) => ({ text: row.textContent.trim().replace(/\s+/g, ' ').slice(0, 50), rect: r(row), ...cs(row, ['padding-top', 'padding-bottom', 'gap', 'row-gap', 'column-gap']) }));
      out.assocCard = r(document.querySelector('.record__right .assoc-card'));
      out.assocCardGap = cs(document.querySelector('.record__right .assoc-card'), ['gap']);
      out.leftCard = { rect: r(document.querySelector('.record__left .card')), ...cs(document.querySelector('.record__left .card'), ['padding-left', 'padding-right']) };
      return out;
    });
    fs.writeFileSync(`${OUT}/${f.id}-${testInfo.project.name}.json`, JSON.stringify(m, null, 1));
    await page.screenshot({ path: `${EVID}/${FASE}-ficha-${f.id}-${w}.png`, animations: 'disabled', caret: 'hide' });
    if (f.recortes) {
      await page.locator('.record__left .card').first().screenshot({ path: `${EVID}/${FASE}-ficha-${f.id}-tarjeta-recorte-${w}.png`, animations: 'disabled' });
      await page.locator('#rec-tabs').screenshot({ path: `${EVID}/${FASE}-ficha-${f.id}-pestanas-recorte-${w}.png`, animations: 'disabled' });
      const assoc = page.locator('.record__right .card').first();
      if (await assoc.isVisible()) await assoc.screenshot({ path: `${EVID}/${FASE}-ficha-${f.id}-asociaciones-recorte-${w}.png`, animations: 'disabled' });
    }
    expect(m.record).toBeTruthy();
  });
}
