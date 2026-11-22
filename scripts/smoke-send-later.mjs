// DOM smoke test for «Enviar más tarde» (src/compose.js + src/scheduled-emails.js): the dialog with the three
// presets (tomorrow 08:00, tomorrow 13:00, Monday 08:00, local time zone shown) and a custom date-time; scheduling
// one minute ahead queues the e-mail in crm:scheduled-emails and logs «Correo programado para el …» with
// «Cancelar envío» / «Editar fecha» on the timeline; when the time comes the checker sends it through gmail-send
// (real Google account, fake client) and the entry becomes «Correo enviado …»; cancelling before prevents the
// send and is logged; «Editar fecha» moves it; a simulated account marks it sent without sending; the checker is
// started by every page (src/page.js). Run: node scripts/smoke-send-later.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[send-later]', ...a);
const fail = (msg) => { console.error(`[send-later] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
process.env.VITE_GOOGLE_CLIENT_ID = 'test-client-id';
delete process.env.VITE_SUPABASE_URL;
delete process.env.VITE_SUPABASE_ANON_KEY;
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
const dom = new JSDOM('<!doctype html><body class="app" data-type="contacts"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/contacts/record/?id=3', pretendToBeVisual: true });
for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = dom.window[k];
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
dom.window.confirm = () => true;
document.execCommand = (cmd, ui, val) => { if (cmd === 'insertHTML') document.getElementById('cmp-text').insertAdjacentHTML('beforeend', val); return true; };
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const pad = (n) => String(n).padStart(2, '0');
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// a fake Supabase client: one real, active Google account (older than the simulated ones, so it is the sender) and gmail-send
const fake = { calls: [], accounts: [{ id: 'acc-real', email: 'real@gmail.com', provider: 'gmail', status: 'active', last_error: null, last_checked_at: null, last_synced_at: null, created_at: '2020-01-01T00:00:00.000Z' }] };
fake.functions = { invoke: async (name, opts = {}) => { fake.calls.push({ name, body: opts.body }); return { data: name === 'gmail-send' ? { id: `gm-${fake.calls.length}`, threadId: 't-1' } : {}, error: null }; } };
fake.from = (table) => { const self = { select() { return self; }, eq() { return self; }, order() { return self; }, limit() { return self; }, not() { return self; }, is() { return self; }, maybeSingle() { return self; }, then(res, rej) { return Promise.resolve({ data: table === 'connected_accounts' ? fake.accounts.map((a) => ({ ...a })) : [], error: null }).then(res, rej); } }; return self; };
const G = await import(resolve(here, '../src/gmail.js'));
G.setGmailClient(fake);
await G.reloadAccounts();
const data = await import(resolve(here, '../src/data.js'));
const E = await import(resolve(here, '../src/connected-emails.js'));
await E.ready;
const S = await import(resolve(here, '../src/scheduled-emails.js'));
if (!E.activeAccounts().some((a) => a.id === 'acc-real' && a.real)) fail('the real account is a sender');
await import(resolve(here, '../src/record.js'));
await wait(40);
const contact = data.findRecord('contacts', 3);
if (!contact || !contact.email) fail('contact 3 with e-mail');
const queue = () => JSON.parse(mem['crm:scheduled-emails'] || '[]');
const entryOf = (item) => data.activitiesFor('contacts', 3).find((a) => a.extra && a.extra.scheduledId === item.id);
const actionsIn = (item) => { const li = qa('#rec-timeline .timeline__item').find((el) => text(el).includes(`"${item.subject}"`)); return li ? [...li.querySelectorAll('[data-activity-action]')].map((b) => b.dataset.activityAction) : []; };
const sends = () => fake.calls.filter((c) => c.name === 'gmail-send');

// ---- presets ----
const now = new Date('2026-11-21T15:00:00');
const tomorrowAm = new Date(S.presetSendAt('tomorrow-am', now));
const tomorrowPm = new Date(S.presetSendAt('tomorrow-pm', now));
const monday = new Date(S.presetSendAt('monday-am', now));
if (tomorrowAm.getDate() !== 22 || tomorrowAm.getHours() !== 8 || tomorrowPm.getDate() !== 22 || tomorrowPm.getHours() !== 13 || monday.getDay() !== 1 || monday.getHours() !== 8 || monday <= now || (monday - now) > 8 * 86400000) fail(`presets (${tomorrowAm} / ${tomorrowPm} / ${monday})`);
if (S.presetSendAt('nope') !== null) fail('unknown preset');
log(`preajustes: mañana 08:00, mañana 13:00, lunes 08:00 (${S.timeZoneName()})`);

// ---- the dialog from the composer, a custom time one minute ahead ----
const openComposer = () => { click(q('.record__quick [data-action="email"]')); if ($('compose').hidden) fail('composer open'); };
openComposer();
$('cmp-subject').value = 'Propuesta programada';
$('cmp-text').innerHTML = '<p>Hola, te envío la propuesta <b>programada</b>.</p>';
$('cmp-text').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
click(q('[data-cm="send-later"]'));
const panel = $('cmp-later');
if (!panel || qa('#cmp-later [data-later]').map((b) => b.dataset.later).join(',') !== 'close,tomorrow-am,tomorrow-pm,monday-am,custom,close' || !$('cmp-later-at') || !/Zona horaria:/.test(text(panel))) fail(`send-later dialog (${qa('#cmp-later [data-later]').map((b) => b.dataset.later).join(',')})`);
if (!text(q('#cmp-later [data-later="tomorrow-am"]')).includes('Mañana por la mañana') || !text(q('#cmp-later [data-later="monday-am"]')).includes('Lunes por la mañana')) fail('preset labels');
const inOneMinute = new Date(Date.now() + 60_000); inOneMinute.setSeconds(0, 0);
if (inOneMinute.getTime() <= Date.now()) inOneMinute.setMinutes(inOneMinute.getMinutes() + 1);
$('cmp-later-at').value = localInput(inOneMinute);
panel.querySelector('[data-later-form]').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await wait(10);
if (!$('compose').hidden || $('cmp-later')) fail('composer closes after scheduling');
if (!/^Correo programado para el .* · saldrá por Gmail/.test(text($('toast')))) fail(`toast (${text($('toast'))})`);
let items = queue();
const first = items[0];
if (items.length !== 1 || first.status !== 'scheduled' || first.sendAt !== inOneMinute.toISOString() || first.to[0] !== contact.email || first.subject !== 'Propuesta programada' || !/<b>programada<\/b>/.test(first.html) || !/programada/.test(first.text) || first.fromAccountId !== 'acc-real' || first.via !== 'gmail' || first.recordType !== 'contacts' || String(first.recordId) !== '3') fail(`queued item (${JSON.stringify(first).slice(0, 300)})`);
let entry = entryOf(first);
if (!entry || entry.type !== 'email' || !/^Correo programado para el .* a .*: "Propuesta programada" · se enviará desde real@gmail.com por Gmail$/.test(entry.text) || entry.extra.status !== 'scheduled' || entry.extra.sendAt !== first.sendAt) fail(`timeline entry (${entry && entry.text})`);
if (actionsIn(first).join(',') !== 'cancel-send,edit-send,pin') fail(`timeline actions while scheduled (${actionsIn(first).join(',')})`);
if (sends().length) fail('nothing sent yet');
log(`programado a +1 min: cola con el correo (Gmail, acc-real), cronología «${entry.text.slice(0, 60)}…», acciones Cancelar envío / Editar fecha`);

// ---- not due: nothing; due: the checker sends it through gmail-send and the entry becomes «Correo enviado» ----
if ((await S.processDueEmails(Date.now())).length || sends().length || queue()[0].status !== 'scheduled') fail('not due yet → untouched');
const res = await S.processDueEmails(inOneMinute.getTime() + 1000);
if (res.length !== 1 || res[0].status !== 'sent' || res[0].simulated) fail(`due → sent (${JSON.stringify(res)})`);
const gm = sends()[0];
if (!gm || gm.body.accountId !== 'acc-real' || gm.body.to[0] !== contact.email || gm.body.subject !== 'Propuesta programada' || !/<b>programada<\/b>/.test(gm.body.html) || !/programada/.test(gm.body.text)) fail(`gmail-send call (${JSON.stringify(gm && gm.body).slice(0, 200)})`);
items = queue();
if (items[0].status !== 'sent' || !items[0].sentAt || items[0].gmailId !== 'gm-1') fail('queue item sent with its Gmail id');
await wait(10);
entry = entryOf(first);
if (!entry || !/^Correo enviado a .*: "Propuesta programada" · enviado desde real@gmail.com por Gmail \(programado para el /.test(entry.text) || entry.extra.status !== 'sent' || entry.extra.gmailId !== 'gm-1') fail(`entry after sending (${entry && entry.text})`);
if (actionsIn(first).includes('cancel-send')) fail('no cancel once sent');
log('vencido → gmail-send (html + text, cuenta real), cola «sent» con id de Gmail, cronología «Correo enviado … (programado para el …)»');

// ---- cancel before it goes out ----
openComposer();
$('cmp-subject').value = 'Correo que se cancela';
$('cmp-text').innerHTML = '<p>No debería salir.</p>';
click(q('[data-cm="send-later"]'));
click(q('#cmp-later [data-later="tomorrow-am"]'));
await wait(10);
const second = queue().find((x) => x.subject === 'Correo que se cancela');
if (!second || second.status !== 'scheduled' || second.sendAt !== S.presetSendAt('tomorrow-am')) fail('second e-mail scheduled with the preset');
const cancelBtn = qa('#rec-timeline .timeline__item').find((el) => text(el).includes('"Correo que se cancela"'))?.querySelector('[data-activity-action="cancel-send"]');
click(cancelBtn);
await wait(20);
if (queue().find((x) => x.id === second.id).status !== 'cancelled' || !/Envío cancelado/.test(text($('toast')))) fail('cancelled from the timeline');
entry = entryOf(second);
if (!entry || !/^Envío cancelado: el correo programado para el .* no se enviará\.$/.test(entry.text) || entry.extra.status !== 'cancelled') fail(`cancelled entry (${entry && entry.text})`);
if ((await S.processDueEmails(Date.now() + 10 * 86400000)).length || sends().length !== 1) fail('a cancelled e-mail never goes out');
if (actionsIn(second).includes('cancel-send')) fail('no actions once cancelled');
log('cancelado antes de la hora: cola «cancelled», cronología «Envío cancelado …», nada sale');

// ---- edit the date, then it goes out at the new time ----
openComposer();
$('cmp-subject').value = 'Correo que se mueve';
$('cmp-text').innerHTML = '<p>Sale más tarde.</p>';
click(q('[data-cm="send-later"]'));
click(q('#cmp-later [data-later="monday-am"]'));
await wait(10);
const third = queue().find((x) => x.subject === 'Correo que se mueve');
const editBtn = qa('#rec-timeline .timeline__item').find((el) => text(el).includes('"Correo que se mueve"'))?.querySelector('[data-activity-action="edit-send"]');
click(editBtn);
await wait(10);
if (!$('rec-modal').classList.contains('is-open') || !$('resched-at') || !q('[data-confirm="reschedule-send"]')) fail('edit-date dialog');
const inTwoMinutes = new Date(Date.now() + 120_000); inTwoMinutes.setSeconds(0, 0);
$('resched-at').value = localInput(inTwoMinutes);
click(q('[data-confirm="reschedule-send"]'));
await wait(20);
if (queue().find((x) => x.id === third.id).sendAt !== inTwoMinutes.toISOString() || !/Envío reprogramado/.test(text($('toast'))) || $('rec-modal').classList.contains('is-open')) fail('rescheduled');
entry = entryOf(third);
if (!entry || !entry.text.includes(S.whenText(inTwoMinutes.toISOString())) || entry.extra.status !== 'scheduled') fail('entry shows the new date');
if ((await S.processDueEmails(inTwoMinutes.getTime() - 30_000)).length) fail('not before the new time');
if ((await S.processDueEmails(inTwoMinutes.getTime() + 1000)).length !== 1 || sends().length !== 2 || sends()[1].body.subject !== 'Correo que se mueve') fail('sent at the new time');
log('fecha editada desde la cronología: sale a la nueva hora (segundo gmail-send)');

// ---- a simulated account: marked sent without any Gmail call; an inactive real account → error, then «Editar fecha» retries ----
const sim = E.accounts().find((a) => !a.real);
const simItem = S.scheduleEmail({ to: ['x@ejemplo.com'], toNames: 'X', subject: 'Simulado', html: '<p>Hola</p>', text: 'Hola', fromAccountId: sim ? sim.id : '', fromName: 'Fernando L.', fromEmail: sim ? sim.email : 'sim@ejemplo.com', via: 'simulado', recordType: 'contacts', recordId: 3, sendAt: new Date(Date.now() + 60_000).toISOString() });
S.logScheduled(simItem);
const r2 = await S.processDueEmails(Date.now() + 120_000);
if (r2.length !== 1 || r2[0].status !== 'sent' || !r2[0].simulated || sends().length !== 2 || !/^Simulación · no se envió ningún correo \(programado para el /.test(entryOf(simItem).text)) fail('simulated account → sent without Gmail');
fake.accounts[0].status = 'error';
await G.reloadAccounts();
const errItem = S.scheduleEmail({ to: [contact.email], toNames: contact.name, subject: 'Con error', html: '<p>x</p>', text: 'x', fromAccountId: 'acc-real', fromName: 'Fernando L.', fromEmail: 'real@gmail.com', via: 'gmail', recordType: 'contacts', recordId: 3, sendAt: new Date(Date.now() + 60_000).toISOString() });
S.logScheduled(errItem);
const r3 = await S.processDueEmails(Date.now() + 120_000);
if (r3.length !== 1 || r3[0].status !== 'error' || queue().find((x) => x.id === errItem.id).status !== 'error' || !/No se pudo enviar el correo programado/.test(entryOf(errItem).text)) fail(`inactive account → error (${JSON.stringify(r3)})`);
fake.accounts[0].status = 'active';
await G.reloadAccounts();
await S.rescheduleEmail(errItem.id, new Date(Date.now() + 60_000).toISOString());
if (queue().find((x) => x.id === errItem.id).status !== 'scheduled' || (await S.processDueEmails(Date.now() + 120_000)).length !== 1 || sends().length !== 3) fail('after «Editar fecha» the errored e-mail goes out');
log('cuenta simulada → «Simulación» sin Gmail; cuenta real inactiva → error con motivo; reprogramado → sale');

// ---- the checker: started by every page, one tick per minute ----
if (!readFileSync(resolve(here, '../src/page.js'), 'utf8').includes('startScheduledEmailChecker')) fail('page.js starts the checker');
S.startScheduledEmailChecker();
if (!S.checkerRunning() || !S.lastCheckedAt()) fail('checker running after start');
S.stopScheduledEmailChecker();
if (S.checkerRunning()) fail('checker stopped');
log('verificador: arranca desde page.js, un tic por minuto');
console.log('[send-later] OK');
process.exit(0);
