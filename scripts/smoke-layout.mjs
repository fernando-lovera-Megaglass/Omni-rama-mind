// DOM smoke test for the record layout editor and its effect on the record page.
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const mem = {};
const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
const log = (...a) => console.log('[layout]', ...a);

// 1) the editor
const dom = new JSDOM('<!doctype html><body class="app app--editor"><div id="layout-root"></div></body>', { url: 'http://localhost/layout/?type=contacts&id=3' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = storage;
globalThis.location = dom.window.location;
globalThis.HTMLElement = dom.window.HTMLElement;
dom.window.confirm = () => true;
await import(resolve(here, '../src/layout.js'));
const $ = (s) => document.getElementById(s);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
log('title:', document.querySelector('.ledit__title').textContent.replace(/\s+/g, ' ').trim());
log('left cards:', document.querySelectorAll('[data-zone="left"] .lcard').length, '| sections:', [...document.querySelectorAll('.lsection__head h2')].map((h) => h.textContent).join(' | '), '| right cards:', document.querySelectorAll('[data-zone="right"] .lcard').length);
log('tabs:', [...document.querySelectorAll('.ltab > button')].map((b) => b.textContent.trim()).join(' | '));
// remove a right card, undo, redo
const firstRight = document.querySelector('[data-zone="right"] .lcard').dataset.card;
click(document.querySelector(`[data-lc="remove"][data-card="${firstRight}"]`));
log('after remove right cards:', document.querySelectorAll('[data-zone="right"] .lcard').length, '| undo enabled:', !document.querySelector('[data-lc="undo"]').disabled);
click(document.querySelector('[data-lc="undo"]'));
log('after undo:', document.querySelectorAll('[data-zone="right"] .lcard').length);
click(document.querySelector('[data-lc="redo"]'));
log('after redo:', document.querySelectorAll('[data-zone="right"] .lcard').length);
// add it back via "+" menu
click(document.querySelector(`[data-lc="add"][data-card="${firstRight}"]`));
log('re-added at end:', [...document.querySelectorAll('[data-zone="right"] .lcard')].pop().dataset.card === firstRight);
// rename section via prompt modal
click(document.querySelector('[data-lc="rename-section"][data-section="0"]'));
$('l-prompt').value = 'Resumen general';
click($('l-ok'));
log('section renamed:', document.querySelector('.lsection__head h2').textContent);
// move a middle card down
const midCard = document.querySelector('.llist--section .lcard').dataset.card;
click(document.querySelector(`[data-lc="down"][data-card="${midCard}"]`));
log('middle order:', [...document.querySelectorAll('[data-section="0"].llist .lcard')].map((c) => c.dataset.card).join(','));
// drag a right card to the top
const cards = [...document.querySelectorAll('[data-zone="right"] .lcard')];
const dt = { effectAllowed: '', setData() {}, getData() { return ''; } };
const ev = (type, target) => { const e = new dom.window.Event(type, { bubbles: true, cancelable: true }); e.dataTransfer = dt; target.dispatchEvent(e); };
ev('dragstart', cards[cards.length - 1]);
ev('dragover', cards[0]);
ev('drop', cards[0]);
log('after drag first right card:', document.querySelector('[data-zone="right"] .lcard').dataset.card);
// add tab + save
click(document.querySelector('[data-lc="add-tab"]'));
$('l-prompt').value = 'Ventas';
click($('l-ok'));
log('tabs now:', [...document.querySelectorAll('.ltab > button')].map((b) => b.textContent.trim()).join(' | '), '| status dirty:', document.querySelector('.ledit__status').classList.contains('is-dirty'));
click(document.querySelector('[data-lc="teams"]'));
document.querySelector('[data-team-m]').checked = true;
click($('l-teams-ok'));
click(document.querySelector('[data-lc="save"]'));
const savedLayout = JSON.parse(mem['crm:contacts:layout']);
log('saved: name', savedLayout.name, '| teams', savedLayout.teams.join(','), '| right[0]', savedLayout.right[0], '| section0', savedLayout.tabs[0].sections[0].title, '| tabs', savedLayout.tabs.length);

// 2) the record page follows it
const dom2 = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/contacts/record/?id=3' });
globalThis.window = dom2.window;
globalThis.document = dom2.window.document;
document.body.dataset.type = 'contacts';
globalThis.location = dom2.window.location;
globalThis.HTMLElement = dom2.window.HTMLElement;
globalThis.FormData = dom2.window.FormData;
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
await import(resolve(here, '../src/record.js') + '?again');
const $2 = (s) => document.getElementById(s);
log('record tabs:', [...document.querySelectorAll('.rtabs__tab')].map((b) => b.textContent).join(' | '));
log('record sections:', [...document.querySelectorAll('#overview-body .rsection')].map((h) => h.textContent).join(' | '));
log('record right first card:', document.querySelector('#rec-right .card').textContent.replace(/\s+/g, ' ').trim().slice(0, 40));
log('custom pane exists:', Boolean(document.querySelector('#custom-panes .tabpane')), '| missing-data card:', document.body.textContent.includes('Datos faltantes'));
log('OK');
