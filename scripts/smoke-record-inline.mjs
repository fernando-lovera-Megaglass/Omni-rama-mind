// DOM smoke test for inline editing on the contact record (the original's behaviour): the pencil on hover,
// click turns the value into an input / dropdown / date picker, clicking away or Enter saves, Escape cancels;
// "Ver todas las propiedades" opens a panel with every property (custom ones too), search, "N de M
// propiedades con valor" and inline editing; "Personalizar" chooses and orders the card's properties and
// keeps the choice in the settings store. Run: node scripts/smoke-record-inline.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[record-inline]', ...a);
const fail = (msg) => { console.error(`[record-inline] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const dom = new JSDOM('<!doctype html><body class="app" data-type="contacts"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/contacts/record/?id=3' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.FormData = dom.window.FormData;
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
dom.window.confirm = () => true;
const $ = (id) => document.getElementById(id);
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (el, k, extra = {}) => el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
const row = (k, root = '#rec-props') => document.querySelector(`${root} .props__row[data-key="${k}"]`);
const contact = () => data.allContacts().find((c) => c.id === 3);

const data = await import(resolve(here, '../src/data.js'));
await import(resolve(here, '../src/record.js'));

// 1) the card: every editable property has a pencil (shown on hover by CSS); read-only ones have none
const rows = [...document.querySelectorAll('#rec-props .props__row')];
log('card rows:', rows.length, '| with pencil:', rows.filter((r) => r.querySelector('.props__edit')).length, '| read-only:', rows.filter((r) => !r.querySelector('.props__edit')).map((r) => r.dataset.key).join(','));
if (!rows.length || !row('jobTitle').querySelector('.props__edit') || row('created').querySelector('.props__edit')) fail('editable rows carry the pencil, created does not');
// text: click the pencil → input with the value; typing + clicking away saves (setField → Supabase PATCH when connected)
const before = contact().jobTitle;
click(row('jobTitle').querySelector('.props__edit'));
const input = row('jobTitle').querySelector('.props__form [data-edit]');
log('editor:', input && input.tagName, input && input.type, '| value:', JSON.stringify(input && input.value), '| focused:', document.activeElement === input);
if (!input || input.tagName !== 'INPUT' || input.type !== 'text' || input.value !== (before || '') || document.activeElement !== input) fail('the text editor should open focused with the current value');
input.value = 'Directora de compras';
input.blur();
await wait(10);
log('after clicking away:', contact().jobTitle, '| editor closed:', !document.querySelector('#rec-props .props__form'), '| shown:', text(row('jobTitle').querySelector('dd')));
if (contact().jobTitle !== 'Directora de compras' || document.querySelector('#rec-props .props__form') || !text(row('jobTitle').querySelector('dd')).startsWith('Directora de compras')) fail('blur should save');
// Escape cancels without saving
click(row('jobTitle').querySelector('.props__edit'));
const input2 = row('jobTitle').querySelector('[data-edit]');
input2.value = 'No guardar';
key(input2, 'Escape');
await wait(10);
log('after Escape:', contact().jobTitle, '| editor closed:', !document.querySelector('#rec-props .props__form'));
if (contact().jobTitle !== 'Directora de compras' || document.querySelector('#rec-props .props__form')) fail('Escape should cancel');
// Enter (the form submit) saves
click(row('jobTitle').querySelector('.props__edit'));
const form = row('jobTitle').querySelector('.props__form');
form.querySelector('[data-edit]').value = 'Gerente de compras';
form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await wait(10);
log('after Enter:', contact().jobTitle);
if (contact().jobTitle !== 'Gerente de compras') fail('Enter should save');
// clicking away from an untouched field writes nothing (no history entry)
const histBefore = data.historyFor('contacts', 3).length;
click(row('jobTitle').querySelector('.props__edit'));
row('jobTitle').querySelector('[data-edit]').blur();
await wait(10);
log('untouched blur: history entries', histBefore, '->', data.historyFor('contacts', 3).length);
if (data.historyFor('contacts', 3).length !== histBefore) fail('an untouched field must not be saved again');
// dropdown: the lead status becomes a select; choosing + blur saves
click(row('status').querySelector('.props__edit'));
const sel = row('status').querySelector('[data-edit]');
log('dropdown:', sel && sel.tagName, '| options:', sel && [...sel.options].map((o) => o.value).join(','));
if (!sel || sel.tagName !== 'SELECT') fail('enum properties use a dropdown');
sel.value = [...sel.options].map((o) => o.value).find((v) => v !== contact().status);
const chosen = sel.value;
sel.blur();
await wait(10);
log('status saved:', contact().status === chosen, '| shown:', text(row('status').querySelector('dd')));
if (contact().status !== chosen) fail('dropdown value should save on blur');
// one editor at a time
click(row('jobTitle').querySelector('.props__edit'));
click(row('city').querySelector('.props__edit'));
log('open editors:', document.querySelectorAll('#rec-props .props__form').length);
if (document.querySelectorAll('#rec-props .props__form').length !== 1) fail('only one row edits at a time');
key(row('city').querySelector('[data-edit]'), 'Escape');

// 2) "Ver todas las propiedades" at the end of the card: panel with search, counter and inline editing
const links = [...document.querySelectorAll('.props__custom .link-btn')].map(text);
log('card footer links:', links.join(' | '));
if (links.join('|') !== 'Ver todas las propiedades|Personalizar') fail('card footer');
click(document.querySelector('.props__custom [data-act="all-props-panel"]'));
const panel = $('allprops-panel');
const groupsOf = () => [...panel.querySelectorAll('.allprops__group')].map((g) => g.dataset.group);
log('panel open:', panel.classList.contains('is-open'), '| title:', text($('allprops-title')), '| counter:', text($('allprops-count')), '| groups:', groupsOf().length, '| custom group:', groupsOf().includes('Información de Megaglass'));
if (!panel.classList.contains('is-open') || !/^\d+ de \d+ propiedades con valor$/.test(text($('allprops-count'))) || !groupsOf().includes('Información de Megaglass')) fail('the panel should list every group (custom ones too) with the counter');
const [withValue, totalProps] = text($('allprops-count')).match(/\d+/g).map(Number);
const P = await import(resolve(here, '../src/properties.js'));
const catalog = P.propertyGroups('contacts').flatMap((g) => g.items).length;
log('counter:', withValue, 'of', totalProps, '| catalog size:', catalog);
if (totalProps !== catalog || withValue <= 0 || withValue > totalProps) fail('the counter should cover the whole catalog');
// search narrows the rows
$('allprops-q').value = 'asesor';
$('allprops-q').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
const found = [...panel.querySelectorAll('.props__row')].map((r) => r.dataset.key);
log('search "asesor":', found.join(','));
if (found.join() !== 'asesor_de_ventas') fail('search should keep only the matching properties');
// inline edit inside the panel: the custom property gets a value and the counter grows by one
const prow = row('asesor_de_ventas', '#allprops-panel');
click(prow.querySelector('.props__edit'));
const pin = prow.querySelector('[data-edit]');
if (!pin || pin.tagName !== 'INPUT') fail('custom text property editor in the panel');
pin.value = 'Sofía R.';
pin.blur();
await wait(10);
log('custom value saved:', contact().asesor_de_ventas, '| counter now:', text($('allprops-count')), '| group counter:', text(panel.querySelector('[data-group="Información de Megaglass"] .allprops__n')));
if (contact().asesor_de_ventas !== 'Sofía R.' || Number(text($('allprops-count')).match(/\d+/)[0]) !== withValue + 1 || !/^1 de 19 con valor$/.test(text(panel.querySelector('[data-group="Información de Megaglass"] .allprops__n')))) fail('editing in the panel should save and update the counters');
// number property → number input; Escape with no editor open closes the panel
$('allprops-q').value = 'latitud';
$('allprops-q').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
click(row('latitud', '#allprops-panel').querySelector('.props__edit'));
const nin = row('latitud', '#allprops-panel').querySelector('[data-edit]');
log('number editor:', nin && nin.type);
if (!nin || nin.type !== 'number') fail('number properties use a number input');
key(nin, 'Escape');
await wait(10);
if (panel.querySelector('.props__form')) fail('Escape closes the editor first');
document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
log('panel closed with Escape:', !panel.classList.contains('is-open'));
if (panel.classList.contains('is-open')) fail('Escape should close the panel');
// the ⋮ menu entry opens the same panel; the X closes it
click(document.querySelector('.card [data-act="all-props"]'));
if (!panel.classList.contains('is-open')) fail('menu entry opens the panel');
click(panel.querySelector('.slideover__close'));
if (panel.classList.contains('is-open')) fail('X closes the panel');

// 3) Personalizar: choose which properties the card shows and their order; stored in the settings store
click(document.querySelector('.props__custom [data-act="customize-props"]'));
log('customize modal:', text(document.querySelector('.modal h2, #modal-title, .modal__title')).slice(0, 60), '| scope checkbox:', Boolean($('card-global')));
const box = document.querySelector('[data-cardkey="asesor_de_ventas"]');
if (!box || !$('card-global')) fail('the customize dialog should list every property and offer the account-wide scope');
box.checked = true;
box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
// move the new property to the top
const item = [...document.querySelectorAll('#card-selected .colsel')].find((li) => li.dataset.key === 'asesor_de_ventas');
let up = item && item.querySelector('[data-cardmove="-1"]');
let guard = 0;
while (up && !up.disabled && guard < 40) { click(up); guard += 1; const again = [...document.querySelectorAll('#card-selected .colsel')].find((li) => li.dataset.key === 'asesor_de_ventas'); up = again && again.querySelector('[data-cardmove="-1"]'); }
click(document.querySelector('[data-confirm="card-save"]'));
const keysNow = [...document.querySelectorAll('#rec-props .props__row')].map((r) => r.dataset.key);
const savedCard = JSON.parse(mem['crm:contacts:cardprops']);
log('card after customising:', keysNow.slice(0, 3).join(','), '… | saved keys:', savedCard.keys.length, '| first:', savedCard.keys[0], '| settings store (local mode):', data.settingsLive());
if (keysNow[0] !== 'asesor_de_ventas' || savedCard.keys[0] !== 'asesor_de_ventas' || text(row('asesor_de_ventas').querySelector('dd')) !== 'Sofía R.✎') fail('the customised card should show the chosen properties in order');
log('OK');
