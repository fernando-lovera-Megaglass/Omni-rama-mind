// DOM smoke test for mentions and assignment notifications (src/mention-autocomplete.js, src/notifications.js,
// src/data.js, src/record.js, src/inbox.js): typing «@Lau» in a contact's note lists Laura M. with her avatar,
// Enter inserts «@Laura M. », saving the note puts «Te mencionaron en una nota en <contacto>» in the bell with a
// link to the record (never for the author, never with the «Menciones» switch off); assigning a deal to another
// owner puts «Se te ha asignado el negocio …» (not for «Sin asignar», the actor, an unchanged owner or with the
// «Registro asignado» switch off, and never twice); a task created for a colleague notifies too; a comment in the
// inbox mentions as well. Run: node scripts/smoke-mentions.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[mentions]', ...a);
const fail = (msg) => { console.error(`[mentions] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const useDom = (html, url) => { const dom = new JSDOM(html, { url, pretendToBeVisual: true }); for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = dom.window[k]; dom.window.HTMLElement.prototype.scrollIntoView = function () {}; dom.window.confirm = () => true; dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); return dom; };
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const key = (el, k) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const typeInto = (ta, s) => { ta.value = s; ta.setSelectionRange(s.length, s.length); ta.dispatchEvent(new window.Event('input', { bubbles: true })); };

useDom('<!doctype html><body class="app" data-type="contacts"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>', 'http://localhost/contacts/record/?id=3');
const data = await import(resolve(here, '../src/data.js'));
const N = await import(resolve(here, '../src/notifications.js'));
const M = await import(resolve(here, '../src/mention-autocomplete.js'));
const notes = () => N.notifications();
const mine = (kind) => notes().filter((n) => n.kind === kind);
const bell = () => Number(text(q('#notif-btn .count')) || 0);
await import(resolve(here, '../src/record.js'));
await wait(40);
const contact = data.findRecord('contacts', 3);
if (!contact) fail('contact 3');
const baseUnread = N.unreadCount();

// ---- users and mention parsing ----
if (M.mentionUsers().map((u) => u.name).join('|') !== 'Fernando L.|Sofía R.|Diego G.|Laura M.' || M.matchMention('lau').map((u) => u.name).join() !== 'Laura M.' || M.matchMention('SOF').map((u) => u.name).join() !== 'Sofía R.') fail('users / matching');
if (M.mentionsIn('Revisar con @Laura y @sofia r. mañana; correo ana@ejemplo.com no cuenta').map((u) => u.name).join('|') !== 'Sofía R.|Laura M.' || M.mentionsIn('@Laurita').length) fail(`mentionsIn (${M.mentionsIn('Revisar con @Laura y @sofia r.').map((u) => u.name).join('|')})`);
log('usuarios: Fernando L., Sofía R., Diego G., Laura M.; «@Laura» y «@sofia r.» se resuelven; «@Laurita» no');

// ---- «@Lau» in the note box → popup with avatar → Enter inserts «@Laura M. » → saving notifies Laura ----
const ta = q('#note-form textarea');
ta.focus();
typeInto(ta, 'Revisar presupuesto con @Lau');
await wait(10);
const popup = q('.mention-ac');
if (!popup || qa('.mention-ac [data-mention]').length !== 1 || qa('.mention-ac [data-mention]')[0].dataset.mention !== 'Laura M.' || !q('.mention-ac .mention-ac__avatar') || text(q('.mention-ac .mention-ac__avatar')) !== 'LM') fail(`mention popup (${popup && text(popup)})`);
key(ta, 'Enter');
if (ta.value !== 'Revisar presupuesto con @Laura M. ' || q('.mention-ac')) fail(`Enter inserts the full name (${JSON.stringify(ta.value)})`);
typeInto(ta, `${ta.value}y @Die`);
await wait(10);
click(q('.mention-ac [data-mention="Diego G."]'));
if (ta.value !== 'Revisar presupuesto con @Laura M. y @Diego G. ') fail(`click inserts (${JSON.stringify(ta.value)})`);
typeInto(ta, `${ta.value}y conmigo @Fernando L.`);
$('note-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(20);
const saved = data.activitiesFor('contacts', 3).find((a) => a.type === 'note' && /@Laura M\./.test(a.text));
if (!saved) fail('note saved with the mentions');
const m = mine('mention');
if (m.length !== 2 || m.map((n) => n.to).sort().join('|') !== 'Diego G.|Laura M.') fail(`one notification per mentioned colleague, none for the author (${m.map((n) => n.to).join('|')})`);
const laura = m.find((n) => n.to === 'Laura M.');
if (laura.title !== `Te mencionaron en una nota en ${contact.name}` || laura.href !== 'contacts/record/?id=3' || !laura.text.includes('@Laura M.') || laura.read) fail(`Laura's notification (${JSON.stringify(laura)})`);
if (N.unreadCount() !== baseUnread + 2 || bell() !== baseUnread + 2) fail(`bell count (${bell()})`);
if (!qa('#notif-panel a').some((a) => a.getAttribute('href').endsWith('contacts/record/?id=3') && /Te mencionaron en una nota/.test(text(a)))) fail('bell links to the record');
if (!/Nota guardada · 2 personas recibirán una notificación/.test(text($('toast')))) fail(`toast (${text($('toast'))})`);
log(`nota con «@Laura M.» y «@Diego G.» → 2 notificaciones (no para el autor), campana ${bell()}, enlace a la ficha`);
// the «Menciones» switch off → nothing
mem['crm:notif'] = JSON.stringify({ email_mention: false });
typeInto(ta, 'Otra nota para @Laura M.');
$('note-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
if (mine('mention').length !== 2) fail('mentions off → no notification');
mem['crm:notif'] = JSON.stringify({ email_mention: true });
log('interruptor «Menciones» apagado → sin notificación');

// ---- assignments ----
const deal = data.allDeals().find((d) => d.owner === 'Fernando L.') || data.allDeals()[0];
const before = mine('assign').length;
data.setField('deals', deal.id, 'owner', 'Laura M.');
let a = mine('assign');
if (a.length !== before + 1 || a[0].to !== 'Laura M.' || a[0].title !== `Se te ha asignado el negocio «${deal.name}»` || a[0].href !== `deals/record/?id=${deal.id}`) fail(`assignment notification (${JSON.stringify(a[0])})`);
data.setField('deals', deal.id, 'owner', 'Laura M.'); // saved again without a change
data.setField('deals', deal.id, 'name', deal.name);
if (mine('assign').length !== before + 1) fail('saving without changing the owner does not notify again');
data.setField('deals', deal.id, 'owner', 'Sin asignar');
data.setField('deals', deal.id, 'owner', 'Fernando L.');
if (mine('assign').length !== before + 1) fail('«Sin asignar» and the actor get nothing');
data.setField('deals', deal.id, 'owner', 'Laura M.');
if (mine('assign').length !== before + 1) fail('the same assignment is never notified twice');
const ticket = data.allTickets()[0];
data.setField('tickets', ticket.id, 'owner', 'Sofía R.');
const t = mine('assign')[0];
if (mine('assign').length !== before + 2 || t.to !== 'Sofía R.' || !/^Se te ha asignado el ticket «/.test(t.title) || t.href !== `tickets/record/?id=${ticket.id}`) fail('ticket assignment');
data.setField('contacts', contact.id, 'owner', 'Diego G.');
if (mine('assign')[0].title !== `Se te ha asignado el contacto «${contact.name}»`) fail('contact assignment');
const task = data.addRecord('tasks', { name: 'Llamar al arquitecto', type: 'Llamada', status: 'todo', priority: 'medium', owner: 'Sofía R.', contactId: contact.id, contact: contact.name, due: data.TODAY.toISOString() });
if (mine('assign')[0].title !== 'Se te ha asignado la tarea «Llamar al arquitecto»' || mine('assign')[0].href !== `tasks/record/?id=${task.id}`) fail('task created for a colleague');
const own = data.addRecord('tasks', { name: 'Mi propia tarea', type: 'Tarea', status: 'todo', priority: 'medium', owner: 'Fernando L.', due: data.TODAY.toISOString() });
if (mine('assign')[0].href === `tasks/record/?id=${own.id}`) fail('my own task does not notify me');
mem['crm:notif'] = JSON.stringify({ email_assign: false });
data.setField('deals', deal.id, 'owner', 'Diego G.');
if (mine('assign')[0].to === 'Diego G.' && /negocio/.test(mine('assign')[0].title)) fail('assignments off → nothing');
mem['crm:notif'] = JSON.stringify({});
log('asignaciones: negocio → Laura, sin repetir al guardar igual, nada para «Sin asignar»/autor, ticket y contacto, tarea creada para Sofía; interruptor apagado → nada');

// ---- a comment in the inbox mentions too ----
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main class="content content--inbox" id="inbox-root"></main><div id="scrim"></div></body>', 'http://localhost/inbox/');
const Conv = await import(resolve(here, '../src/conversations-data.js'));
await Conv.ready;
const I = await import(resolve(here, '../src/inbox.js'));
await wait(20);
const conv = Conv.conversationById(I.state.activeId);
click(q('#inbox-reply [data-compose="note"]'));
await wait(10);
const ed = $('inbox-editor');
if (!ed || !ed.dataset.mentionWired) fail('mention autocomplete on the comment editor');
$('inbox-reply').elements.body.value = 'Ojo @Laura, el cliente quiere factura.';
$('inbox-reply').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(20);
const cm = mine('mention')[0];
if (!cm || cm.to !== 'Laura M.' || cm.title !== `Te mencionaron en un comentario en la conversación «${conv.subject}»` || cm.href !== `inbox/?id=${encodeURIComponent(conv.id)}`) fail(`comment mention (${JSON.stringify(cm)})`);
clearInterval(I.snoozeTimer);
log('comentario de la bandeja con «@Laura» → notificación con enlace a la conversación');
console.log('[mentions] OK');
process.exit(0);
