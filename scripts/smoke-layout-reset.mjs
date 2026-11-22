// DOM smoke test: «Restablecer diseño predeterminado» in the layout editor keeps a team view's identity. A team view
// «Ventas» assigned to a team is edited, reset and saved: it is still called «Ventas», still assigned, its cards are
// the default ones, and no second «Vista predeterminada» appears in the views list (before, reset replaced the whole
// layout with defaultLayout and saving deleted the team view to create a «Vista predeterminada» without teams). The
// same for a team preview view, and the default view itself still resets to the default. Run: node scripts/smoke-layout-reset.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const TAG = 'layout-reset';
const log = (...a) => console.log(`[${TAG}]`, ...a);
const fail = (msg) => { console.error(`[${TAG}] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const EDITOR = '<!doctype html><body class="app app--editor"><div id="layout-root"></div></body>';
const GLOBALS = ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option'];
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear() { Object.keys(mem).forEach((k) => delete mem[k]); } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const useDom = (url) => {
  const dom = new JSDOM(EDITOR, { url, pretendToBeVisual: true });
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
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
let n = 0;
const openEditor = async (query) => { useDom(`http://localhost/layout/?type=contacts${query}`); await import(resolve(here, `../src/layout.js?lr=${n++}`)); await wait(20); };
const rightCards = () => qa('[data-zone="right"] .lcard').map((c) => c.dataset.card);
const TEAM = 'SACA';

await import(resolve(here, '../src/data.js'));
const LD = await import(resolve(here, '../src/layout-defaults.js'));

// 1) a team view «Ventas» assigned to a team, with a card moved
await openEditor('&new=1');
click(q('[data-lc="rename-view"]')); $('l-prompt').value = 'Ventas'; click($('l-ok'));
click(q('[data-lc="teams"]'));
q(`[data-team-m="${TEAM}"]`).checked = true; click($('l-teams-ok'));
const first = rightCards()[0];
click(q(`[data-lc="down"][data-card="${first}"]`));
click(q('[data-lc="save"]'));
let views = LD.loadViewsList('contacts', 'record');
if (views.length !== 1 || views[0].name !== 'Ventas' || views[0].teams.join() !== TEAM) fail(`team view saved (${JSON.stringify(views)})`);
if (LD.loadViewLayout('contacts', 'Ventas').right[1] !== first) fail('the moved card is saved');
log(`vista de equipo «Ventas» asignada a ${TEAM}, con la tarjeta «${first}» movida`);

// 2) edit it, «Restablecer diseño predeterminado», save → same name, same team, default cards, no duplicate
await openEditor('&view=Ventas');
click(q('[data-lc="rename-view"]')); // the editor opened the right view
if ($('l-prompt').value !== 'Ventas') fail(`the editor opened «Ventas» (${$('l-prompt').value})`);
click(q('[data-close]') || $('l-cancel') || q('#l-modal'));
click(q('[data-lc="page"][data-page="config"]')); // the reset lives on the «Configuración» page of the editor
const reset = q('[data-lc="reset-layout"]');
if (!reset) fail('«Restablecer diseño predeterminado» button');
click(reset);
await wait(10);
const def = LD.defaultLayout('contacts');
const stateRight = rightCards().length ? rightCards() : null;
click(q('[data-lc="save"]'));
views = LD.loadViewsList('contacts', 'record');
const saved = LD.loadViewLayout('contacts', 'Ventas');
if (views.length !== 1 || views[0].name !== 'Ventas' || views[0].teams.join() !== TEAM) fail(`after reset + save the view keeps its name and team (${JSON.stringify(views)})`);
if (views.some((v) => v.name === 'Vista predeterminada') || 'crm:contacts:layout:Vista predeterminada' in mem) fail('no second «Vista predeterminada» is created');
if (!('crm:contacts:layout:Ventas' in mem)) fail('the team view layout is still stored under its name');
if (saved.name !== 'Ventas' || (saved.teams || []).join() !== TEAM || saved.isDefault) fail(`the stored layout keeps its identity (${saved.name} / ${(saved.teams || []).join()} / ${saved.isDefault})`);
if (saved.right.join() !== def.right.join() || saved.left.join() !== def.left.join() || JSON.stringify(saved.tabs) !== JSON.stringify(def.tabs)) fail(`reset gives the default cards (${saved.right.join()} vs ${def.right.join()})`);
if (stateRight && stateRight.join() !== def.right.join()) fail('the editor shows the default cards after the reset');
log(`restablecer + guardar: sigue «Ventas» asignada a ${TEAM}, tarjetas predeterminadas (${saved.right.slice(0, 3).join(', ')}…), sin «Vista predeterminada» duplicada`);

// 3) a team preview view keeps its name and team on reset too
await openEditor('&preview=1&new=1');
click(q('[data-lc="rename-view"]')); $('l-prompt').value = 'Vista previa Ventas'; click($('l-ok'));
click(q('[data-lc="teams"]'));
q(`[data-team-m="${TEAM}"]`).checked = true; click($('l-teams-ok'));
click(q('[data-lc="save"]'));
await openEditor('&preview=1&view=Vista%20previa%20Ventas');
if (q('[data-lc="page"][data-page="config"]')) click(q('[data-lc="page"][data-page="config"]'));
if (q('[data-lc="reset-layout"]')) {
  click(q('[data-lc="reset-layout"]'));
  await wait(10);
  click(q('[data-lc="save"]'));
  const pviews = LD.loadViewsList('contacts', 'preview');
  const pv = LD.loadSavedPreview('contacts', 'Vista previa Ventas');
  if (pviews.length !== 1 || pviews[0].name !== 'Vista previa Ventas' || pviews[0].teams.join() !== TEAM || !pv || pv.name !== 'Vista previa Ventas' || (pv.teams || []).join() !== TEAM) fail(`preview team view keeps its identity (${JSON.stringify(pviews)} / ${pv && pv.teams})`);
  log(`vista previa de equipo: restablecer conserva «Vista previa Ventas» asignada a ${TEAM}`);
} else log('vista previa de equipo: el editor del panel no ofrece «Restablecer» (nada que comprobar)');

// 4) the default view itself still resets to the default
await openEditor('');
click(q('[data-lc="page"][data-page="config"]'));
click(q('[data-lc="reset-layout"]'));
await wait(10);
click(q('[data-lc="save"]'));
const defSaved = LD.loadLayout('contacts');
if (defSaved.name !== 'Vista predeterminada' || !defSaved.isDefault || (defSaved.teams || []).length) fail(`the default view resets to itself (${defSaved.name})`);
if (LD.loadViewsList('contacts', 'record').length !== 1) fail('the team views list is untouched by the default view');
log('vista predeterminada: restablecer la deja como predeterminada sin tocar las vistas de equipo');
console.log(`[${TAG}] OK`);
process.exit(0);
