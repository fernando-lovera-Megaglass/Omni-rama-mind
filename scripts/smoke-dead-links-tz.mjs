// DOM smoke test: no dead links on «Administrar vistas» (the info band of the four modules had two anchors that did
// nothing) and no invented time zone on the «Última actualización» dates of Configuración › Objetos (record views
// and preview views): the suffix is the browser's real zone abbreviation (Intl), so «CST» only appears when the
// browser really is in CST. The date part is checked under two zones by re-running this file as a child process
// with TZ=Europe/Madrid and TZ=America/Mexico_City. Run: node scripts/smoke-dead-links-tz.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const me = fileURLToPath(import.meta.url);
const TAG = 'dead-links-tz';
const log = (...a) => console.log(`[${TAG}]`, ...a);
const fail = (msg) => { console.error(`[${TAG}] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tzNow = (d = new Date()) => (new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(d).find((p) => p.type === 'timeZoneName') || {}).value || '';
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear() { Object.keys(mem).forEach((k) => delete mem[k]); } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const GLOBALS = ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option'];
const useDom = (html, url) => {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  for (const k of GLOBALS) globalThis[k] = dom.window[k];
  dom.window.confirm = () => true;
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return dom;
};
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
let n = 0;

// ---- child mode: the dates of Configuración › Objetos under the TZ of this process ----
if (process.argv.includes('--dates')) {
  useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="settings-root"></main><div id="scrim"></div></body>', 'http://localhost/settings/#obj-contacts');
  await import(resolve(here, '../src/data.js'));
  await import(resolve(here, `../src/settings.js?dl=${n++}`));
  await wait(30);
  const cells = (tab) => { click(q(`[data-objects-tab="${tab}"]`)); return qa('.rvtable tbody tr td:nth-child(4) > div:first-child').map(text); };
  // the zone's abbreviations over the year (winter and summer time), what a date of that zone may end with
  const year = new Date().getFullYear();
  const abbrs = [...new Set([tzNow(new Date(year, 0, 15)), tzNow(new Date(year, 6, 15))])];
  const out = { tz: tzNow(), abbrs, record: cells('record'), preview: cells('preview') };
  console.log(JSON.stringify(out));
  process.exit(0);
}

// ---- static: no fixed « CST» suffix left in the formatters ----
for (const f of ['settings.js', 'integration.js', 'segments.js']) {
  if (/ CST`/.test(readFileSync(resolve(here, `../src/${f}`), 'utf8')) || /\(CST\)/.test(readFileSync(resolve(here, `../src/${f}`), 'utf8'))) fail(`src/${f} still hard-codes CST`);
}
const mv = readFileSync(resolve(here, '../src/manage-views.js'), 'utf8');
if (/onclick="return false"|href="#"/.test(mv)) fail('manage-views.js still has anchors that do nothing');
log('estático: sin «CST» fijo en settings.js, integration.js ni segments.js; sin href="#" en manage-views.js');

// 1) «Administrar vistas» of the four modules: the band has no anchors, nothing on the page is a dead link
for (const type of ['contacts', 'companies', 'deals', 'tickets']) {
  useDom('<!doctype html><body class="app app--editor"><div id="views-root"></div></body>', `http://localhost/views/?type=${type}&tab=defaults`);
  await import(resolve(here, `../src/manage-views.js?dl=${n++}`));
  await wait(20);
  const band = q('.mv__banner');
  if (!band || !/Esta configuración ahora se aplica/.test(text(band))) fail(`${type}: the info band is still there`);
  if (band.querySelector('a') || /más información|Enviar feedback/.test(text(band))) fail(`${type}: the band keeps a dead link`);
  const dead = qa('#views-root a').filter((a) => { const h = a.getAttribute('href') || ''; return (!h || h === '#') && !a.dataset.action && !a.id; }).concat(qa('#views-root [onclick="return false"]'));
  if (dead.length) fail(`${type}: anchors that do nothing (${dead.map((a) => text(a)).join(' | ')})`);
}
log('Administrar vistas (4 módulos): banda sin enlaces muertos; ningún <a> sin destino en la página');

// 2) the dates of the views tables under two zones: the real abbreviation, «CST» only in a CST zone
const run = (tz) => {
  const r = spawnSync(process.execPath, [me, '--dates'], { encoding: 'utf8', timeout: 120000, env: { ...process.env, TZ: tz } });
  if (r.status !== 0) fail(`child under TZ=${tz} failed: ${(r.stderr || r.stdout).slice(-400)}`);
  const line = r.stdout.trim().split('\n').pop();
  try { return JSON.parse(line); } catch { return fail(`child output under TZ=${tz}: ${line}`); }
};
const checkZone = (tz, res, mustNotHave) => {
  if (!res.tz) fail(`${tz}: Intl gives no zone abbreviation`);
  const all = [...res.record, ...res.preview];
  if (!all.length) fail(`${tz}: no dates rendered`);
  const suffix = res.abbrs.map((a) => a.replace(/[+\-]/g, '\\$&')).join('|');
  const bad = all.filter((c) => !new RegExp(`^\\d{1,2} de [a-z]{3}\\. de \\d{4} \\d{2}:\\d{2} (${suffix})$`).test(c));
  if (bad.length) fail(`${tz}: dates must end with the browser's zone (${res.abbrs.join('/')}) (${bad.join(' | ')})`);
  if (mustNotHave && all.some((c) => c.includes(mustNotHave))) fail(`${tz}: dates carry «${mustNotHave}» although the browser is not there`);
  log(`TZ=${tz}: ${all.length} fechas con «${res.abbrs.join('» / «')}» (p. ej. «${all[0]}»)`);
};
const madrid = run('Europe/Madrid');
checkZone('Europe/Madrid', madrid, 'CST');
const mexico = run('America/Mexico_City');
checkZone('America/Mexico_City', mexico, null);
if (madrid.abbrs.join() === mexico.abbrs.join()) fail('the abbreviation follows the zone of the browser');
console.log(`[${TAG}] OK`);
process.exit(0);
