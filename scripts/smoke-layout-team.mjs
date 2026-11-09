// DOM smoke test: creating a team view from Configuración › Objetos opens the editor with a fresh layout and saves it.
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const mem = {};
const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
const log = (...a) => console.log('[layout-team]', ...a);

const dom = new JSDOM('<!doctype html><body class="app app--editor"><div id="layout-root"></div></body>', { url: 'http://localhost/layout/?type=deals&new=1' });
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
log('left:', [...document.querySelectorAll('[data-zone="left"] .lcard .lcard__title')].map((t) => t.textContent.trim()).join(' | '));
log('tabs:', [...document.querySelectorAll('.ltab > button')].map((b) => b.textContent.trim()).join(' | '), '| sections:', [...document.querySelectorAll('.lsection__head h2')].map((h) => h.textContent).join(' | '));
log('right cards:', [...document.querySelectorAll('[data-zone="right"] .lcard .lcard__title')].map((t) => t.textContent.replace('ⓘ', '').trim()).join(' | '));
log('warning shown:', Boolean(document.querySelector('.ledit__warn')), '| save enabled:', !document.querySelector('[data-lc="save"]').disabled, '| exit href:', document.querySelector('[data-lc="exit"]').getAttribute('href'));
// rename and assign a team, then save
click(document.querySelector('[data-lc="rename-view"]'));
$('l-prompt').value = 'Vista SACA';
click($('l-ok'));
click(document.querySelector('[data-lc="teams"]'));
const teamBox = document.querySelector('[data-team-m]');
teamBox.checked = true;
click($('l-teams-ok'));
log('after team:', document.querySelector('[data-lc="teams"]').textContent.trim(), '| warning:', Boolean(document.querySelector('.ledit__warn')));
click(document.querySelector('[data-lc="save"]'));
const views = JSON.parse(mem['crm:deals:recordviews']);
log('saved view:', views.map((v) => `${v.name} [${v.teams.join(',')}]`).join(' | '), '| layout stored:', Boolean(mem['crm:deals:layout:Vista SACA']), '| default layout untouched:', !mem['crm:deals:layout']);
log('OK');
