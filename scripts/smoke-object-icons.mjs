// DOM smoke test for the object icons of Ajustes › Objetos: every object page shows a line SVG icon from the
// same set as the side navigation (viewBox 24, 1.8 stroke, currentColor — so the dark theme tints it like
// every other icon) and no emoji is left anywhere in the pane. Run: node scripts/smoke-object-icons.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[object-icons]', ...a);
const fail = (msg) => { console.error(`[object-icons] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="settings-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/settings/#obj-contacts' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
globalThis.location = dom.window.location;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.FormData = dom.window.FormData;
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
dom.window.confirm = () => true;
const EMOJI = /[👤🏢🤝🎫📦◫☑]/u;
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

const { ACT_ICONS, OBJECT_ICONS } = await import(resolve(here, '../src/action-icons.js'));
await import(resolve(here, '../src/settings.js'));
const expected = { contacts: ACT_ICONS.user, companies: OBJECT_ICONS.companies, deals: ACT_ICONS.deal, tickets: ACT_ICONS.ticket, tasks: ACT_ICONS.task, products: OBJECT_ICONS.products, custom: OBJECT_ICONS.custom };
for (const [key, svg] of Object.entries(OBJECT_ICONS)) {
  if (!/^<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"/.test(svg)) fail(`${key}: not a line icon of the shared set`);
  if (EMOJI.test(svg)) fail(`${key}: emoji`);
}
const seen = [];
for (const key of Object.keys(expected)) {
  location.hash = `#obj-${key}`;
  window.dispatchEvent(new window.Event('hashchange'));
  const pane = document.querySelector('.spane');
  const sel = document.querySelector('[data-objects-object]');
  if (!pane || !sel || sel.value !== key) fail(`object page ${key} did not open (${sel && sel.value})`);
  const ico = document.querySelector('.objsel__ico');
  const svg = ico && ico.querySelector('svg');
  if (!svg || svg.getAttribute('viewBox') !== '0 0 24 24' || svg.getAttribute('stroke') !== 'currentColor' || svg.getAttribute('stroke-width') !== '1.8') fail(`${key}: the selector must show a line SVG icon`);
  // compare through the parser (serialisation normalises self-closing tags and attribute order)
  const probe = document.createElement('span');
  probe.innerHTML = expected[key];
  if (ico.innerHTML.trim() !== probe.innerHTML.trim()) fail(`${key}: icon must be the shared one (${key === 'contacts' ? 'ACT_ICONS.user' : key})`);
  if (EMOJI.test(pane.textContent) || EMOJI.test(ico.textContent)) fail(`${key}: an emoji is still painted in Ajustes › Objetos`);
  seen.push(`${key}:${text(sel.selectedOptions[0])}`);
}
// the whole settings shell (navigation included) carries no object emoji either
if (EMOJI.test(document.getElementById('settings-root').textContent)) fail('emoji left in the settings page');
// the contacts icon is the same person motif as the side navigation's CRM entry (a line icon of the same set)
if (OBJECT_ICONS.contacts !== ACT_ICONS.user || !document.querySelector('.ico--crm')) fail('contacts icon / CRM navigation icon');
log(`object pages with line icons: ${seen.join(' | ')}`);
console.log('[object-icons] OK');
process.exit(0);
