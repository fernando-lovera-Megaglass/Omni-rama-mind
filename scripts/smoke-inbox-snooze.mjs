// DOM smoke test for «Posponer» with a deadline (src/inbox.js + src/conversations-data.js): the Posponer menu
// offers tomorrow / in 3 days / next week at 09:00 and a custom date-time; a snoozed conversation leaves the
// Abiertos view, shows «Pospuesta hasta <fecha>» in the thread header and comes back on its own when the deadline
// passes (the minute checker, with its toast); a new incoming message wakes a snoozed conversation right away; an
// outgoing reply does not; «Quitar posposición» reopens by hand; bulk snooze uses tomorrow 09:00.
// Run: node scripts/smoke-inbox-snooze.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[inbox-snooze]', ...a);
const fail = (msg) => { console.error(`[inbox-snooze] FAIL: ${msg}`); process.exit(1); };
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main class="content content--inbox" id="inbox-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/inbox/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'FormData', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'customElements']) globalThis[k] = dom.window[k];
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
dom.window.confirm = () => true;
// the minute checker: capture what the inbox schedules
const timers = [];
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (fn, ms) => { timers.push({ fn, ms }); return realSetInterval(() => {}, 1 << 30); };
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const change = (el, v) => { el.value = v; el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); };
const items = () => [...document.querySelectorAll('#inbox-items .inbox__item')].map((li) => li.dataset.id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, '0');
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const Conv = await import(resolve(here, '../src/conversations-data.js'));
await Conv.ready;
// the seed holds one snoozed-forever conversation: it has no deadline, so it never reopens by itself
const I = await import(resolve(here, '../src/inbox.js'));
await wait(10);
if (timers.length !== 1 || timers[0].ms !== 60_000) fail(`the inbox schedules the snooze checker every 60 s (${JSON.stringify(timers.map((t) => t.ms))})`);
if (!I.checkSnoozed || I.checkSnoozed() !== 0) fail('checkSnoozed exported; nothing to reopen at start');
const openIds = items();
const first = Conv.conversationById(I.state.activeId);
if (!first || first.status !== 'open' || !openIds.includes(first.id)) fail('an open conversation is selected');

// ---- the deadlines ----
const now = new Date();
const tomorrow = new Date(Conv.snoozeUntilFor('tomorrow', now));
if (tomorrow.getHours() !== 9 || tomorrow.getMinutes() !== 0 || Math.round((tomorrow - new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9)) / 86400000) !== 1) fail(`tomorrow 09:00 (${tomorrow})`);
const in3 = new Date(Conv.snoozeUntilFor('in3days', now));
if (Math.round((in3 - tomorrow) / 86400000) !== 2 || in3.getHours() !== 9) fail('in 3 days 09:00');
const monday = new Date(Conv.snoozeUntilFor('nextweek', now));
if (monday.getDay() !== 1 || monday <= now || (monday - now) > 8 * 86400000 || monday.getHours() !== 9) fail(`next Monday 09:00 (${monday})`);
if (Conv.snoozeUntilFor('custom') !== null) fail('custom has no preset');
log(`plazos: mañana ${tomorrow.toLocaleString()} · en 3 días ${in3.toLocaleString()} · próxima semana ${monday.toLocaleString()}`);

// ---- the menu on the thread: Mañana ----
const menuBtn = q('[data-inbox-snooze-menu]');
if (!menuBtn || !q('.inbox__snooze .menu__panel') || q('[data-inbox="snooze"]')) fail('Posponer is a menu now');
const options = [...document.querySelectorAll('[data-snooze]')].map((b) => b.dataset.snooze);
if (options.join(',') !== 'tomorrow,in3days,nextweek' || !q('[data-snooze-custom] input[type="datetime-local"]')) fail(`menu options (${options.join(',')}) + custom date-time`);
click(menuBtn);
if (!q('.inbox__snooze').classList.contains('is-open')) fail('the menu opens');
click(q('[data-snooze="tomorrow"]'));
await wait(10);
const snoozed = Conv.conversationById(first.id);
if (snoozed.status !== 'snoozed' || snoozed.snoozeUntil !== tomorrow.toISOString()) fail(`snoozed until tomorrow 09:00 (${snoozed.status} / ${snoozed.snoozeUntil})`);
if (items().includes(first.id)) fail('leaves the Abiertos view');
if (!/Conversación pospuesta hasta/.test(text($('toast')))) fail(`toast (${text($('toast'))})`);
if (JSON.parse(mem['crm:conversations']).find((c) => c.id === first.id).extra.snoozeUntil !== tomorrow.toISOString()) fail('persisted in extra');
// the Pospuestos filter lists it with the deadline in the thread header
change($('inbox-status'), 'snoozed');
await wait(10);
if (!items().includes(first.id)) fail('listed under Pospuestos');
I.state.activeId = first.id; I.renderAll();
const label = q('[data-snoozed-until]');
if (!label || !text(label).startsWith('Pospuesta hasta ') || label.dataset.snoozedUntil !== tomorrow.toISOString() || !q('[data-inbox="unsnooze"]')) fail(`header label (${text(label)})`);
log(`mañana: fuera de Abiertos, en Pospuestos, cabecera «${text(label)}», botón «Quitar posposición»`);

