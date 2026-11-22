// DOM smoke test: no dead card on the record page of the four modules. The editor's catalog no longer offers
// «Archivos adjuntos de Google Drive» (no integration exists) and a brand-new team view (teamViewLayout) does not
// start with it; every card a new team view carries renders on the record page (contacts, companies, deals,
// tickets) and the text «Tarjeta sin contenido.» never appears; a stored layout that still references the retired
// card (or an unsupported «x-…» one) is read without it, so neither the record nor the editor shows it.
// Run: node scripts/smoke-team-view-cards.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const TAG = 'team-view-cards';
const log = (...a) => console.log(`[${TAG}]`, ...a);
const fail = (msg) => { console.error(`[${TAG}] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const RECORD = (type) => `<!doctype html><body class="app" data-type="${type}"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>`;
const EDITOR = '<!doctype html><body class="app app--editor"><div id="layout-root"></div></body>';
const GLOBALS = ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option'];
const useDom = (html, url) => {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  for (const k of GLOBALS) globalThis[k] = dom.window[k];
  dom.window.confirm = () => true;
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return dom;
};
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
let n = 0;
const openRecord = async (type, id) => { useDom(RECORD(type), `http://localhost/${type}/record/?id=${id}`); await import(resolve(here, `../src/record.js?tvc=${n++}`)); await wait(60); };
const openEditor = async (type, query) => { useDom(EDITOR, `http://localhost/layout/?type=${type}${query}`); await import(resolve(here, `../src/layout.js?tvc=${n++}`)); await wait(20); };
const rightCards = () => qa('#rec-right [data-lcard]').map((c) => c.dataset.lcard);
const TYPES = ['contacts', 'companies', 'deals', 'tickets'];

// ---- static ----
const ld = readFileSync(resolve(here, '../src/layout-defaults.js'), 'utf8');
const rec = readFileSync(resolve(here, '../src/record.js'), 'utf8');
if (/cards\.gdrive\s*=/.test(ld) || /concat\([^)]*'gdrive'/.test(ld)) fail('layout-defaults.js still offers or preinstalls the Google Drive card');
if (/Tarjeta sin contenido/.test(rec)) fail('record.js still paints «Tarjeta sin contenido.»');
log('estático: sin tarjeta de Google Drive en el catálogo ni en las vistas de equipo nuevas; record.js no pinta «Tarjeta sin contenido.»');

// ---- local mode ----
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear() { Object.keys(mem).forEach((k) => delete mem[k]); } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
useDom(RECORD('contacts'), 'http://localhost/contacts/');
const data = await import(resolve(here, '../src/data.js'));
const LD = await import(resolve(here, '../src/layout-defaults.js'));
const setMyTeam = (team) => { mem['crm:users'] = JSON.stringify([{ name: 'Fernando L.', email: 'fernando.l@megaglass.us', team, role: 'Superadministrador', status: 'Activo' }]); };
setMyTeam('SACA');

// 1) the catalog and a new team view of each module: no Google Drive card; every card renders on the record page
for (const type of TYPES) {
  const catalog = LD.cardCatalog(type);
  if (catalog.gdrive || Object.values(catalog).some((c) => /Google Drive/i.test(c.label))) fail(`${type}: catalog offers the Google Drive card`);
  const tv = LD.teamViewLayout(type, 'Vista SACA');
  if (tv.right.includes('gdrive') || tv.left.includes('gdrive')) fail(`${type}: a new team view starts with the dead card`);
  const unknown = [...tv.right, ...tv.left].filter((id) => !catalog[id]);
  if (unknown.length) fail(`${type}: a new team view carries cards outside the catalog (${unknown.join()})`);
  LD.saveViewLayout(type, 'Vista SACA', { ...tv, teams: ['SACA'] });
  LD.saveViewsList(type, 'record', [{ name: 'Vista SACA', teams: ['SACA'], updated: new Date().toISOString(), by: 'Fernando Lovera Colin' }]);
  const id = data.ALL[type]()[0].id;
  await openRecord(type, id);
  const body = text(q('#record-root'));
  if (/Tarjeta sin contenido/.test(body)) fail(`${type}: the record paints a dead card`);
  if (rightCards().join() !== tv.right.join()) fail(`${type}: every right card of the team view renders (${rightCards().join()} vs ${tv.right.join()})`);
  const empty = qa('#rec-right [data-lcard]').filter((c) => !c.querySelector('.card__toggle, .card__head, ul, table, .assoc-card, p, .ai-box, .files, .guides'));
  if (empty.length) fail(`${type}: cards without any content (${empty.map((c) => c.dataset.lcard).join()})`);
  // the left column renders the team view's cards («Acerca de» may sit in the same draggable column)
  const leftNow = qa('#rec-left-extra [data-lcard]').map((c) => c.dataset.lcard).filter((c) => c !== 'about');
  if (!q('#rec-left-extra [data-lcard="collaborators"]') || leftNow.join() !== tv.left.filter((c) => c !== 'about').join()) fail(`${type}: left cards of the team view render (${leftNow.join()})`);
  log(`${type}: vista de equipo nueva con ${tv.right.length} tarjetas a la derecha, todas con contenido (${tv.right.slice(0, 3).join(', ')}…)`);
}

// 2) an older stored view with the retired card and an unsupported one: read without them, nothing dead on the page
const old = { ...LD.teamViewLayout('contacts', 'Vista antigua'), teams: ['SACA'] };
old.right = ['gdrive', ...old.right, 'x-quotes'];
old.left = ['about', 'gdrive', 'collaborators'];
mem['crm:contacts:layout:Vista antigua'] = JSON.stringify(old);
LD.saveViewsList('contacts', 'record', [{ name: 'Vista antigua', teams: ['SACA'], updated: new Date().toISOString(), by: 'Fernando Lovera Colin' }]);
const read = LD.loadViewLayout('contacts', 'Vista antigua');
if (read.right.includes('gdrive') || read.right.includes('x-quotes') || read.left.includes('gdrive') || read.right.length !== old.right.length - 2) fail(`retired cards dropped when the view is read (${read.right.join()})`);
if (LD.resolveLayout('contacts').right.includes('gdrive')) fail('resolveLayout drops the retired card too');
await openRecord('contacts', data.allContacts()[0].id);
if (/Tarjeta sin contenido/.test(text(q('#record-root'))) || q('[data-lcard="gdrive"]') || q('[data-lcard="x-quotes"]')) fail('old view: the record shows no dead card');
if (rightCards().join() !== read.right.join()) fail(`old view: the rest renders (${rightCards().join()})`);
log('vista guardada antigua con «gdrive» y «x-quotes»: la ficha la pinta sin ellas');
// the editor neither shows the retired card nor offers it
await openEditor('contacts', '&view=Vista%20antigua');
if (qa('.lcard').some((c) => c.dataset.card === 'gdrive' || /Google Drive/i.test(text(c)))) fail('editor: the retired card is listed');
if (qa('[data-lc="add"]').some((b) => /Google Drive/i.test(text(b)))) fail('editor: «Agregar tarjeta» offers Google Drive');
await openEditor('contacts', '&new=1');
if (qa('.lcard').some((c) => /Google Drive/i.test(text(c))) || qa('[data-lc="add"]').some((b) => /Google Drive/i.test(text(b)))) fail('new team view in the editor: Google Drive card present or offered');
if (!qa('[data-zone="right"] .lcard').length) fail('new team view in the editor still has its right cards');
log(`editor: vista nueva con ${qa('[data-zone="right"] .lcard').length} tarjetas a la derecha, sin Google Drive; «Agregar tarjeta» no la ofrece`);
// the default view (no team) never had it
setMyTeam('');
await openRecord('contacts', data.allContacts()[0].id);
if (/Tarjeta sin contenido/.test(text(q('#record-root')))) fail('default view: dead card');
console.log(`[${TAG}] OK`);
process.exit(0);
