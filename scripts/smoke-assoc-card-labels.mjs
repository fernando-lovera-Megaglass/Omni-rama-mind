// Regression for the «Etapa del negocio:» label stacked letter by letter on the association cards (record page of
// the four modules). overflow-wrap is inherited: a flex item squeezed to its min-content with «anywhere» stacks its
// characters. The rules must keep the overflow protection on the VALUES while every LABEL of a flex row stays on one
// line and never shrinks. Checked statically on src/app.css (JSDOM has no layout) and on the rendered cards' markup
// (label + value structure the rules rely on). Run: node scripts/smoke-assoc-card-labels.mjs
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const TAG = 'assoc-card-labels';
const log = (...a) => console.log(`[${TAG}]`, ...a);
const fail = (msg) => { console.error(`[${TAG}] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const css = readFileSync(resolve(here, '../src/app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// ---- parse rules: selector → merged declarations (later rules win, as in the cascade for equal specificity) ----
const rules = [];
const re = /([^{}]+)\{([^{}]*)\}/g;
let m;
while ((m = re.exec(css))) {
  const selectors = m[1].replace(/\s+/g, ' ').trim();
  if (!selectors || selectors.startsWith('@')) continue;
  const decls = Object.fromEntries(m[2].split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const i = d.indexOf(':'); return [d.slice(0, i).trim(), d.slice(i + 1).trim()]; }));
  selectors.split(',').map((s) => s.trim()).forEach((selector) => rules.push({ selector, decls }));
}
const declsOf = (selector) => Object.assign({}, ...rules.filter((r) => r.selector === selector).map((r) => r.decls));

// 1) the label of an association row: one line, never shrunk, no character wrapping
const label = declsOf('.assoc-card__row > .muted');
if (label['white-space'] !== 'nowrap' || !/^0 0 auto$/.test(label.flex || '') || label['overflow-wrap'] !== 'normal') fail(`the row label must be nowrap, flex 0 0 auto, overflow-wrap normal (${JSON.stringify(label)})`);
// 2) the values keep the overflow protection and take the rest of the row
for (const sel of ['.assoc-card__row > a', '.assoc-card__row > .acard-stage']) {
  const d = declsOf(sel);
  if (d['overflow-wrap'] !== 'anywhere' || d['min-width'] !== '0' || !/^1 1 auto$/.test(d.flex || '')) fail(`${sel}: the value wraps inside itself and takes the rest (${JSON.stringify(d)})`);
}
// 3) no flex row of the cards inherits «anywhere» from its container (that is what stacked the letters)
for (const sel of ['.assoc-card__row', '.assoc-card__head']) {
  const d = declsOf(sel);
  if (d['overflow-wrap'] === 'anywhere') fail(`${sel}: a flex container must not set overflow-wrap: anywhere (inherited by every label)`);
  if (d['flex-wrap'] !== 'wrap') fail(`${sel}: narrow cards drop the value to its own line (flex-wrap: wrap)`);
}
const head = declsOf('.assoc-card__head > a');
if (head['overflow-wrap'] !== 'anywhere' || !/^1 1 auto$/.test(head.flex || '')) fail('the record name of the card head wraps inside its own space');
const unlink = declsOf('.assoc-card__head .assoc-card__unlink');
if (unlink['white-space'] !== 'nowrap' || !/^0 0 auto$/.test(unlink.flex || '')) fail('«Desasociar» never shrinks');
// 4) the wrapping .tag override is scoped to the cards (elsewhere a tag keeps its one-line shape)
if (declsOf('.tag')['overflow-wrap'] === 'anywhere') fail('.tag must not wrap anywhere app-wide');
if (declsOf('.assoc-card .tag')['overflow-wrap'] !== 'anywhere') fail('association labels still wrap inside the cards');
// 5) every other «overflow-wrap: anywhere» sits on a block or a flex item that owns the full row, never on a flex
//    container whose text children compete with siblings
const anywhere = rules.filter((r) => r.decls['overflow-wrap'] === 'anywhere').map((r) => r.selector);
const flexContainers = anywhere.filter((sel) => declsOf(sel).display === 'flex' || declsOf(sel).display === 'inline-flex');
const allowed = new Set(['.subtasks label']); // checkbox + one text item: the text is the only flexible item
const offenders = flexContainers.filter((sel) => !allowed.has(sel));
if (offenders.length) fail(`flex containers with overflow-wrap: anywhere (labels inside would stack): ${offenders.join(', ')}`);
log(`estático: ${anywhere.length} reglas con overflow-wrap: anywhere; ninguna en un contenedor flex con hijos que compitan; etiqueta de fila nowrap y sin encoger`);

// ---- rendered markup: every association row is <span class="muted">label:</span> + value, on the four modules ----
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const useDom = (type, id) => {
  const dom = new JSDOM(`<!doctype html><body class="app" data-type="${type}"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>`, { url: `http://localhost/${type}/record/?id=${id}`, pretendToBeVisual: true });
  for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = dom.window[k];
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
};
useDom('contacts', 1);
const data = await import(resolve(here, '../src/data.js'));
let n = 0;
for (const type of ['contacts', 'companies', 'deals', 'tickets']) {
  const id = type === 'contacts' ? 1 : data.ALL[type]()[0].id;
  useDom(type, id);
  await import(resolve(here, `../src/record.js?acl=${n++}`));
  await wait(60);
  const rows = [...document.querySelectorAll('.assoc-card .assoc-card__row')];
  if (!rows.length) fail(`${type}: association rows on the record`);
  const bad = rows.filter((row) => { const first = row.firstElementChild; return !(first && first.classList.contains('muted') && /:$/.test(first.textContent.trim())) || !row.querySelector(':scope > a, :scope > select.acard-stage'); });
  if (bad.length) fail(`${type}: every row is a .muted label ending in «:» followed by a value (${bad.length} differ)`);
  const stage = rows.find((row) => /Etapa del negocio:/.test(row.textContent));
  if (type === 'contacts' && (!stage || !stage.querySelector(':scope > select.acard-stage'))) fail('contacts: the deal card row «Etapa del negocio:» exists with its stage select as the value');
  log(`${type}: ${rows.length} filas etiqueta + valor en las tarjetas de asociación${stage ? ' (incluida «Etapa del negocio:» con su selector)' : ''}`);
}
console.log(`[${TAG}] OK`);
process.exit(0);