// ---- custom date-time one minute ahead → the checker reopens it when the time comes ----
change($('inbox-status'), 'open');
await wait(10);
I.state.activeId = items()[0]; I.renderAll();
const second = Conv.conversationById(I.state.activeId);
if (!second || second.status !== 'open' || second.id === first.id) fail('another open conversation selected');
const inOneMinute = new Date(Date.now() + 60_000);
inOneMinute.setSeconds(0, 0);
const form = q('[data-snooze-custom]');
form.elements.until.value = localInput(inOneMinute);
form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await wait(10);
const custom = Conv.conversationById(second.id);
if (custom.status !== 'snoozed' || custom.snoozeUntil !== inOneMinute.toISOString() || items().includes(second.id)) fail(`custom snooze one minute ahead (${custom.status} / ${custom.snoozeUntil})`);
// a date in the past is refused
I.state.activeId = items()[0]; I.renderAll();
const third = Conv.conversationById(I.state.activeId);
q('[data-snooze-custom]').elements.until.value = localInput(new Date(Date.now() - 3600_000));
q('[data-snooze-custom]').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
if (Conv.conversationById(third.id).status !== 'open' || !/posterior a ahora/.test(text($('toast')))) fail('a past date is refused');
// not due yet: the checker (as the interval would call it) reopens nothing
if (timers[0].fn() !== 0 && I.checkSnoozed() !== 0) fail('nothing reopened before the deadline');
if (Conv.conversationById(second.id).status !== 'snoozed') fail('still snoozed');
// the minute passes: the checker reopens it alone, with the toast, and it is back in Abiertos
const n = I.checkSnoozed(inOneMinute.getTime() + 1000);
await wait(10);
const back = Conv.conversationById(second.id);
if (n !== 1 || back.status !== 'open' || back.snoozeUntil !== null || back.extra.snoozeUntil !== undefined) fail(`reopened by the checker (${n} / ${back.status} / ${JSON.stringify(back.extra)})`);
if (!items().includes(second.id) || text($('toast')) !== '1 conversación pospuesta reabierta') fail(`back in Abiertos with the toast (${text($('toast'))})`);
if (Conv.conversationById(first.id).status !== 'snoozed') fail('the one due tomorrow stays snoozed');
if (Conv.reopenSnoozed(inOneMinute.getTime() + 1000) !== 0) fail('reopenSnoozed is idempotent');
log(`personalizada (+1 min): pospuesta hasta ${custom.snoozeUntil}; al vencer, el verificador la reabre sola (toast «${text($('toast'))}»); fecha pasada rechazada`);

// ---- an incoming message wakes a snoozed conversation right away; an outgoing reply does not ----
const incoming = Conv.sendMessage(first.id, { body: 'Hola, ¿pudieron revisar mi caso?', direction: 'in', author: 'Cliente' });
if (!incoming || Conv.conversationById(first.id).status !== 'open' || Conv.conversationById(first.id).extra.snoozeUntil !== undefined) fail('an incoming message reopens the snoozed conversation');
I.renderAll();
if (!items().includes(first.id)) fail('back in Abiertos after the incoming message');
Conv.setConversationStatus(first.id, 'snoozed', { snoozeUntil: tomorrow.toISOString() });
Conv.sendMessage(first.id, { body: 'Le respondemos mañana.', direction: 'out' });
if (Conv.conversationById(first.id).status !== 'snoozed') fail('an outgoing reply keeps the snooze');
// «Quitar posposición» by hand
change($('inbox-status'), 'snoozed');
I.state.activeId = first.id; I.renderAll();
click(q('[data-inbox="unsnooze"]'));
if (Conv.conversationById(first.id).status !== 'open' || Conv.conversationById(first.id).snoozeUntil !== null) fail('Quitar posposición reopens');
// snoozing without a deadline (old behaviour) stays until someone reopens it; the header says so
Conv.setConversationStatus(first.id, 'snoozed');
I.renderAll();
if (Conv.reopenSnoozed(Date.now() + 365 * 86400000) !== 0 || !/Pospuesta sin plazo/.test(text(q('[data-snoozed-until]')))) fail('no deadline → never reopens by itself, labelled «sin plazo»');
Conv.setConversationStatus(first.id, 'open');
// bulk snooze from the list: tomorrow 09:00
change($('inbox-status'), 'open');
await wait(10);
const bulkId = items()[0];
const box = q(`[data-select="${bulkId}"]`);
box.checked = true; box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
click(q('[data-bulk="snoozed"]'));
await wait(10);
const bulk = Conv.conversationById(bulkId);
if (bulk.status !== 'snoozed' || bulk.snoozeUntil !== tomorrow.toISOString() || !/pospuestas hasta/.test(text($('toast')))) fail(`bulk snooze until tomorrow (${bulk.status} / ${bulk.snoozeUntil} / ${text($('toast'))})`);
log('mensaje entrante → reabierta al instante; respuesta saliente la deja pospuesta; «Quitar posposición»; sin plazo → nunca sola; lote → mañana 09:00');
clearInterval(I.snoozeTimer);
console.log('[inbox-snooze] OK');
process.exit(0);
