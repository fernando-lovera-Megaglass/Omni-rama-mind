// Collapsible side columns on the record page (contacts, companies, deals, tickets), per the person's recurring
// report of the «squeezed» centre column: a toggle on the top edge of each side column folds it into a 44px rail,
// the centre takes the room, the choice is remembered per module (crm:<type>:record:cols), on windows under 1440px
// the right column folds by itself the first time, «Revisar asociaciones» opens it back, and the tab bar never
// squeezes its tabs (the ones that do not fit go into a «Más» menu; the bar scrolls only as a last resort).
// JSDOM has no layout, so the widths are checked statically on src/app.css and the «Más» folding is driven by
// shimmed clientWidth/scrollWidth. Run: node scripts/smoke-record-sidebars.mjs
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const TAG = 'record-sidebars';
const log = (...a) => console.log(`[${TAG}]`, ...a);
const fail = (msg) => { console.error(`[${TAG}] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const MODULES = ['contacts', 'companies', 'deals', 'tickets'];

// ---------------------------------------------------------------------------------------------------------------
// 1) the stylesheet: 300px sides, a centre that never drops under 560px, rails of 44px, an animated grid, tabs
//    that never shrink, no trace of the old single «side-toggle» that hid the right column with display:none
// ---------------------------------------------------------------------------------------------------------------
const cssRaw = readFileSync(resolve(here, '../src/app.css'), 'utf8');
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '');
const block = (selector, from = css) => {
  const i = from.indexOf(`\n${selector} {`);
  if (i < 0) return null;
  return from.slice(i, from.indexOf('}', i));
};
// every @media block for the query, joined (the stylesheet has several blocks per width)
const media = (query) => {
  const out = [];
  let i = css.indexOf(`@media (${query}) {`);
  while (i >= 0) {
    let depth = 0, end = css.length;
    for (let j = i; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}' && --depth === 0) { end = j; break; }
    }
    out.push(css.slice(i, end));
    i = css.indexOf(`@media (${query}) {`, end);
  }
  return out.join('\n');
};
const lastBlock = (selector, from = css) => {
  const i = from.lastIndexOf(`\n${selector} {`);
  return i < 0 ? null : from.slice(i, from.indexOf('}', i));
};
const base = block('.record');
if (!base || !/grid-template-columns:\s*300px minmax\(560px, 1fr\) 300px/.test(base)) fail('.record is a 300px / minmax(560px, 1fr) / 300px grid');
if (!/transition:\s*grid-template-columns/.test(base)) fail('.record animates its columns');
if (!/grid-template-columns:\s*44px minmax\(560px, 1fr\) 300px/.test(block('.record.is-left-collapsed') || '')) fail('left rail of 44px');
if (!/grid-template-columns:\s*300px minmax\(560px, 1fr\) 44px/.test(block('.record.is-right-collapsed') || '')) fail('right rail of 44px');
if (!/grid-template-columns:\s*44px minmax\(560px, 1fr\) 44px/.test(block('.record.is-left-collapsed.is-right-collapsed') || '')) fail('both rails');
if (/is-side-collapsed|\.side-toggle|tip__text--left/.test(css)) fail('the old single side toggle is gone from the stylesheet');
if (/\.record[^{]*\{[^}]*grid-template-columns[^}]*!important/.test(css)) fail('no !important on the record grid');
if (/\.content--record \.record \{/.test(css)) fail('no second grid for .content--record .record (one source of truth)');
if (!/display:\s*none/.test(block('.record__left.is-collapsed .record__colbody,\n.record__right.is-collapsed .record__colbody') || '')) fail('a folded column hides its cards');
const narrow = media('max-width: 1439px');
if (!/\.record \{[^}]*grid-template-columns:\s*300px minmax\(560px, 1fr\);/.test(narrow)) fail('under 1440px the open right column leaves the grid (two tracks)');
if (!/\.record__right \{[^}]*grid-column:\s*1 \/ -1/.test(narrow)) fail('under 1440px the open right column stacks below the centre');
if (!/\.record\.is-right-collapsed \.record__right \{[^}]*grid-column:\s*auto/.test(narrow)) fail('under 1440px the folded right column stays as a rail');
if (!/\.record\.is-right-collapsed \{[^}]*grid-template-columns:\s*300px minmax\(560px, 1fr\) 44px/.test(narrow)) fail('under 1440px the rail keeps a 560px centre');
if (!/\.record__right \.record__colbody \{[^}]*grid-template-columns:\s*repeat\(auto-fill, minmax\(300px, 1fr\)\)/.test(narrow)) fail('stacked right cards flow in a grid');
const phone = media('max-width: 900px');
if (!/grid-template-columns:\s*minmax\(0, 1fr\)/.test(phone) || !/\.record\.is-left-collapsed\.is-right-collapsed/.test(phone)) fail('under 900px every state is a single column');
const tab = lastBlock('.rtabs__tab');
if (!/flex:\s*1 0 auto/.test(tab) || !/white-space:\s*nowrap/.test(tab)) fail('.rtabs__tab fills the bar but never shrinks below its text');
if (!/overflow-x:\s*auto/.test(block('.rtabs.is-scroll') || '')) fail('.rtabs.is-scroll scrolls sideways as the last resort');
if (/overflow-x:\s*auto/.test(block('.rtabs') || '')) fail('.rtabs itself does not clip the «Más» menu');
if (!/display:\s*none/.test(block('.rtabs__tab[hidden]') || '')) fail('a folded tab is hidden');
if (!/writing-mode:\s*vertical-rl/.test(block('.record__left.is-collapsed .record__colbar-title,\n.record__right.is-collapsed .record__colbar-title') || '')) fail('the rail shows its title vertically');
if (!/#rec-right\.is-reviewing-assoc \.card--assoc \{/.test(css)) fail('«Revisar asociaciones» highlight follows the column body');
log('stylesheet: 300px sides, 560px centre, 44px rails, animated grid, tabs never shrink, old toggle gone');

// Width comparison (what the browser will compute from these rules): nav 72px + content padding 32px×2 = 136px of
// chrome, 16px gaps. Printed for the commit summary since no browser with a layout engine is available here.
const CHROME = 72 + 64, GAP = 16, SIDE = 300, RAIL = 44;
const centre = (win, left, right) => {
  const cols = [left, right].filter((w) => w !== null);
  return win - CHROME - GAP * cols.length - cols.reduce((a, b) => a + b, 0);
};
const before = { 1440: centre(1440, 320, 320), 1280: centre(1280, 300, null) };
const table = [
  ['1440px, ambas abiertas', before[1440], centre(1440, SIDE, SIDE)],
  ['1440px, derecha plegada', before[1440], centre(1440, SIDE, RAIL)],
  ['1440px, ambas plegadas', before[1440], centre(1440, RAIL, RAIL)],
  ['1280px, derecha plegada (sola, la 1.ª vez)', before[1280], centre(1280, SIDE, RAIL)],
  ['1280px, derecha abierta (se apila debajo)', before[1280], centre(1280, SIDE, null)],
  ['1280px, ambas plegadas', before[1280], centre(1280, RAIL, RAIL)],
  ['1512px (MacBook 14"), ambas abiertas', centre(1512, 320, 320), centre(1512, SIDE, SIDE)],
  ['1512px (MacBook 14"), derecha plegada', centre(1512, 320, 320), centre(1512, SIDE, RAIL)],
];
for (const [label, was, now] of table) {
  if (now < 560) fail(`${label}: centre ${now}px is under 560px`);
  log(`centre width · ${label}: before ${was}px → now ${now}px`);
}

// ---------------------------------------------------------------------------------------------------------------
// 2) the page on the four modules
// ---------------------------------------------------------------------------------------------------------------
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
let narrowWindow = false;
const useDom = (type, id) => {
  const dom = new JSDOM(`<!doctype html><body class="app" data-type="${type}"><aside id="sidenav"></aside><header id="topbar"></header><main class="content content--record" id="record-root"></main><div id="scrim"></div></body>`, { url: `http://localhost/${type}/record/?id=${id}`, pretendToBeVisual: true });
  for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = dom.window[k];
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.matchMedia = (q) => ({ matches: narrowWindow && /1439px/.test(q), addEventListener() {}, removeEventListener() {} });
};
useDom('contacts', 1);
const data = await import(resolve(here, '../src/data.js'));
let n = 0;
const open = async (type, id) => { useDom(type, id); await import(resolve(here, `../src/record.js?sidebars=${n++}`)); await wait(60); };
const $ = (id) => document.getElementById(id);
const grid = () => document.querySelector('.record');
const stored = (type) => JSON.parse(mem[`crm:${type}:record:cols`] || '{}');
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const state = () => `${grid().classList.contains('is-left-collapsed') ? 'L-folded' : 'L-open'}/${grid().classList.contains('is-right-collapsed') ? 'R-folded' : 'R-open'}`;

const ids = Object.fromEntries(MODULES.map((t) => [t, t === 'contacts' ? 1 : data.ALL[t]()[0].id]));
for (const type of MODULES) {
  await open(type, ids[type]);
  // the markup: a toggle on the top edge of each side column, the cards below it
  const left = $('rec-left-col'), right = $('rec-right-col');
  if (!left?.classList.contains('record__left') || !right?.classList.contains('record__right')) fail(`${type}: side column sections`);
  for (const [col, section] of [['left', left], ['right', right]]) {
    const bar = section.firstElementChild;
    if (!bar?.classList.contains('record__colbar')) fail(`${type}: the ${col} column starts with its bar`);
    const btn = $(`col-toggle-${col}`);
    if (!btn || !bar.contains(btn)) fail(`${type}: ${col} toggle sits in the column's top bar`);
    if (btn.getAttribute('aria-expanded') !== 'true' || !/Contraer columna/.test(btn.getAttribute('aria-label'))) fail(`${type}: ${col} toggle starts expanded`);
    if (btn.getAttribute('aria-controls') !== `rec-${col}`) fail(`${type}: ${col} toggle controls its body`);
    if (!section.querySelector('.record__colbody')?.isSameNode($(`rec-${col}`))) fail(`${type}: the ${col} body is #rec-${col}`);
  }
  if (!$('rec-left').contains($('rec-props')) || !$('rec-left').contains($('rec-left-extra'))) fail(`${type}: «Acerca de» and the extra cards live inside the left body`);
  if (!$('rec-right').querySelector('.card')) fail(`${type}: the right body renders its cards`);
  if (document.querySelector('.record__middle .col-toggle, #side-toggle')) fail(`${type}: no floating toggle on the centre column`);
  if (state() !== 'L-open/R-open') fail(`${type}: starts with both columns open (got ${state()}; previous module's choice must not leak)`);
  // fold the left column
  click($('col-toggle-left'));
  if (state() !== 'L-folded/R-open' || !left.classList.contains('is-collapsed')) fail(`${type}: left folds`);
  if ($('col-toggle-left').getAttribute('aria-expanded') !== 'false' || $('col-toggle-left-tip').textContent !== 'Expandir columna izquierda') fail(`${type}: left toggle reads «Expandir»`);
  if ($('col-toggle-left').querySelector('.col-toggle__chev').textContent !== '›') fail(`${type}: left chevron points right when folded`);
  if (stored(type).left !== 'collapsed') fail(`${type}: left state stored per module`);
  // fold the right column too
  click($('col-toggle-right'));
  if (state() !== 'L-folded/R-folded' || !right.classList.contains('is-collapsed')) fail(`${type}: right folds`);
  if ($('col-toggle-right').querySelector('.col-toggle__chev').textContent !== '‹') fail(`${type}: right chevron points left when folded`);
  if (stored(type).right !== 'collapsed') fail(`${type}: right state stored`);
  // the state survives a reload
  await open(type, ids[type]);
  if (state() !== 'L-folded/R-folded') fail(`${type}: folded state remembered after reload (got ${state()})`);
  // «Revisar asociaciones» opens the right column again
  click(document.querySelector('[data-act="review-assoc"]'));
  await wait(10);
  if (state() !== 'L-folded/R-open' || stored(type).right !== 'open') fail(`${type}: review-assoc opens the right column`);
  if (!$('rec-right').classList.contains('is-reviewing-assoc')) fail(`${type}: review-assoc highlights the right body`);
  // open the left again, reload: both open and remembered
  click($('col-toggle-left'));
  await open(type, ids[type]);
  if (state() !== 'L-open/R-open' || stored(type).left !== 'open') fail(`${type}: reopened state remembered`);
  if ('crm:record:side' in mem) fail('the old global key crm:record:side is never written');
  log(`${type}: toggles on both columns, fold/unfold, per-module persistence, review-assoc reopens`);
}
if (new Set(MODULES.map((t) => mem[`crm:${t}:record:cols`])).size < 1) fail('per-module keys');

// ---------------------------------------------------------------------------------------------------------------
// 3) a window under 1440px folds the right column by itself the first time; the person's choice wins afterwards
// ---------------------------------------------------------------------------------------------------------------
narrowWindow = true;
delete mem['crm:deals:record:cols'];
await open('deals', ids.deals);
if (state() !== 'L-open/R-folded') fail(`narrow first visit folds the right column (got ${state()})`);
if (stored('deals').auto !== 'right' || stored('deals').right !== 'collapsed') fail('narrow auto-fold is flagged so it happens once');
click($('col-toggle-right'));
if (state() !== 'L-open/R-open') fail('the person opens the right column on a narrow window');
await open('deals', ids.deals);
if (state() !== 'L-open/R-open') fail(`narrow reload keeps the person's choice (got ${state()})`);
// a module whose right column was explicitly opened on a wide window keeps it open on a narrow one
await open('tickets', ids.tickets);
if (state() !== 'L-open/R-open') fail(`an explicit «open» choice is kept on a narrow window (got ${state()})`);
narrowWindow = false;
log('narrow window: right column folds once by itself, the person\'s choice wins afterwards');

// ---------------------------------------------------------------------------------------------------------------
// 4) the tab bar: every tab in place when all fit; the ones that do not fit go into «Más» (active stays visible);
//    picking one from the menu brings it into the bar; the bar scrolls only when even that is not enough
// ---------------------------------------------------------------------------------------------------------------
await open('contacts', ids.contacts);
const bar = $('rec-tabs');
const tabs = () => [...bar.querySelectorAll(':scope > .rtabs__tab')];
const visible = () => tabs().filter((t) => !t.hidden);
const more = () => bar.querySelector('.rtabs__more');
if (tabs().length < 2) fail('the record has tabs');
if (!more() || !more().hidden || tabs().some((t) => t.hidden)) fail('without layout every tab stays visible and «Más» is hidden');
if (!bar.querySelector('.rtabs__custom')) fail('«Personalizar» stays at the end of the bar');
// fake a layout: each visible tab is 150px, «Más» + «Personalizar» take 260px
const TAB_W = 150, FIXED = 260;
let barWidth = 10000;
Object.defineProperty(bar, 'clientWidth', { get: () => barWidth, configurable: true });
Object.defineProperty(bar, 'scrollWidth', { get: () => visible().length * TAB_W + FIXED, configurable: true });
const refit = async () => { window.dispatchEvent(new window.Event('resize')); await wait(5); };
await refit();
if (more().hidden !== true || visible().length !== tabs().length) fail('a wide bar keeps every tab');
barWidth = 2 * TAB_W + FIXED; // room for two tabs
await refit();
if (visible().length !== 2 || more().hidden) fail(`two tabs fit, the rest fold into «Más» (visible ${visible().length})`);
if (!visible().some((t) => t.classList.contains('is-active'))) fail('the active tab never folds');
const folded = [...bar.querySelectorAll('#rec-tabs-more [data-tab]')];
if (folded.length !== tabs().length - 2) fail(`the «Más» menu lists the folded tabs (${folded.length})`);
if (bar.classList.contains('is-scroll')) fail('no sideways scroll while «Más» makes everything fit');
// pick a folded tab from the menu: it becomes active and comes out of the menu
const pickId = folded[folded.length - 1].dataset.tab;
click(bar.querySelector('.rtabs__more-btn'));
if (!more().classList.contains('is-open')) fail('«Más» opens its menu');
click(bar.querySelector(`#rec-tabs-more [data-tab="${pickId}"]`));
await wait(5);
const barNow = $('rec-tabs');
Object.defineProperty(barNow, 'clientWidth', { get: () => barWidth, configurable: true });
Object.defineProperty(barNow, 'scrollWidth', { get: () => [...barNow.querySelectorAll(':scope > .rtabs__tab')].filter((t) => !t.hidden).length * TAB_W + FIXED, configurable: true });
await refit();
const active = barNow.querySelector(':scope > .rtabs__tab.is-active');
if (!active || active.dataset.tab !== pickId || active.hidden) fail('the tab picked from «Más» is active and visible in the bar');
if (!$(`pane-${pickId}`) || $(`pane-${pickId}`).hidden) fail('its pane is shown');
if (barNow.querySelector(`#rec-tabs-more [data-tab="${pickId}"]`)) fail('the picked tab left the menu');
if (barNow.querySelector('.rtabs__more').classList.contains('is-open')) fail('the menu closed');
// not even one tab fits: the bar falls back to sideways scrolling, still without hiding the active tab
barWidth = 100;
await refit();
if (!barNow.classList.contains('is-scroll')) fail('when even the active tab overflows, the bar scrolls sideways');
if (!barNow.querySelector(':scope > .rtabs__tab.is-active') || barNow.querySelector(':scope > .rtabs__tab.is-active').hidden) fail('the active tab is never hidden');
log('tabs: all visible when they fit, overflow into «Más», pick from the menu, scroll as the last resort');

console.log(`[${TAG}] PASS: collapsible side columns on ${MODULES.join(', ')} with per-module memory, narrow-window auto-fold, and a tab bar that never squeezes`);
process.exit(0);
