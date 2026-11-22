// DOM smoke test for the record customisation («Personalizar») of contacts and companies: the layout editor
// (remove / add / reorder cards, left column card, new tab, renamed section) saves and the record page applies
// it, intact after a reload; the editor's pencil on «Acerca de» and the record's «Personalizar propiedades»
// write the same card setting; the layouts, preview panel and card properties persist per user through the
// interface-settings store (Supabase user_settings when signed in) with a localStorage copy; reset clears both.
// Run: node scripts/smoke-record-customize.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { liveSmoke, requireColumns, requireTable, lit } from './smoke-live.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[record-customize]', ...a);
const fail = (msg) => { console.error(`[record-customize] FAIL: ${msg}`); process.exit(1); };

// ---- modo live (SMOKE_LIVE=1, docs/smoke-live.md): the «Acerca de» customisation stored per user in Supabase ----
await liveSmoke('record-customize', async ({ data, one, check, log, stamp, session }) => {
  await requireColumns('user_settings', ['user_id', 'scope', 'key', 'value']); // user_settings.sql (current version)
  await requireTable('account_settings');
  check(data.settingsLive(), 'la app arrancó con los ajustes en localStorage (fetchUserSettings falló: ¿user_settings sin scope?)');
  const KEY = 'crm:contacts:cardprops';
  const card = { title: `SMOKE Acerca de ${stamp}`, keys: ['email', 'phone', 'city'] };
  check(data.setSetting(KEY, card) === true, 'setSetting debe aceptar la escritura con la sesión viva');
  await data.dbIdle();
  let row = await one(`select scope, value->>'title' as title, jsonb_array_length(value->'keys') as n from public.user_settings where user_id = ${lit(session.uid)} and key = ${lit(KEY)}`);
  check(row && row.scope === 'user' && row.title === card.title && Number(row.n) === 3, `fila en user_settings con scope 'user' (${JSON.stringify(row)})`);
  log(`user_settings: ${KEY} scope=${row.scope} título «${row.title}» (${row.n} propiedades)`);
  // a second save updates the same row (unique user_id + key), it does not pile up
  data.setSetting(KEY, { ...card, keys: ['email'] });
  await data.dbIdle();
  const rows = await (await import('./smoke-live.mjs')).sql(`select count(*)::int as n, max(jsonb_array_length(value->'keys')) as keys from public.user_settings where user_id = ${lit(session.uid)} and key = ${lit(KEY)}`);
  check(rows[0].n === 1 && Number(rows[0].keys) === 1, `una sola fila por usuario y clave, actualizada (${JSON.stringify(rows[0])})`);
  log('segundo guardado → la misma fila, 1 propiedad');
  // «Aplicar a todos los usuarios de la cuenta» writes account_settings: only an admin may (RLS); the SMOKE user is not
  data.setSetting(KEY, card, { scope: 'global' });
  await data.dbIdle();
  const global = await one(`select key from public.account_settings where key = ${lit(KEY)} and value->>'title' = ${lit(card.title)}`);
  log(global ? 'account_settings: la fila de cuenta existe (el usuario tiene rol admin)' : 'account_settings: escritura rechazada por RLS para un usuario sin rol admin (esperado; la app lo avisa con un toast)');
  if (global) await (await import('./smoke-live.mjs')).sql(`delete from public.account_settings where key = ${lit(KEY)} and value->>'title' = ${lit(card.title)}`);
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const useDom = (html, url) => { const dom = new JSDOM(html, { url, pretendToBeVisual: true }); for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = dom.window[k]; dom.window.confirm = () => true; dom.window.HTMLElement.prototype.scrollIntoView = function () {}; dom.window.HTMLElement.prototype.scrollBy = function () {}; dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); return dom; };
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const EDITOR = '<!doctype html><body class="app app--editor"><div id="layout-root"></div></body>';
const RECORD = (type) => `<!doctype html><body class="app" data-type="${type}"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>`;
let n = 0;
const openEditor = async (type, id) => { useDom(EDITOR, `http://localhost/layout/?type=${type}&id=${id}`); await import(resolve(here, `../src/layout.js?n=${n++}`)); };
const openRecord = async (type, id) => { useDom(RECORD(type), `http://localhost/${type}/record/?id=${id}`); await import(resolve(here, `../src/record.js?n=${n++}`)); await wait(60); };
const data = await import(resolve(here, '../src/data.js'));
const LD = await import(resolve(here, '../src/layout-defaults.js'));

// Customise one object's record through the editor, then check the record page (now and after a reload).
async function customise(type, id) {
  await openEditor(type, id);
  const removed = q('[data-zone="right"] .lcard').dataset.card;
  click(q(`[data-lc="remove"][data-card="${removed}"]`));
  click(q('[data-lc="add"][data-zone="left"][data-card="collaborators"]'));
  const mid0 = q('.llist--section .lcard').dataset.card;
  click(q(`[data-lc="down"][data-card="${mid0}"]`));
  const right = qa('[data-zone="right"] .lcard').map((c) => c.dataset.card);
  click(q(`[data-lc="down"][data-card="${right[0]}"]`));
  click(q('[data-lc="rename-section"][data-section="0"]')); $('l-prompt').value = 'Resumen general'; click($('l-ok'));
  click(q('[data-lc="add-tab"]')); $('l-prompt').value = 'Ventas'; click($('l-ok'));
  if (!q('.ledit__status').classList.contains('is-dirty') || q('[data-lc="save"]').disabled) fail(`${type}: editor marks the changes as unsaved`);
  click(q('[data-lc="save"]'));
  if (q('.ledit__status').classList.contains('is-dirty')) fail(`${type}: saved state`);
  const saved = LD.loadLayout(type);
  const expect = { right: saved.right, mid: saved.tabs[0].sections[0].cards, section: saved.tabs[0].sections[0].title };
  if (saved.right.includes(removed) || !saved.left.includes('collaborators') || expect.section !== 'Resumen general' || !saved.tabs.some((t) => t.label === 'Ventas') || expect.mid[1] !== mid0 || saved.right[1] !== right[0]) fail(`${type}: saved layout (${JSON.stringify({ right: saved.right, left: saved.left, mid: expect.mid })})`);
  const check = async (label) => {
    await openRecord(type, id);
    const rightNow = qa('#rec-right [data-lcard]').map((c) => c.dataset.lcard);
    const midNow = qa('[data-lcard][data-ltab="overview"][data-sect="0"]').map((c) => c.dataset.lcard);
    if (rightNow.join() !== expect.right.join()) fail(`${type} ${label}: right column order (${rightNow.join()} vs ${expect.right.join()})`);
    if (midNow.join() !== expect.mid.join()) fail(`${type} ${label}: middle order (${midNow.join()} vs ${expect.mid.join()})`);
    if (text(q('#overview-body .rsection')) !== 'Resumen general') fail(`${type} ${label}: renamed section`);
    if (!qa('.rtabs__tab').map(text).includes('Ventas')) fail(`${type} ${label}: new tab`);
    if (rightNow.includes(removed)) fail(`${type} ${label}: removed card still shown`);
    const collab = q('#rec-left-extra [data-lcard="collaborators"]');
    if (!collab || !/Colaboradores/.test(text(collab)) || !text(collab).includes(data.findRecord(type, id).owner)) fail(`${type} ${label}: «Colaboradores» card in the left column (${collab && text(collab)})`);
  };
  await check('after save');
  await check('after reload');
  log(`${type}: quitada «${removed}», «Colaboradores» a la izquierda, reordenadas la tarjeta derecha y la central, sección «Resumen general», pestaña «Ventas» → la ficha lo aplica y sigue intacto tras recargar`);
  return { removed };
}

await customise('contacts', 3);

// ---- «Acerca de»: the record's «Personalizar propiedades» and the editor's pencil share one setting ----
await openRecord('contacts', 3);
const rowsBefore = qa('#rec-props .props__row').map((r) => r.dataset.key);
if (!rowsBefore.includes('jobTitle')) fail('«Cargo» row shown by default');
click(q('[data-act="customize-props"]'));
await wait(10);
const cb = q('[data-cardkey="jobTitle"]');
if (!cb || !cb.checked) fail('card editor lists «Cargo» as selected');
cb.checked = false; cb.dispatchEvent(new window.Event('change', { bubbles: true }));
click(q('[data-confirm="card-save"]'));
await wait(10);
if (qa('#rec-props .props__row').map((r) => r.dataset.key).includes('jobTitle')) fail('«Cargo» removed from the card');
await openRecord('contacts', 3);
if (qa('#rec-props .props__row').map((r) => r.dataset.key).includes('jobTitle')) fail('card properties persist after a reload');
if (!LD.loadCardProps('contacts') || LD.loadCardProps('contacts').keys.includes('jobTitle')) fail('shared card setting');
await openEditor('contacts', 3);
click(q('[data-lc="edit"][data-card="about"]'));
const pick = q('#l-pp input[value="jobTitle"]');
if (!$('l-pp') || !pick || pick.checked) fail('editor pencil opens the card properties with «Cargo» unchecked');
pick.checked = true;
click($('l-pp-ok'));
if (!LD.loadCardProps('contacts').keys.includes('jobTitle')) fail('pencil saves into the same card setting');
await openRecord('contacts', 3);
if (!qa('#rec-props .props__row').map((r) => r.dataset.key).includes('jobTitle')) fail('record shows «Cargo» again');
log('«Acerca de»: quitar «Cargo» desde la ficha persiste tras recargar; el lápiz del editor lo devuelve (mismo ajuste crm:contacts:cardprops)');

await customise('companies', 1);

// ---- per-user persistence through the settings store (what Supabase user_settings backs when signed in) ----
const remote = new Map();
LD.bindLayoutSettings({ live: () => true, get: (k) => (remote.has(k) ? remote.get(k) : null), set: (k, v, opts) => { remote.set(k, v); remote.set(`${k}#scope`, (opts && opts.scope) || 'user'); } });
const custom = LD.loadLayout('deals');
custom.right = custom.right.filter((c) => c !== 'summary');
custom.left = ['about', 'collaborators'];
LD.saveLayout('deals', custom);
if (!remote.get('crm:deals:layout') || remote.get('crm:deals:layout#scope') !== 'user' || !remote.get('crm:deals:layout-updated')) fail('layout written to the per-user settings store');
delete mem['crm:deals:layout']; delete mem['crm:deals:layout-updated'];
if (LD.loadLayout('deals').right.includes('summary') || !LD.loadLayout('deals').left.includes('collaborators')) fail('layout read back from the store when the local copy is gone');
await openRecord('deals', 1);
if (qa('#rec-right [data-lcard]').map((c) => c.dataset.lcard).includes('summary') || !q('#rec-left-extra [data-lcard="collaborators"]')) fail('the deal record follows the layout stored per user');
LD.saveCardProps('tickets', { title: 'Datos del ticket', keys: ['status', 'priority'] });
if (remote.get('crm:tickets:cardprops')?.keys.join() !== 'status,priority' || JSON.parse(mem['crm:tickets:cardprops']).title !== 'Datos del ticket') fail('card properties kept in both stores');
await openRecord('tickets', 1);
if (qa('#rec-props .props__row').map((r) => r.dataset.key).join() !== 'status,priority' || text($('about-title')) !== 'Datos del ticket') fail(`ticket card from the stored properties (${qa('#rec-props .props__row').map((r) => r.dataset.key).join()})`);
LD.savePreview('companies', null, { ...LD.defaultPreview('companies'), props: ['domain', 'owner'] });
if (remote.get('crm:companies:preview:default')?.props.join() !== 'domain,owner' || !LD.loadSavedPreview('companies')) fail('preview panel stored per user');
LD.resetLayout('deals');
if (remote.get('crm:deals:layout') !== null || 'crm:deals:layout' in mem || LD.loadLayout('deals').right.includes('summary') === false) fail('reset clears the store and the local copy');
LD.saveViewsList('deals', 'record', [{ name: 'Vista SACA', teams: ['SACA'] }]);
if (remote.get('crm:deals:recordviews#scope') !== 'global' || LD.loadViewsList('deals', 'record')[0].name !== 'Vista SACA') fail('team views list shared by the account');
log('ajustes por usuario: diseño, propiedades de la tarjeta y panel de vista previa pasan por el store (user_settings) con copia local; restablecer limpia ambos; las vistas de equipo son de la cuenta');
console.log('[record-customize] OK');
process.exit(0);
