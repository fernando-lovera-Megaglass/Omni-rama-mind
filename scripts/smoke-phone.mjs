// DOM smoke test for the shared phone editor (src/phone.js): the record's «Acerca de» panel opens a phone
// property with the country selector (flag + prefix), formats the digits as they are typed, validates, takes
// an extension and the raw mode, and saves the value with the international prefix; the create panels and the
// list's inline cell editor use the same component; lists, record header and cards display every phone
// formatted with its prefix. Run: node scripts/smoke-phone.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[phone]', ...a);
const fail = (msg) => { console.error(`[phone] FAIL: ${msg}`); process.exit(1); };
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
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 300, right: 500, top: 200, bottom: 240, width: 200, height: 40 });
  return dom;
}
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const $ = (id) => document.getElementById(id);
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const type = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ===== 0) The format itself =====
const P = await import(resolve(here, '../src/phone.js'));
const cases = [['612345678', '+34', '', '+34 612 345 678'], ['3055550100', '+1', '12', '+1 (305) 555-0100, ext. 12'], ['5512345678', '+52', '', '+52 55 1234 5678']];
cases.forEach(([d, dial, ext, want]) => { if (P.formatPhone(dial, d, ext) !== want) fail(`formatPhone(${dial}, ${d}) = ${P.formatPhone(dial, d, ext)}`); });
if (P.displayPhone('+525512345678') !== '+52 55 1234 5678' || P.displayPhone('+13055550100 ext 12') !== '+1 (305) 555-0100, ext. 12' || P.displayPhone('abc') !== 'abc' || P.displayPhone('') !== '') fail('displayPhone');
if (P.phoneHref('+34 612 345 678') !== 'tel:+34612345678' || !P.isValidDigits('612345678') || P.isValidDigits('12') || P.isValidDigits('0000000')) fail('href / validity');
log('format: +34 612 345 678 · +1 (305) 555-0100, ext. 12 · +52 55 1234 5678 · raw text kept · tel: href with prefix');

