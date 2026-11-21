// Smoke test for Informes › Biblioteca de informes: every row shows one primary «Abrir» button plus an «Acciones»
// menu (.menu/.menu__panel, Eliminar in red) instead of five ghost buttons; the search uses .search.search--sm
// with its icon; the builder and rename forms use .field; and app.css no longer carries the loose
// .custom-library input/select rule (#b6c7d6, var(--bg, #fff)). Run: node scripts/smoke-report-library.mjs
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[report-library]', ...a);
delete process.env.VITE_SUPABASE_URL;
delete process.env.VITE_SUPABASE_ANON_KEY;

// ---- static ----
const css = readFileSync(resolve(here, '../src/app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
assert.ok(!/#b6c7d6/.test(css), 'app.css: the hard-coded #b6c7d6 border is gone');
assert.ok(!/var\(--bg,\s*#fff\)/.test(css) && !/--bg:/.test(css), 'app.css: no var(--bg, #fff) nor a --bg alias');
assert.ok(!/\.custom-library input/.test(css) && !/\.custom-library label/.test(css), 'app.css: no loose input/label rule for the library');
const src = readFileSync(resolve(here, '../src/report-builder.js'), 'utf8');
assert.ok(!/btn--ghost" data-(duplicate|rename|delete)/.test(src), 'rows no longer line up ghost buttons');
log('static: no #b6c7d6 / var(--bg) / .custom-library input rule; no row of ghost buttons');

// ---- DOM (local store, shell menus) ----
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main><button data-action="report-library">Biblioteca</button><div id="grid"></div></main><div id="scrim"></div></body>', { url: 'http://localhost/reports/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'localStorage', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'MouseEvent', 'URL', 'Blob', 'MutationObserver']) globalThis[k] = dom.window[k];
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const { wireMenus, closeMenus } = await import(resolve(here, '../src/shell.js'));
const { mountReportBuilder } = await import(resolve(here, '../src/report-builder.js'));
const { createReportStore } = await import(resolve(here, '../src/custom-reports.js'));
const store = createReportStore(null, localStorage);
const tick = () => new Promise((r) => setTimeout(r, 0));
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const click = (el) => { assert.ok(el, 'element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const ui = mountReportBuilder({ root: q('main'), dashboard: q('#grid'), store, wireMenus, closeMenus });
await ui.ready; ui.open();

// search control
const search = q('.custom-library .search.search--sm');
assert.ok(search && search.querySelector('.ico--search') && search.querySelector('input[type="search"][data-search]'), 'search uses .search.search--sm with its icon');
assert.equal(q('.custom-library label > input[data-search]'), null, 'no bare label around the search');
log('search: .search.search--sm + icon');

// builder fields
click(q('[data-create]'));
const form = q('form[data-builder]');
assert.equal(form.querySelectorAll('label.field > span + input, label.field > span + select').length, 5, 'name + 4 selects as .field');
assert.equal(form.querySelectorAll('label:not(.field)').length, 0, 'no bare labels in the builder');
form.elements.name.value = 'Un informe con un nombre largo para comprobar que la fila no se desalinea con muchas palabras';
form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await tick();
click(q('[data-create]'));
q('form[data-builder]').elements.name.value = 'Negocios por propietario';
q('form[data-builder]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await tick();
log('builder: 5 .field controls, two reports saved');

// rows: one primary button + the Acciones menu
const rows = qa('.custom-library-row');
assert.equal(rows.length, 2);
for (const row of rows) {
  const visible = [...row.querySelectorAll('button')].filter((b) => !b.closest('.menu__panel'));
  assert.equal(visible.length, 2, `row shows 2 buttons outside the menu (got ${visible.length})`);
  assert.equal(visible[0].textContent.trim(), 'Abrir');
  assert.ok(visible[0].hasAttribute('data-view') && visible[0].classList.contains('btn'));
  assert.ok(visible[1].closest('.menu') && visible[1].getAttribute('aria-haspopup') === 'true' && /Acciones/.test(visible[1].textContent), 'second control is the Acciones menu button');
  const items = [...row.querySelectorAll('.menu__panel .menu__item')].map((b) => b.textContent.trim());
  assert.deepEqual(items, ['Duplicar', 'Renombrar', 'Anclar al panel principal', 'Eliminar']);
  assert.ok(row.querySelector('.menu__panel [data-delete].menu__item--danger'), 'Eliminar is a danger item');
  assert.equal(row.querySelectorAll('.btn--ghost').length, 0);
}
// the menu opens with the shell wiring and closes after an action
click(rows[0].querySelector('.menu > button'));
assert.ok(rows[0].querySelector('.menu').classList.contains('is-open'), 'Acciones opens its panel');
click(rows[0].querySelector('[data-pin]')); await tick();
assert.equal(q('.menu.is-open'), null, 'menu closes after an action');
assert.match(qa('.custom-library-row')[0].textContent, /Anclado al panel principal/);
assert.equal(qa('.custom-library-row')[0].querySelector('[data-pin]').textContent.trim(), 'Quitar del panel');
log('rows: «Abrir» + menú Acciones (Duplicar / Renombrar / Anclar / Eliminar en rojo); opens and closes');

// rename form uses .field; delete confirmation keeps its primary red button
click(qa('.custom-library-row')[1].querySelector('[data-rename]'));
assert.ok(q('form[data-edit] label.field > span + input[name="name"]'), 'rename form uses .field');
click(q('[data-back]'));
click(qa('.custom-library-row')[1].querySelector('[data-delete]'));
assert.ok(q('form[data-edit] [type="submit"].tpls__danger'));
click(q('[data-back]'));
assert.equal(qa('.custom-library-row').length, 2);
log('rename: .field; delete: confirmation with red primary');
console.log('[report-library] OK');
