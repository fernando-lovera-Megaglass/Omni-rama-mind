// Smoke test: ticket pipelines have «Reglas del pipeline» and «Automatizar» like deals. Settings: the editor shows
// the three tabs, the rule checkboxes and the required-properties modal persist into the pipeline definition
// (rules / required / automation, same shape as deals). Board: dragging a ticket without owner into a status
// that requires «Propietario del ticket» is refused with the message; with an owner it enters, and the status
// automation creates a follow-up task that appears in the tasks list; noBack / lockClosed refuse moves.
// Run: node scripts/smoke-ticket-rules.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[ticket-rules]', ...a);
const fail = (msg) => { console.error(`[ticket-rules] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
function useDom(main, url) {
  const dom = new JSDOM(`<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header>${main}<div id="scrim"></div></body>`, { url, pretendToBeVisual: true });
  for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'FormData', 'URL', 'Blob', 'MutationObserver']) globalThis[k] = dom.window[k];
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.confirm = () => true;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return dom;
}
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const check = (el, on) => { if (!el) fail('missing checkbox'); el.checked = on; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
const lastToast = () => text($('toast'));

// ===== 1) Settings: tabs, rules, required properties, automation persisted on the pipeline definition =====
useDom('<main id="settings-root"></main>', 'http://localhost/settings/#obj-tickets:pipelines');
const data = await import(resolve(here, '../src/data.js'));
const R = await import(resolve(here, '../src/ticket-rules.js'));
await import(resolve(here, '../src/settings.js'));
await wait(60);
click(q('[data-tpipe-edit="0"]'));
await wait(30);
const tabs = qa('[data-tpipe-sub]').map(text);
// the fourth tab, «Etiquetas de Ticket», is the object tags of tickets (src/ticket-tags-ui.js)
if (tabs.join('|') !== 'Configurar|Reglas del pipeline|Automatizar|Etiquetas de Ticket') fail(`ticket pipeline tabs: ${tabs.join('|')}`);
if (!q('form[data-save="ticketpipe-stages"]')) fail('Configurar keeps the statuses editor');
click(q('[data-tpipe-sub="rules"]'));
await wait(30);
if (!q('[data-tpipe-rule="noBack"]') || !q('[data-tpipe-rule="lockClosed"]') || !q('[data-act="tpipe-required"]')) fail('Reglas tab: rule checkboxes and required editors');
check(q('[data-tpipe-rule="noBack"]'), true);
await wait(20);
let def = data.ticketPipelineDefs()[0];
if (!def.rules || def.rules.noBack !== true) fail('noBack rule persisted on the pipeline definition');
const closedKey = def.stages.find((s) => s[2] === 'closed')[0];
const closedLabel = def.stages.find((s) => s[2] === 'closed')[1];
click(q(`[data-act="tpipe-required"][data-stage="${closedKey}"]`));
await wait(20);
const ownerBox = qa('#rq-form input').find((i) => i.value === 'Propietario del ticket');
if (!ownerBox) fail('required-properties modal lists «Propietario del ticket»');
ownerBox.checked = true;
click($('rq-save'));
await wait(20);
def = data.ticketPipelineDefs()[0];
if (!def.required || !(def.required[closedKey] || []).includes('Propietario del ticket')) fail('required property persisted');
if (!qa('.spane .chip').some((c) => text(c) === 'Propietario del ticket')) fail('required chip shown in the table');
click(q('[data-tpipe-sub="automate"]'));
await wait(30);
check(q(`[data-tpipe-auto="task"][data-stage="${closedKey}"]`), true);
await wait(20);
def = data.ticketPipelineDefs()[0];
if (!def.automation || !def.automation[closedKey] || def.automation[closedKey].task !== true) fail('task automation persisted');
if (!JSON.parse(localStorage.getItem('crm:pipelines:tickets'))[0].automation[closedKey].task) fail('definition (rules/required/automation) stored with the pipeline in localStorage');
log(`settings: tabs ok; «${def.name}» → noBack, required «Propietario del ticket» and task automation on «${closedLabel}»`);

// ===== 2) Board: refusal without owner, move + task with owner, noBack / lockClosed =====
useDom('<main id="list-root"></main>', 'http://localhost/tickets/');
const pipe = data.ticketPipelineDefs()[0];
const openKey = pipe.stages.find((s) => s[2] !== 'closed')[0];
const ticket = data.allTickets().find((t) => t.pipeline === pipe.name && t.status === openKey) || data.allTickets().find((t) => t.pipeline === pipe.name && t.status !== closedKey);
if (!ticket) fail('an open ticket of the first pipeline');
data.setField('tickets', ticket.id, 'owner', 'Sin asignar');
if (data.ticketMoveRefusal) fail('unexpected export');
const refusal = R.ticketMoveRefusal(data.findRecord('tickets', ticket.id), ticket.status, closedKey);
if (!refusal || !/Propietario del ticket/.test(refusal)) fail(`refusal without owner: «${refusal}»`);
await import(resolve(here, '../src/tickets.js'));
await wait(40);
// the board on the ticket's pipeline
const pipePick = q('#pipeline-pill, [data-pipeline-pick]');
click(q('[data-action="mode-board"]'));
await wait(40);
const drag = (id, toKey) => {
  const card = q(`.kcard[data-id="${id}"]`);
  const col = q(`.kcol[data-group="${toKey}"]`);
  if (!card || !col) fail(`board card/column (${Boolean(card)}/${Boolean(col)}) for ${id} → ${toKey}`);
  const ds = { effectAllowed: '', dropEffect: '', setData() {}, getData() { return ''; } };
  const ev = (type) => { const e = new window.Event(type, { bubbles: true, cancelable: true }); e.dataTransfer = ds; return e; };
  card.dispatchEvent(ev('dragstart'));
  col.dispatchEvent(ev('dragover'));
  col.dispatchEvent(ev('drop'));
};
drag(ticket.id, closedKey);
await wait(40);
let now = data.findRecord('tickets', ticket.id);
if (now.status === closedKey) fail('a ticket without owner must not enter the status that requires the owner');
if (!/Propietario del ticket/.test(lastToast())) fail(`refusal toast: «${lastToast()}»`);
log('board: without owner →', lastToast());
const tasksBefore = data.allTasks().length;
data.setField('tickets', ticket.id, 'owner', 'Fernando L.');
drag(ticket.id, closedKey);
await wait(40);
now = data.findRecord('tickets', ticket.id);
if (now.status !== closedKey || now.pipeline !== pipe.name) fail(`with owner the ticket enters «${closedLabel}» (status ${now.status})`);
const task = data.allTasks().find((t) => Number(t.ticketId) === Number(ticket.id));
if (data.allTasks().length !== tasksBefore + 1 || !task || !task.name.startsWith(`Seguimiento: ${ticket.name}`) || task.owner !== 'Fernando L.' || task.status !== 'todo') fail('automation creates the follow-up task for the owner');
log(`board: with owner → «${closedLabel}»; task «${task.name}» for ${task.owner}`);
// noBack: cannot go back to the open status; lockClosed: cannot move closed tickets at all
drag(ticket.id, openKey);
await wait(40);
if (data.findRecord('tickets', ticket.id).status !== closedKey || !/retroceder/.test(lastToast())) fail(`noBack refusal: «${lastToast()}»`);
const defs = data.ticketPipelineDefs(); defs[0].rules = { lockClosed: true }; data.saveTicketPipelineDefs(defs);
const otherOpen = pipe.stages.filter((s) => s[2] !== 'closed')[1];
drag(ticket.id, otherOpen ? otherOpen[0] : openKey);
await wait(40);
if (data.findRecord('tickets', ticket.id).status !== closedKey || !/cerrados/.test(lastToast())) fail(`lockClosed refusal: «${lastToast()}»`);
log('board: noBack and lockClosed refuse with their messages');

// ===== 3) The task shows up in the tasks list =====
useDom('<main id="list-root"></main>', 'http://localhost/tasks/');
await import(resolve(here, '../src/tasks.js'));
await wait(60);
const rs = $('row-search');
rs.value = 'Seguimiento:'; rs.dispatchEvent(new window.Event('input', { bubbles: true }));
await wait(40);
if (!qa('#table tbody tr[data-id]').some((tr) => text(tr).includes(ticket.name))) fail('the follow-up task is listed in Tareas');
log('tasks list: follow-up task listed');
console.log('[ticket-rules] OK');
process.exit(0);
