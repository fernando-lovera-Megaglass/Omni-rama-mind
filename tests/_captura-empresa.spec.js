// Temporal (no versionar). Capturas antes/después para docs/evidencia/user-ficha-empresa-principal/.
// FASE=antes|despues. Ficha de Alicia Prieto (id 55, dos empresas) y lista de Contactos (fila 55).
import fs from 'node:fs';
import { test } from './fixtures.js';

const FASE = process.env.FASE || 'antes';
const DIR = 'docs/evidencia/user-ficha-empresa-principal';
fs.mkdirSync(DIR, { recursive: true });

const open = async (page, url, ready) => {
  await page.goto(url);
  await page.locator(ready).first().waitFor({ state: 'visible', timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
};
const clip = async (page, sel, pad = 8) => {
  const b = await page.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
  return { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: Math.min(b.width + pad * 2, 1440), height: Math.max(1, Math.min(b.height + pad * 2, 900)) };
};

test('ficha de contacto con dos empresas', async ({ page }, testInfo) => {
  const w = testInfo.project.use.viewport.width;
  await open(page, '/contacts/record/?id=55', 'h1:visible');
  await page.locator('.card--assoc[data-kind="companies"]').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${DIR}/${FASE}-ficha-contacto-55-${w}.png`, animations: 'disabled', caret: 'hide' });
  await page.screenshot({ path: `${DIR}/${FASE}-ficha-contacto-55-tarjeta-empresas-recorte-${w}.png`, clip: await clip(page, '.card--assoc[data-kind="companies"]'), animations: 'disabled', caret: 'hide' });
});

test('ficha de empresa con varios contactos', async ({ page }, testInfo) => {
  const w = testInfo.project.use.viewport.width;
  await open(page, '/companies/record/?id=1', 'h1:visible');
  await page.locator('.card--assoc[data-kind="contacts"]').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${DIR}/${FASE}-ficha-empresa-1-tarjeta-contactos-recorte-${w}.png`, clip: await clip(page, '.card--assoc[data-kind="contacts"]'), animations: 'disabled', caret: 'hide' });
});

test('lista de contactos: fila de Alicia Prieto', async ({ page }, testInfo) => {
  const w = testInfo.project.use.viewport.width;
  await open(page, '/contacts/', '#rows tr[data-id]');
  await page.locator('#rows tr[data-id="55"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${DIR}/${FASE}-lista-contactos-${w}.png`, animations: 'disabled', caret: 'hide' });
  // Recorte: la fila 55 con las dos filas vecinas para comparar alturas.
  const rows = page.locator('#rows tr[data-id]');
  const idx = await rows.evaluateAll((trs) => trs.findIndex((tr) => tr.dataset.id === '55'));
  const top = rows.nth(Math.max(0, idx - 1));
  const bot = rows.nth(Math.min(idx + 1, (await rows.count()) - 1));
  const a = await top.evaluate((el) => el.getBoundingClientRect().top);
  const b = await bot.evaluate((el) => el.getBoundingClientRect().bottom);
  await page.screenshot({ path: `${DIR}/${FASE}-lista-contactos-fila-55-recorte-${w}.png`, clip: { x: 0, y: Math.max(0, a - 4), width: w, height: Math.min(b - a + 8, 900) }, animations: 'disabled', caret: 'hide' });
  const hs = await rows.evaluateAll((trs) => trs.slice(0, 10).map((tr) => `${tr.dataset.id}:${Math.round(tr.getBoundingClientRect().height)}`));
  fs.appendFileSync(`${DIR}/alturas-filas.txt`, `${FASE} ${w}px: ${hs.join(' ')}\n`);
});
