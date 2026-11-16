// DOM smoke test for the owner dropdowns (src/owner-select.js): wherever a user/owner property is chosen —
// the record's «Acerca de» panel, the create forms (dedicated panel and generic drawer), the bulk «Asignar»
// dialog, the list's inline cell editor, the inbox assignment and the sequence enrolment — the native select is
// wrapped by a dropdown whose options carry the avatar (.avatar, initials or the empty placeholder for «Sin
// asignar»), the closed field shows avatar + name, typing filters the options, and picking one updates the
// select (change event) so the existing save paths run. Run: node scripts/smoke-owner-select.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[owner-select]', ...a);
const fail = (msg) => { console.error(`[owner-select] FAIL: ${msg}`); process.exit(1); };
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear: () => { Object.keys(mem).forEach((k) => delete mem[k]); } };
function useDom(html, url) {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.history = dom.window.history;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  globalThis.FormData = dom.window.FormData;
  globalThis.URL = dom.window.URL;
  globalThis.Blob = dom.window.Blob;
  dom.window.confirm = () => true;
  dom.window.prompt = (q, d) => d;
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  return dom;
}
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const $ = (id) => document.getElementById(id);
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const input = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// The dropdown built over a select: wrapper, button, panel, options.
const oselOf = (sel) => { const w = sel && sel.closest('.osel'); if (!w) fail(`select ${sel && (sel.id || sel.name)} is not enhanced`); return { wrap: w, btn: w.querySelector('.osel__btn'), search: w.querySelector('.osel__search input'), opts: () => [...w.querySelectorAll('.osel__opt')], panel: w.querySelector('.osel__panel') }; };
const checkOptions = (o, where) => {
  click(o.btn);
  if (o.panel.hidden || !o.wrap.classList.contains('is-open')) fail(`${where}: panel did not open`);
  const opts = o.opts();
  if (opts.length < 2) fail(`${where}: no options`);
  opts.forEach((b) => { if (!b.querySelector('.owner .avatar') || !b.querySelector('.owner__name')) fail(`${where}: option without avatar: ${text(b)}`); });
  const none = opts.find((b) => text(b).includes('Sin asignar'));
  if (none && !none.querySelector('.avatar--empty')) fail(`${where}: «Sin asignar» must carry the empty avatar`);
  const named = opts.find((b) => !text(b).includes('Sin asignar'));
  if (!named || !/background:\s*#/.test(named.querySelector('.avatar').getAttribute('style') || '')) fail(`${where}: a user option must carry the coloured initials avatar`);
  return opts;
};

// ===== 1) Record page: the owner property of the «Acerca de» panel =====
useDom('<!doctype html><body class="app" data-type="contacts"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>', 'http://localhost/contacts/record/?id=3');
document.body.dataset.type = 'contacts';
const data = await import(resolve(here, '../src/data.js'));
await import(resolve(here, '../src/record.js'));
const row = q('#rec-props .props__row[data-key="owner"]');
if (!row) fail('owner row missing');
click(row.querySelector('.props__edit'));
const sel = row.querySelector('select[data-edit="owner"]');
if (!sel || !sel.hasAttribute('data-owner-select')) fail('the owner editor must be a marked select');
const o1 = oselOf(sel);
if (!o1.btn.querySelector('.owner .avatar') || text(o1.btn) !== `${text(o1.btn.querySelector('.avatar'))}${data.findRecord('contacts', 3).owner}`.replace(/\s+/g, ' ').trim() && !text(o1.btn).includes(data.findRecord('contacts', 3).owner)) fail(`closed field: ${text(o1.btn)}`);
if (document.activeElement !== o1.btn) fail('the dropdown button should get the focus when the editor opens');
const opts1 = checkOptions(o1, 'record');
if (opts1.length !== data.OWNERS.length) fail(`record: ${opts1.length} options, expected ${data.OWNERS.length}`);
// contact 3 belongs to Sofía R.: search another user and pick her/him
input(o1.search, 'lau');
const filtered = o1.opts();
if (filtered.length !== 1 || !text(filtered[0]).includes('Laura M.')) fail(`search filter: ${filtered.map(text).join('|')}`);
let changed = 0;
sel.addEventListener('change', () => { changed += 1; });
click(filtered[0]);
if (sel.value !== 'Laura M.' || changed !== 1 || !o1.panel.hidden || !text(o1.btn).includes('Laura M.')) fail('picking an option must set the select, fire change and close');
if (!row.querySelector('.props__form')) fail('the editor must stay open after picking (focus kept inside)');
row.querySelector('.props__form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(10);
const rowAfter = q('#rec-props .props__row[data-key="owner"]'); // the card re-renders after saving
if (data.findRecord('contacts', 3).owner !== 'Laura M.' || rowAfter.querySelector('.props__form') || !rowAfter.querySelector('dd .owner .avatar') || !text(rowAfter).includes('Laura M.')) fail(`saving must store the owner and show it with the avatar (owner now ${data.findRecord('contacts', 3).owner})`);
log('record: owner editor = dropdown with avatars, search «lau» → Laura M., change + save stored');

// ===== 2) Contacts list: dedicated create panel, bulk «Asignar», inline cell editor =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', 'http://localhost/contacts/');
await import(resolve(here, '../src/contacts.js'));
click(q('button.views__tab[data-view="std:all"]'));
const ccSel = q('#cc-form select[name="owner"]');
const o2 = oselOf(ccSel);
if (!text(o2.btn).includes($('cc-form').elements.owner.value) || !o2.btn.querySelector('.avatar')) fail('create panel: closed field must show the default owner with avatar');
checkOptions(o2, 'create panel');
click(o2.opts().find((b) => text(b).includes('Laura M.')));
if ($('cc-form').elements.owner.value !== 'Laura M.') fail('create panel: form value must follow the pick');
log('create panel (contacts): dropdown with avatars, pick → form.elements.owner');
// bulk assign
const rows = qa('#table tbody tr[data-id]').slice(0, 2).map((r) => ({ dataset: { id: r.dataset.id } }));
// the list re-renders after every check: re-query the row each time
rows.forEach((r) => { const cb = q(`#table tbody tr[data-id="${r.dataset.id}"] .row-check`); cb.checked = true; cb.dispatchEvent(new window.Event('change', { bubbles: true })); });
click(q('[data-action="bulk-assign"]'));
const bulkSel = q('#bulk-form select[name="owner"]');
const o3 = oselOf(bulkSel);
checkOptions(o3, 'bulk assign');
click(o3.opts().find((b) => text(b).includes('Diego G.')));
if ($('bulk-form').elements.owner.value !== 'Diego G.') fail('bulk: form value must follow the pick');
$('bulk-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(5);
if (rows.some((r) => data.findRecord('contacts', r.dataset.id).owner !== 'Diego G.')) fail('bulk assign did not apply');
log('bulk «Asignar»: dropdown with avatars, pick Diego G. → applied to the selected rows');
// inline cell editor
const ownerTd = q('#table tbody td[data-key="owner"].cell--editable');
if (!ownerTd) fail('no editable owner cell');
click(ownerTd);
const cpSel = q('#cellpop select#cp-value');
const o4 = oselOf(cpSel);
checkOptions(o4, 'cell editor');
const noneOpt = o4.opts().find((b) => text(b).includes('Sin asignar'));
if (!noneOpt || !noneOpt.querySelector('.avatar--empty')) fail('cell editor: «--» must read as «Sin asignar» with the empty avatar');
click(o4.opts().find((b) => text(b).includes('Laura M.')));
if (cpSel.value !== 'Laura M.' || $('cellpop-save').disabled) fail('cell editor: pick must enable save');
log('cell editor: dropdown with avatars, «Sin asignar» placeholder, pick enables Guardar');

// ===== 3) Generic create drawer (tickets) =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', 'http://localhost/tickets/');
await import(resolve(here, '../src/tickets.js'));
const drawerSel = q('#create-form select[name="owner"]');
const o5 = oselOf(drawerSel);
checkOptions(o5, 'create drawer');
click(o5.btn);
if (!o5.panel.hidden) fail('clicking the button again must close the panel');
log('generic create drawer (tickets): dropdown with avatars');

// ===== 4) Inbox assignment and sequence enrolment =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="inbox-root"></main><div id="scrim"></div></body>', 'http://localhost/inbox/');
const Conv = await import(resolve(here, '../src/conversations-data.js'));
await Conv.ready;
await import(resolve(here, '../src/inbox.js'));
await wait(10);
const assign = $('inbox-assign');
const o6 = oselOf(assign);
if (!o6.btn.querySelector('.avatar')) fail('inbox: closed field without avatar');
checkOptions(o6, 'inbox');
click(o6.opts().find((b) => text(b).includes('Laura M.')));
const selectedId = q('.inbox__item.is-active').dataset.id;
if (Conv.conversationById(selectedId).assignedTo !== 'Laura M.') fail('inbox: picking must assign the conversation');
log('inbox: «Asignar a» dropdown with avatars, pick → conversation assigned');
useDom('<!doctype html><body class="app"><main id="x"></main></body>', 'http://localhost/contacts/record/?id=3');
const Seq = await import(resolve(here, '../src/sequences-data.js'));
await Seq.ready;
const Enr = await import(resolve(here, '../src/sequence-enroll.js'));
Enr.openEnrollDialog({ contact: data.findRecord('contacts', 3) });
await wait(10);
const o7 = oselOf($('enr-by'));
checkOptions(o7, 'enrol');
log('sequence enrolment: «Inscribir como» dropdown with avatars');
log('OK');
