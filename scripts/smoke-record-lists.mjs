// DOM smoke test for «Agregar a lista» on a record (src/record.js «Administrar membresías de lista» over the real
// segments of src/segments-data.js): the static segments of the record's object appear with a checkbox set by
// the current membership, checking adds the record for real (size and members in CRM › Segmentos, timeline
// entry, toast), unchecking removes it; active segments are read-only with «Miembro» / «No miembro» calculated;
// every segment links to its page; no fictitious list names. Run: node scripts/smoke-record-lists.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[record-lists]', ...a);
const fail = (msg) => { console.error(`[record-lists] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const useDom = (html, url) => { const dom = new JSDOM(html, { url, pretendToBeVisual: true }); for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = dom.window[k]; dom.window.HTMLElement.prototype.scrollIntoView = function () {}; dom.window.confirm = () => true; dom.window.prompt = () => 'x'; dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); return dom; };
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const toggle = (cb) => { cb.checked = !cb.checked; cb.dispatchEvent(new window.Event('change', { bubbles: true })); };

useDom('<!doctype html><body class="app" data-type="contacts"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>', 'http://localhost/contacts/record/?id=3');
const data = await import(resolve(here, '../src/data.js'));
const S = await import(resolve(here, '../src/segments-data.js'));
const contact = data.findRecord('contacts', 3);
S.segments(); // seeds the sample segments (none of them lists contact 3 explicitly)
const vip = S.addSegment({ name: 'Instaladores VIP', object: 'contacts', type: 'static', memberIds: [], size: 0 });
const other = S.addSegment({ name: 'Prospectos CDMX', object: 'contacts', type: 'static', memberIds: [Number(contact.id)], size: 1 });
const allActive = S.addSegment({ name: 'Todos los contactos (activa)', object: 'contacts', type: 'active', filters: [], size: null });
const noneActive = S.addSegment({ name: 'Nadie (activa)', object: 'contacts', type: 'active', filters: [], size: 0 });
const companySeg = S.addSegment({ name: 'Empresas clave', object: 'companies', type: 'static', memberIds: [], size: 0 });
const actsBefore = data.activitiesFor('contacts', contact.id).length;
await import(resolve(here, '../src/record.js'));
await wait(40);

// ---- open «Agregar a lista»: the real segments of contacts, memberships marked, no fake names ----
const trigger = q('[data-act="list"]');
if (!trigger || !/Agregar a lista/.test(text(trigger))) fail('«Agregar a lista» action on the record');
click(trigger);
await wait(10);
if (!$('rec-modal').classList.contains('is-open') || text($('rec-modal-title')) !== 'Administrar membresías de lista') fail(`modal (${text($('rec-modal-title'))})`);
const body = $('rec-modal-body');
if (/Instaladores Florida|Clientes 2026|Arquitectos México|Boletín mensual/.test(text(body)) || q('#list-name')) fail('no fictitious lists');
const statics = qa('#listmem-static [data-seg]').map((li) => li.dataset.seg);
if (!statics.includes(String(vip.id)) || !statics.includes(String(other.id)) || statics.includes(String(companySeg.id))) fail(`static segments of the record's object only (${statics.join(',')})`);
const cbVip = q(`[data-seg-toggle="${vip.id}"]`);
const cbOther = q(`[data-seg-toggle="${other.id}"]`);
if (!cbVip || cbVip.checked || !cbOther || !cbOther.checked) fail('checkboxes follow the current membership');
if (q(`#listmem-active [data-seg="${allActive.id}"] [data-seg-membership]`)?.dataset.segMembership !== 'member' || q(`#listmem-active [data-seg="${noneActive.id}"] [data-seg-membership]`)?.dataset.segMembership !== 'none' || q('#listmem-active input[type="checkbox"]')) fail('active segments read-only with the calculated membership');
if (q(`[data-seg="${vip.id}"] a`)?.getAttribute('href') !== `../../segments/editor/?id=${vip.id}`) fail('segments link to their page');
log(`modal: estáticas ${statics.length} (VIP sin marcar, CDMX marcada), activas Miembro / No miembro sin casilla, enlaces a ../../segments/editor/`);

// ---- check VIP → added for real ----
toggle(cbVip);
await wait(10);
let seg = S.segmentById(vip.id);
if (!seg.memberIds.includes(Number(contact.id)) || seg.size !== 1 || !S.segmentMembers(seg).some((m) => Number(m.id) === Number(contact.id))) fail(`added to the segment (${JSON.stringify(seg.memberIds)} / ${seg.size})`);
if (!/Agregado a «Instaladores VIP»/.test(text($('toast')))) fail(`toast (${text($('toast'))})`);
if (!q(`[data-seg-toggle="${vip.id}"]`).checked || !q(`[data-seg="${vip.id}"]`).classList.contains('is-member') || !/1 contactos/.test(text(q(`[data-seg="${vip.id}"]`)))) fail('modal refreshed with the membership');
const acts = data.activitiesFor('contacts', contact.id);
if (acts.length !== actsBefore + 1 || acts[0].text !== 'Añadido al segmento «Instaladores VIP».') fail(`timeline entry (${acts[0] && acts[0].text})`);
if (!qa('#rec-timeline .timeline__item').some((el) => text(el).includes('Añadido al segmento «Instaladores VIP»'))) fail('timeline rendered');
log('marcar «Instaladores VIP» → miembro real (memberIds, tamaño 1), toast, cronología');

// CRM › Segmentos shows the size and lists the record
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="seg-root"></main><div id="scrim"></div></body>', 'http://localhost/segments/');
await import(resolve(here, '../src/segments.js'));
await wait(20);
const row = qa('#seg-root tbody tr').find((tr) => text(tr).includes('Instaladores VIP'));
if (!row || !/\b1\b/.test(text(row.querySelector('.seg__size')))) fail(`segments page shows size 1 (${row && text(row)})`);
if (!S.segmentMembers(S.segmentById(vip.id)).some((m) => Number(m.id) === Number(contact.id))) fail('the record is among the segment\'s members');
log('CRM › Segmentos: «Instaladores VIP» con tamaño 1 y el contacto entre sus miembros');

// ---- back on the record: uncheck → removed for real; unchanged ones log nothing ----
useDom('<!doctype html><body class="app" data-type="contacts"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>', 'http://localhost/contacts/record/?id=3');
await import(resolve(here, `../src/record.js?again=${Date.now()}`));
await wait(40);
click(q('[data-act="list"]'));
await wait(10);
if (!q(`[data-seg-toggle="${vip.id}"]`).checked) fail('membership persisted');
toggle(q(`[data-seg-toggle="${vip.id}"]`));
await wait(10);
seg = S.segmentById(vip.id);
if (seg.memberIds.includes(Number(contact.id)) || seg.size !== 0 || !/Quitado de «Instaladores VIP»/.test(text($('toast')))) fail('unchecking removes the record');
const acts2 = data.activitiesFor('contacts', contact.id);
if (acts2[0].text !== 'Quitado del segmento «Instaladores VIP».' || acts2.length !== actsBefore + 2) fail(`removal logged once (${acts2[0].text})`);
// re-adding logs again; the other segment untouched
toggle(q(`[data-seg-toggle="${vip.id}"]`));
if (S.segmentById(other.id).memberIds.join() !== String(contact.id) || data.activitiesFor('contacts', contact.id).length !== actsBefore + 3) fail('only real changes are logged');
click(q('#rec-modal [data-close]'));
if ($('rec-modal').classList.contains('is-open')) fail('modal closes with «Listo»');
log('desmarcar → quitado de verdad (tamaño 0, toast, cronología); la otra lista intacta');
console.log('[record-lists] OK');
process.exit(0);
