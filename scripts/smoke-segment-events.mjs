// DOM smoke test for the «Eventos» category of the segment filter editor (src/event-filters.js): criteria on
// the real timeline (activities table) and the Twilio call logs — a segment «contactos con llamada en últimos
// 30 días» returns exactly the contacts with a call in that window, plus recorded call, last call outcome,
// last activity in N days, opened / unopened e-mail, counts, companies, the preview count, save & process and
// the list size, the marketing send marking per-contact opens, and the injected call logs.
// Run: node scripts/smoke-segment-events.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[segment-events]', ...a);
const fail = (msg) => { console.error(`[segment-events] FAIL: ${msg}`); process.exit(1); };
const DAY = 86400000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
const boot = (url, body) => {
  const dom = new JSDOM(body, { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = storage;
  globalThis.location = dom.window.location;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.FormData = dom.window.FormData;
  globalThis.history = dom.window.history;
  dom.window.confirm = () => true;
  return dom;
};
const EDITOR = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="sedit-root"></main><div id="scrim"></div></body>';
const LIST = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="seg-root"></main><div id="scrim"></div></body>';
let dom = boot('http://localhost/segments/editor/?object=contacts', EDITOR);
const $ = (id) => document.getElementById(id);
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const input = (el, v) => { el.value = v; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
const previewCount = () => Number(document.querySelector('.sedit__preview-head strong').textContent.split(' ')[0].replace(/,/g, ''));
const previewIds = () => [...document.querySelectorAll('.sedit__table tbody tr[data-id]')].map((tr) => Number(tr.dataset.id)).sort((a, b) => a - b);
const ids = (list) => list.map((c) => Number(c.id)).sort((a, b) => a - b);

const data = await import(resolve(here, '../src/data.js'));
const SD = await import(resolve(here, '../src/segments-data.js'));
const EF = await import(resolve(here, '../src/event-filters.js'));
const T = data.TODAY.getTime(); // the lists' reference day for «hace menos de N días»
const at = (daysAgo) => T - daysAgo * DAY + 10 * 3600000;
const [A, B, C, D, E, F, G] = data.allContacts().slice(10, 17);
// Real timeline rows, the same shape the record page and the call box write.
data.addActivity({ type: 'call', when: at(10), who: 'Fernando L.', text: 'Llamada de 12 minutos. Resultado: Conectado.', recordType: 'contacts', recordId: A.id, extra: { direction: 'Saliente', outcome: 'Conectado', durationMin: 12, recorded: true } });
data.addActivity({ type: 'call', when: at(20), who: 'Sofía R.', text: 'Llamada: sin respuesta.', recordType: 'contacts', recordId: B.id, extra: { direction: 'Saliente', outcome: 'Sin respuesta', durationMin: 0 } });
data.addActivity({ type: 'call', when: at(45), who: 'Fernando L.', text: 'Llamada antigua.', recordType: 'contacts', recordId: C.id, extra: { direction: 'Saliente', outcome: 'Conectado', durationMin: 5 } });
data.addActivity({ type: 'call', when: at(60), who: 'Fernando L.', text: 'Primera llamada a B.', recordType: 'contacts', recordId: B.id, extra: { direction: 'Saliente', outcome: 'Ocupado', durationMin: 0 } });
data.addActivity({ type: 'email', when: at(5), who: 'Marketing', text: 'Correo de marketing: Boletín', recordType: 'contacts', recordId: D.id, extra: { subject: 'Boletín', marketingEmailId: 'm1', opened: true } });
data.addActivity({ type: 'email', when: at(3), who: 'Fernando L.', text: 'Correo enviado a E: "Cotización"', recordType: 'contacts', recordId: E.id, extra: { subject: 'Cotización', from: 'fernando-lovera@megaglass.us' } });
data.addActivity({ type: 'meeting', when: at(2), who: 'Laura M.', text: 'Visita técnica.', recordType: 'contacts', recordId: F.id, extra: { locationType: 'Presencial' } });
data.addActivity({ type: 'system', when: at(1), who: 'Sistema', text: 'Propiedad actualizada.', recordType: 'contacts', recordId: G.id, extra: {} });
// A Twilio call log (call_logs) for G with a recording and an outcome, not logged as an activity.
EF.setCallLogs([{ call_sid: 'CA-test-1', contact_id: G.id, started_at: new Date(at(4)).toISOString(), recording_url: 'https://example.invalid/rec.mp3', outcome: 'Dejé mensaje de voz', status: 'completed', duration_sec: 40 }]);
const members = (filters, object = 'contacts') => ids(SD.segmentMembers({ id: 0, object, type: 'active', filters }));
const ev = (key, op, value, group = 0) => ({ key, op, value, value2: '', group, assoc: EF.EVENTS_ASSOC, label: '' });

// ===== 1) Engine: «contactos con llamada en últimos 30 días» and the other criteria =====
// A and B have logged calls 10 / 20 days ago; G's call is a Twilio log (call_logs) 4 days ago; C's is 45 days old.
if (members([ev('last_call', 'lastdays', '30')]).join() !== ids([A, B, G]).join()) fail(`call in last 30 days: ${members([ev('last_call', 'lastdays', '30')])} vs ${ids([A, B, G])}`);
if (members([ev('last_call', 'lastdays', '90')]).join() !== ids([A, B, C, G]).join()) fail('90 days includes the old call and the Twilio log');
if (members([ev('last_call', 'olderdays', '30')]).join() !== ids([C]).join()) fail('older than 30 days');
if (members([ev('calls_count', 'gte', '2')]).join() !== ids([B]).join() || members([ev('calls_count', 'eq', '0')]).length !== data.allContacts().length - 4) fail('number of calls');
if (members([ev('call_recorded', 'anyof', ['Sí'])]).join() !== ids([A, G]).join()) fail('recorded call (activity flag + call log recording)');
if (members([ev('last_call_outcome', 'anyof', ['Sin respuesta'])]).join() !== ids([B]).join() || members([ev('last_call_outcome', 'anyof', ['Conectado'])]).join() !== ids([A, C]).join() || members([ev('last_call_outcome', 'anyof', ['Dejé mensaje de voz'])]).join() !== ids([G]).join()) fail('last call outcome (the latest call of B is «Sin respuesta», not «Ocupado»)');
if (members([ev('last_activity', 'lastdays', '7')]).join() !== ids([D, E, F, G]).join()) fail('activity in the last 7 days (the system entry of G does not count, its Twilio call does)');
if (members([ev('last_activity', 'empty', '')]).length !== data.allContacts().length - 7) fail('no activity at all');
if (members([ev('email_opened', 'anyof', ['Sí'])]).join() !== ids([D]).join() || members([ev('email_unopened', 'anyof', ['Sí'])]).join() !== ids([E]).join() || members([ev('emails_count', 'gte', '1')]).join() !== ids([D, E]).join()) fail('opened / unopened e-mail');
if (members([ev('last_call', 'lastdays', '30'), ev('call_recorded', 'anyof', ['Sí'])]).join() !== ids([A, G]).join()) fail('Y between event conditions');
if (members([ev('last_call', 'lastdays', '30'), ev('email_opened', 'anyof', ['Sí'], 1)]).join() !== ids([A, B, D, G]).join()) fail('O between groups');
if (members([{ key: 'owner', op: 'filled', value: '', value2: '', group: 0, assoc: '', label: '' }, ev('last_call', 'lastdays', '30')]).join() !== ids([A, B, G].filter((c) => c.owner && c.owner !== 'Sin asignar')).join()) fail('mixed property + event');
// companies have their own timeline
const co = data.allCompanies()[3];
data.addActivity({ type: 'call', when: at(6), who: 'Diego G.', text: 'Llamada a la empresa.', recordType: 'companies', recordId: co.id, extra: { outcome: 'Conectado', durationMin: 8 } });
if (members([ev('last_call', 'lastdays', '30')], 'companies').join() !== String(co.id)) fail('company events');
log(`engine: llamada en últimos 30 días → ${[A, B, G].map((c) => c.name).join(', ')} (2 actividades + 1 registro Twilio); grabada → A + G; último resultado; actividad en 7 días; correo abierto (D) / sin abrir (E); Y / O; empresas`);

// ===== 2) The editor: «Eventos» category enabled, criteria, live preview =====
const ED = await import(resolve(here, '../src/segment-editor.js'));
input($('sedit-name'), 'Contactos con llamada en últimos 30 días');
click(document.querySelector('[data-act="name-ok"]'));
const row = () => document.querySelector('.advg[data-g="0"] .advc');
const assocSel = row().querySelector('[data-k="assoc"]');
const eventsGroup = [...assocSel.querySelectorAll('optgroup')].find((g) => g.label === 'Eventos');
if (!eventsGroup || eventsGroup.querySelectorAll('option').length !== 1 || eventsGroup.querySelector('option').disabled || eventsGroup.querySelector('option').value !== EF.EVENTS_ASSOC) fail('the Eventos category must be enabled');
input(assocSel, EF.EVENTS_ASSOC);
const keySel = row().querySelector('[data-k="key"]');
const groups = [...keySel.querySelectorAll('optgroup')].map((g) => g.label);
if (groups.join('|') !== 'Actividad|Llamadas|Reuniones|Correos' || [...keySel.options].map((o) => o.value).filter(Boolean).join('|') !== 'last_activity|activity_count|last_call|calls_count|call_recorded|last_call_outcome|last_meeting_outcome|last_email|emails_count|email_opened|email_unopened') fail(`event properties: ${[...keySel.options].map((o) => o.value).join('|')}`);
if (!row().classList.contains('advc--event')) fail('event row style');
input(keySel, 'last_call');
const opSel = row().querySelector('[data-k="op"]');
if (![...opSel.options].some((o) => o.value === 'lastdays')) fail('date operators for Última llamada');
input(opSel, 'lastdays');
input(row().querySelector('[data-k="value"]'), '30');
if (previewCount() !== 3 || previewIds().join() !== ids([A, B, G]).join()) fail(`preview: ${previewCount()} ${previewIds()}`);
if (!$('sedit-summary').textContent.includes('1 por eventos') || $('sedit-summary').textContent.includes('por asociación')) fail(`summary: ${$('sedit-summary').textContent}`);
if (!document.querySelector('.sedit__filters-head .muted').textContent.startsWith('1/250') || document.querySelector('.sedit__filters-head .muted').textContent.includes('asociados')) fail('events do not count as associated filters');
// a second event condition (Y): recorded call → only A
click(document.querySelector('.advg[data-g="0"] [data-add-cond]'));
const row2 = () => document.querySelectorAll('.advg[data-g="0"] .advc')[1];
input(row2().querySelector('[data-k="assoc"]'), EF.EVENTS_ASSOC);
input(row2().querySelector('[data-k="key"]'), 'call_recorded');
const yes = row2().querySelector('[data-multi][value="Sí"]');
if (!yes) fail('Sí/No choices for «Tiene llamada grabada»');
yes.checked = true;
yes.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
if (previewCount() !== 2 || previewIds().join() !== ids([A, G]).join()) fail(`preview with recorded: ${previewCount()}`);
// outcome choices
input(row2().querySelector('[data-k="key"]'), 'last_call_outcome');
if ([...row2().querySelectorAll('[data-multi]')].map((b) => b.value).join('|') !== EF.eventValueOptions('last_call_outcome').map(([value]) => value).join('|')) fail('outcome choices');
const sinResp = row2().querySelector('[data-multi][value="Sin respuesta"]');
sinResp.checked = true;
sinResp.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
if (previewCount() !== 1 || previewIds().join() !== String(B.id)) fail('preview with outcome');
click(row2().querySelector('[data-remove]'));
if (previewCount() !== 3) fail('back to the 30-day call segment');
log('editor: Eventos enabled → Actividad / Llamadas / Correos; «Última llamada es de hace menos de 30 días» previews 3; recorded → 2; outcome «Sin respuesta» → B');

// ===== 3) Save & process; the list shows the size; reopening keeps the condition =====
click(document.querySelector('[data-act="save"]'));
await ED.saveAndProcess();
await wait(400);
const saved = SD.segments().find((s) => s.name === 'Contactos con llamada en últimos 30 días');
if (!saved || saved.size !== 3 || saved.filters.length !== 1 || saved.filters[0].assoc !== EF.EVENTS_ASSOC || saved.filters[0].key !== 'last_call' || SD.segmentSize(saved) !== 3) fail(`saved segment: ${JSON.stringify(saved && { size: saved.size, filters: saved.filters })}`);
if (!SD.describeSegment(saved).includes('1 condición')) fail('description');
dom = boot(`http://localhost/segments/editor/?id=${saved.id}`, EDITOR);
await import(resolve(here, '../src/segment-editor.js') + '?reopen');
const reopened = document.querySelector('.advg[data-g="0"] .advc');
if (reopened.querySelector('[data-k="assoc"]').value !== EF.EVENTS_ASSOC || reopened.querySelector('[data-k="key"]').value !== 'last_call' || reopened.querySelector('[data-k="op"]').value !== 'lastdays' || reopened.querySelector('[data-k="value"]').value !== '30' || previewCount() !== 3) fail('reopened segment');
dom = boot('http://localhost/segments/', LIST);
await import(resolve(here, '../src/segments.js'));
input($('seg-q'), 'Contactos con llamada en últimos 30 días');
const listRow = document.querySelector('.seg__table tbody tr[data-id]');
if (!listRow || Number(listRow.querySelector('.seg__size').textContent.replace(/,/g, '')) !== 3) fail('list size');
log('saved & processed: size 3; reopened with the event condition; list shows 3');

// ===== 4) A marketing send marks which contacts opened it (per-contact data for the criteria) =====
const M = await import(resolve(here, '../src/marketing-data.js'));
await M.ready;
const draft = M.emails().find((e) => e.estado === 'borrador' && M.checklist(e).every((c) => c.ok)) || M.emails().find((e) => e.estado === 'borrador');
if (!draft) fail('no draft marketing e-mail to send');
const people = M.recipientsOf(draft);
const sent = M.sendEmail(draft.id, { rnd: () => 0.5 });
if (!sent || sent.estado !== 'enviado') fail(`send: ${sent && sent.estado}`);
const openedNow = people.filter((c) => data.activitiesFor('contacts', c.id).some((a) => a.extra && a.extra.marketingEmailId === draft.id && a.extra.opened === true)).length;
if (openedNow !== sent.aperturas || !sent.aperturas) fail(`opened per contact ${openedNow} vs aperturas ${sent.aperturas}`);
if (members([ev('email_opened', 'anyof', ['Sí'])]).length < sent.aperturas) fail('opened contacts enter the segment');
log(`marketing send: ${sent.aperturas} of ${people.length} recipients marked opened on their timelines`);

console.log('[segment-events] OK');
process.exit(0);
