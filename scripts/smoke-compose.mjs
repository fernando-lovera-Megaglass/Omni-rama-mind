// DOM smoke test for the e-mail composer on a contact record. Run: node scripts/smoke-compose.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dom = new JSDOM(
  '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>',
  { url: 'http://localhost/contacts/record/?id=3' },
);
const mem = {};
globalThis.window = dom.window;
globalThis.document = dom.window.document;
document.body.dataset.type = 'contacts';
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
globalThis.FormData = dom.window.FormData;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.location = dom.window.location;
globalThis.URL = dom.window.URL;
globalThis.Blob = dom.window.Blob;
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
document.execCommand = (cmd, ui, val) => { if (cmd === 'insertHTML') document.getElementById('cmp-text').insertAdjacentHTML('beforeend', val); return true; };
dom.window.prompt = () => 'https://megaglass.us';

await import(resolve(here, '../src/record.js'));
const $ = (s) => document.getElementById(s);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
const log = (...a) => console.log('[compose]', ...a);

click(document.querySelector('.record__quick [data-action="email"]'));
log('open:', !$('compose').hidden, '| to chips:', document.querySelectorAll('#cmp-to-chips .chip-to').length, '| tabs:', [...document.querySelectorAll('.compose__tabs > .menu > button')].map((b) => b.textContent.trim()).join(' | '));
log('from:', document.querySelector('.compose__frombtn').textContent.trim());
log('signature name:', document.querySelector('.sig__name').textContent, '| cta:', document.querySelector('.sig__cta').textContent);
click(document.querySelector('[data-tpl="0"]'));
log('template subject:', $('cmp-subject').value, '| body has text:', $('cmp-text').textContent.length > 20);
click(document.querySelector('[data-cm="cc"]'));
log('cc row shown:', Boolean($('cmp-cc')));
click(document.querySelector('[data-doc]'));
log('doc inserted:', $('cmp-text').textContent.includes('.pdf'));
click(document.querySelector('[data-cm="link"]'));
log('link inserted:', $('cmp-text').innerHTML.includes('href="https://megaglass.us"'));
click(document.querySelector('[data-fdays="3"]'));
log('follow-up checked:', $('cmp-follow').checked, '| label:', document.querySelector('.compose__follow').textContent.replace(/\s+/g, ' ').trim().slice(0, 90));
log('assoc button:', document.querySelector('.compose__right strong').textContent);
click(document.querySelector('[data-cm="collapse"]'));
log('collapsed:', $('compose').classList.contains('is-collapsed'));
click(document.querySelector('[data-cm="collapse"]'));
click(document.querySelector('[data-cm="expand"]'));
log('expanded:', $('compose').classList.contains('is-expanded'));
const tasksBefore = JSON.parse(mem['crm:tasks:extra'] || '[]').length;
click(document.querySelector('[data-cm="send"]'));
log('closed after send:', $('compose').hidden, '| timeline first:', $('rec-timeline').firstElementChild.textContent.replace(/\s+/g, ' ').trim().slice(0, 110));
log('follow-up task created:', JSON.parse(mem['crm:tasks:extra'] || '[]').length === tasksBefore + 1);
log('OK');