// ===== 1) Record page: the «Número de teléfono» property opens the shared editor =====
useDom('<!doctype html><body class="app" data-type="contacts"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>', 'http://localhost/contacts/record/?id=3');
document.body.dataset.type = 'contacts';
const data = await import(resolve(here, '../src/data.js'));
await import(resolve(here, '../src/record.js'));
const row = () => q('#rec-props .props__row[data-key="phone"]');
if (!row()) fail('phone row missing');
click(row().querySelector('.props__edit'));
const native = row().querySelector('input[data-edit="phone"]');
if (!native || native.type !== 'tel' || !native.dataset.phoneWired) fail('the phone editor must wrap the native tel input');
const box = row().querySelector('.phonebox');
const cc = box.querySelector('.phonebox__ccbtn');
const num = box.querySelector('.phonebox__num');
const ext = box.querySelector('.phonebox__ext');
if (!cc || !cc.querySelector('.phonebox__flag') || !/^\+\d+$/.test(text(cc.querySelector('.phonebox__dial'))) || !num || !ext || !box.querySelector('.phonebox__raw')) fail('country selector / number / extension / raw button missing');
if (document.activeElement !== num) fail('the number field should get the focus');
if (qa('.phonebox__menu [data-cc]').length !== P.COUNTRIES.length || !text(q('.phonebox__menu [data-cc="+52"]')).includes('🇲🇽') || !text(q('.phonebox__menu [data-cc="+52"]')).includes('México')) fail('country menu with flags and prefixes');
click(q('.phonebox__menu [data-cc="+34"]'));
type(num, '612345678');
if (num.value !== '612 345 678') fail(`auto-format while typing: ${num.value}`);
if (native.value !== '+34 612 345 678' || native.dataset.valid !== '1' || !box.querySelector('.phonebox__err').hidden) fail(`native value: ${native.value}`);
type(num, '12');
if (box.querySelector('.phonebox__err').hidden || native.dataset.valid !== '0' || !cc.classList.contains('is-invalid')) fail('a 2-digit number must show the error');
type(num, '3055550100');
click(q('.phonebox__menu [data-cc="+1"]'));
if (text(cc.querySelector('.phonebox__dial')) !== '+1' || num.value !== '(305) 555-0100' || native.value !== '+1 (305) 555-0100') fail(`country change: ${num.value} / ${native.value}`);
type(ext, '12');
if (native.value !== '+1 (305) 555-0100, ext. 12') fail(`extension: ${native.value}`);
if (!row().querySelector('.props__form')) fail('the editor must stay open while editing');
row().querySelector('.props__form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(10);
const saved = data.findRecord('contacts', 3).phone;
if (saved !== '+1 (305) 555-0100, ext. 12') fail(`saved value: ${saved}`);
const link = row().querySelector('dd a');
if (!link || text(link) !== '+1 (305) 555-0100, ext. 12' || link.getAttribute('href') !== 'tel:+13055550100') fail(`display after save: ${link && text(link)} ${link && link.getAttribute('href')}`);
log('record: country selector (flag + prefix), formats while typing, validates, extension, saved as +1 (305) 555-0100, ext. 12');
// raw mode keeps the text as typed
click(row().querySelector('.props__edit'));
click(row().querySelector('.phonebox__raw'));
const box2 = row().querySelector('.phonebox');
if (!box2.classList.contains('is-raw') || !text(box2.querySelector('.phonebox__raw')).startsWith('Aplicar formato')) fail('raw mode toggle');
type(box2.querySelector('.phonebox__num'), '305-555 0100 x');
if (row().querySelector('input[data-edit="phone"]').value !== '305-555 0100 x, ext. 12') fail(`raw value: ${row().querySelector('input[data-edit="phone"]').value}`);
click(row().querySelector('.props__form [data-cancel]'));
if (data.findRecord('contacts', 3).phone !== '+1 (305) 555-0100, ext. 12') fail('cancel must keep the saved value');
// the record header shows the formatted phone
const header = text($('rec-phone'));
if (!header.includes(P.displayPhone(data.findRecord('contacts', 3).phone || data.findRecord('contacts', 3).mobilephone))) fail(`header phone: ${header}`);
log('raw mode («Eliminar formato de número») keeps the text; header shows the formatted phone');

// ===== 2) Create panel (contacts): the phone fields use the editor and the form gets the normalised value =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', 'http://localhost/contacts/');
await import(resolve(here, '../src/contacts.js'));
click(q('button.views__tab[data-view="std:all"]'));
const form = $('cc-form');
const fields = ['phone', 'mobilephone'].map((n) => form.querySelector(`input[name="${n}"]`));
fields.forEach((f, i) => { if (!f || !f.closest('.phonebox') || !f.closest('.phonebox').querySelector('.phonebox__ccbtn')) fail(`create panel field ${i} not enhanced`); });
const pbox = fields[0].closest('.phonebox');
click(pbox.querySelector('.phonebox__menu [data-cc="+52"]'));
type(pbox.querySelector('.phonebox__num'), '5512345678');
if (new FormData(form).get('phone') !== '+52 55 1234 5678') fail(`FormData phone: ${new FormData(form).get('phone')}`);
log('create panel: phone + mobile fields with the editor; FormData gets +52 55 1234 5678');
// list column and inline cell editor
const td = q('#table tbody td[data-key="phone"].cell--editable');
if (!td) fail('no phone cell');
const rec = data.findRecord('contacts', td.dataset.id);
if (text(td.querySelector('a')) !== P.displayPhone(rec.phone) || !td.querySelector('a[href^="tel:+"]')) fail(`list cell: ${text(td.querySelector('a'))} vs ${P.displayPhone(rec.phone)}`);
click(td);
if (!$('cellpop') || $('cellpop').hidden || !$('cp-phone') || !$('cp-ext') || !q('#cellpop .phonebox__ccbtn')) fail('cell editor must use the shared phone editor');
type($('cp-phone'), '611222333');
type($('cp-ext'), '4');
if ($('cp-value').value !== `${text(q('#cellpop .phonebox__dial'))} 611 222 333, ext. 4` || $('cellpop-save').disabled) fail(`cell editor value: ${$('cp-value').value}`);
click($('cellpop-save'));
const after = data.findRecord('contacts', td.dataset.id).phone;
if (!/^\+\d+ 611 222 333, ext\. 4$/.test(after)) fail(`cell save: ${after}`);
log(`list: cells show the formatted phone with tel: link; inline editor saved ${after}`);
log('OK');
