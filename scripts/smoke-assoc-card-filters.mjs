// DOM smoke test for «Editar tarjeta predeterminada» of the association cards (record page, four modules): «Gestionar
// filtros» opens a real editor (property / condition / value) whose filters apply to the card on save (and to the
// drawer's preview), persist with the card setting and survive a reload; the pencil edits the internal name for real;
// «Eliminar tarjeta» is not offered on the default cards; no visible button just shows an explanatory toast.
// Run: node scripts/smoke-assoc-card-filters.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const TAG = 'assoc-card-filters';
const log = (...a) => console.log(`[${TAG}]`, ...a);
const fail = (msg) => { console.error(`[${TAG}] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const RECORD = (type) => `<!doctype html><body class="app" data-type="${type}"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>`;
const GLOBALS = ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option'];
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear() { Object.keys(mem).forEach((k) => delete mem[k]); } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const useDom = (html, url) => {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  for (const k of GLOBALS) globalThis[k] = dom.window[k];
  dom.window.confirm = () => true;
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return dom;
};
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const change = (el, value) => { el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
let n = 0;
const openRecord = async (type, id) => { useDom(RECORD(type), `http://localhost/${type}/record/?id=${id}`); await import(resolve(here, `../src/record.js?acf=${n++}`)); await wait(60); };
const card = (kind) => q(`.card--assoc[data-kind="${kind}"]`);
const cardCount = (kind) => Number((text(card(kind).querySelector('.card__toggle')).match(/\((\d+)\)/) || [])[1]);
const cardNames = (kind) => [...card(kind).querySelectorAll('.assoc-card__head strong')].map(text);
const openEditor = (kind) => { click(q(`[data-act="acard-edit"][data-kind="${kind}"]`)); if ($('card-drawer').hidden) fail('the card editor opens'); };
const previewCount = () => Number((text(q('.cd-previewcard .card__toggle')).match(/\((\d+)\)/) || [])[1]);

// ---- static: the three dead handlers are gone ----
const src = readFileSync(resolve(here, '../src/record.js'), 'utf8');
if (/Las tarjetas predeterminadas no se pueden eliminar|se gestionan por etiqueta de asociación en esta versión|El nombre interno solo se usa en la configuración\.'\)/.test(src)) fail('record.js still answers those buttons with a toast');
log('estático: sin manejadores que solo lanzan un toast');

await import(resolve(here, '../src/data.js'));
const data = await import(resolve(here, '../src/data.js'));
// a company with several contacts, whose e-mails differ
const company = data.allCompanies().find((c) => data.allContacts().filter((x) => Number(x.companyId) === Number(c.id) && x.email).length >= 2);
if (!company) fail('a company with two or more contacts');
// every contact the card lists for the company (primary company or one of its linked companies)
const pool = data.allContacts().filter((x) => Number(x.companyId) === Number(company.id) || (x.assoc_companies || []).map(Number).includes(Number(company.id)));
const members = pool.filter((x) => x.email);
const target = members[0];
const needle = target.email.split('@')[0];
const expected = pool.filter((x) => `${x.email || ''}`.toLowerCase().includes(needle.toLowerCase()));

// 1) the editor: no «Eliminar tarjeta», a real filter editor, preview and card follow the filter
await openRecord('companies', company.id);
const before = cardCount('contacts');
if (before < 2 || before !== pool.length) fail(`the contacts card lists the members (${before} vs ${pool.length})`);
openEditor('contacts');
if (q('[data-cd="remove"]') || /Eliminar tarjeta/.test(text($('card-drawer')))) fail('«Eliminar tarjeta» is not offered on a default card');
if (!/Gestionar filtros/.test(text(q('[data-cd="filters"]')))) fail('«Gestionar filtros» button');
click(q('[data-cd="filters"]'));
if (!$('cd-filters') || !q('[data-cd="add-filter"]')) fail('«Gestionar filtros» opens the filter editor');
click(q('[data-cd="add-filter"]'));
const row = q('.cd-filter[data-fi="0"]');
if (!row || !row.querySelector('[data-cdf="key"]') || !row.querySelector('[data-cdf="op"]') || !row.querySelector('[data-cdf="value"]')) fail('a filter row with property, condition and value');
change(q('.cd-filter[data-fi="0"] [data-cdf="key"]'), 'email');
change(q('.cd-filter[data-fi="0"] [data-cdf="op"]'), 'contains');
change(q('.cd-filter[data-fi="0"] [data-cdf="value"]'), needle);
if (previewCount() !== expected.length) fail(`the drawer preview applies the filter (${previewCount()} vs ${expected.length})`);
if (!/1 filtro/.test(text(q('[data-cd="filters"]')))) fail(`the button counts the filters (${text(q('[data-cd="filters"]'))})`);
// the pencil edits the internal name
click(q('[data-cd="rename-internal"]'));
if (!$('cd-internal')) fail('the pencil opens the internal name for editing');
change($('cd-internal'), 'Contactos de la empresa (interno)');
if (text($('cd-internal-text')) !== 'Contactos de la empresa (interno)') fail(`the internal name is updated (${text($('cd-internal-text'))})`);
click(q('[data-cd="save"]'));
if (!$('card-drawer').hidden) fail('the editor closes on save');
const saved = JSON.parse(mem['crm:companies:assoccard:contacts']);
if (!saved || !Array.isArray(saved.filters) || saved.filters.length !== 1 || saved.filters[0].key !== 'email' || saved.filters[0].op !== 'contains' || saved.filters[0].value !== needle || saved.internal !== 'Contactos de la empresa (interno)') fail(`filters and internal name saved with the card (${JSON.stringify(saved)})`);
if (cardCount('contacts') !== expected.length || !cardNames('contacts').includes(target.name) || cardNames('contacts').length !== expected.length) fail(`the card applies the filter (${cardCount('contacts')} / ${cardNames('contacts').join(', ')})`);
log(`filtro «Correo contiene ${needle}» → tarjeta «Contactos (${cardCount('contacts')})» de ${before}; nombre interno guardado`);

// 2) reload: still filtered; the editor shows the filter chips and the internal name
await openRecord('companies', company.id);
if (cardCount('contacts') !== expected.length) fail('filter kept after a reload');
openEditor('contacts');
if (!/1 filtro/.test(text(q('[data-cd="filters"]'))) || !/contiene/.test(text(q('.cd-chips'))) || text($('cd-internal-text')) !== 'Contactos de la empresa (interno)') fail('the editor reads the saved filter and internal name back');
// known / unknown need no value; «no es igual a» excludes
click(q('[data-cd="filters"]'));
change(q('.cd-filter[data-fi="0"] [data-cdf="op"]'), 'unknown');
if (q('.cd-filter[data-fi="0"] [data-cdf="value"]')) fail('«no tiene valor» hides the value box');
if (previewCount() !== pool.filter((x) => !x.email).length) fail(`«Correo no tiene valor» → ${previewCount()} vs ${pool.filter((x) => !x.email).length}`);
change(q('.cd-filter[data-fi="0"] [data-cdf="op"]'), 'not');
change(q('.cd-filter[data-fi="0"] [data-cdf="value"]'), target.email);
if (previewCount() !== pool.length - pool.filter((x) => String(x.email || '').toLowerCase() === target.email.toLowerCase()).length) fail(`«Correo no es igual a» excludes the match (${previewCount()})`);
// remove the filter → everything back
click(q('[data-cdf-rm="0"]'));
if (previewCount() !== before || !/Gestionar filtros/.test(text(q('[data-cd="filters"]')))) fail('removing the filter shows every record again');
click(q('[data-cd="save"]'));
if (cardCount('contacts') !== before || JSON.parse(mem['crm:companies:assoccard:contacts']).filters.length) fail('saved without filters');
log('recarga mantiene el filtro; «no tiene valor» y «no es igual a» funcionan; quitar el filtro devuelve todos los registros');

// 3) reset clears filters and the internal name; other modules offer the same editor
openEditor('contacts');
click(q('[data-cd="reset"]'));
if (mem['crm:companies:assoccard:contacts'] || text($('cd-internal-text')) !== 'Contactos Tarjeta de asociación (Empresas)') fail(`reset clears the card setting (${text($('cd-internal-text'))})`);
click(q('[data-cd="close"]'));
for (const [type, kind] of [['contacts', 'deals'], ['deals', 'contacts'], ['tickets', 'contacts']]) {
  await openRecord(type, data.ALL[type]()[0].id);
  openEditor(kind);
  if (q('[data-cd="remove"]') || !q('[data-cd="filters"]') || !q('[data-cd="rename-internal"]')) fail(`${type}/${kind}: same editor without «Eliminar tarjeta»`);
  click(q('[data-cd="filters"]'));
  if (!q('[data-cd="add-filter"]')) fail(`${type}/${kind}: filter editor`);
  click(q('[data-cd="close"]'));
}
log('restablecer limpia filtros y nombre interno; contactos, negocios y tickets ofrecen el mismo editor');
console.log(`[${TAG}] OK`);
process.exit(0);
