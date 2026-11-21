// DOM smoke test for the board cards (Negocios and Tickets): the clock of «última actividad», the info mark of the
// pill, the preview button and the «sin actividad programada» alert are line icons from src/action-icons.js
// (24 viewBox, currentColor), never the ◷ ⓘ ▭ ⚠ characters; the alert colour comes from the --c-warn token.
// Run: node scripts/smoke-board-icons.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[board-icons]', ...a);
const fail = (msg) => { console.error(`[board-icons] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const GLYPHS = /[◷ⓘ▭⚠]/;
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
function useDom(url) {
  const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', { url, pretendToBeVisual: true });
  for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'FormData', 'URL', 'Blob', 'MutationObserver']) globalThis[k] = dom.window[k];
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.confirm = () => true;
  return dom;
}
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const qa = (sel) => [...document.querySelectorAll(sel)];
const isLineIcon = (svg) => svg && svg.getAttribute('viewBox') === '0 0 24 24' && svg.getAttribute('stroke') === 'currentColor' && svg.getAttribute('stroke-width') === '1.8' && svg.getAttribute('fill') === 'none';
const checkCards = (label, cards) => {
  if (!cards.length) fail(`${label}: no cards on the board`);
  for (const card of cards) {
    if (GLYPHS.test(card.textContent)) fail(`${label}: card «${card.querySelector('.kcard__name')?.textContent}» still shows a text glyph`);
    const bad = [...card.querySelectorAll('svg')].filter((s) => !isLineIcon(s));
    if (bad.length) fail(`${label}: ${bad.length} svg(s) outside the 24-viewBox currentColor set`);
  }
  log(`${label}: ${cards.length} cards, no ◷ ⓘ ▭ ⚠, ${cards.reduce((n, c) => n + c.querySelectorAll('svg').length, 0)} line icons`);
};

// ---- static: tokens and colours ----
const css = readFileSync(resolve(here, '../src/app.css'), 'utf8');
if (!/:root \{[^}]*--c-warn: #f5a623/s.test(css) || !/\[data-theme="dark"\] \{[^}]*--c-warn:/s.test(css)) fail('--c-warn token missing in :root or dark');
if (!/\.kcard__alert \{[^}]*color: var\(--c-warn\)/s.test(css) || /\.kcard__alert \{[^}]*#f5a623/s.test(css)) fail('.kcard__alert must take its colour from --c-warn');
const { ACT_ICONS } = await import(resolve(here, '../src/action-icons.js'));
for (const k of ['clock', 'info', 'alert', 'preview']) if (!ACT_ICONS[k] || !ACT_ICONS[k].includes('viewBox="0 0 24 24"')) fail(`ACT_ICONS.${k} missing`);
for (const f of ['list.js', 'deals.js']) if (GLYPHS.test(readFileSync(resolve(here, `../src/${f}`), 'utf8').split('\n').filter((l) => /kcard/.test(l)).join('\n'))) fail(`src/${f}: a card line still carries a text glyph`);
log('tokens: --c-warn (light/dark), .kcard__alert via var(--c-warn); ACT_ICONS clock/info/alert/preview present');

// ---- Negocios board (custom card with the alert) ----
useDom('http://localhost/deals/');
await import(resolve(here, '../src/deals.js'));
await wait(30);
click(document.querySelector('button.views__tab[data-view="std:all"]'));
click(document.querySelector('[data-action="mode-board"]'));
await wait(30);
const dealCards = qa('.kcard');
checkCards('deals', dealCards);
const alert = document.querySelector('.kcard__alert');
if (!alert || !isLineIcon(alert.querySelector('svg')) || alert.getAttribute('aria-label') !== 'Sin actividad programada') fail('deals: the «sin actividad programada» alert must be the line icon with its label');
if (!document.querySelector('.kcard__pill-ico svg')) fail('deals: pill activity icon');

// ---- Tickets board (generic card: clock, info, preview) ----
useDom('http://localhost/tickets/');
await import(resolve(here, '../src/tickets.js'));
await wait(30);
click(document.querySelector('[data-action="mode-board"]'));
await wait(30);
const ticketCards = qa('.kcard');
checkCards('tickets', ticketCards);
const card = ticketCards[0];
for (const [sel, name] of [['.kcard__clock', 'clock'], ['.kcard__info', 'info'], ['[data-preview]', 'preview']]) {
  const el = card.querySelector(sel);
  if (!el || !isLineIcon(el.querySelector('svg'))) fail(`tickets: ${name} (${sel}) must be a line icon`);
}
if (!card.querySelector('.kcard__actions a svg') || !card.querySelector('[data-preview]').getAttribute('aria-label')) fail('tickets: action icons and preview label');
log('tickets: clock, info and preview are line icons next to the e-mail/note actions');
console.log('[board-icons] OK');
process.exit(0);
