// Smoke test for the inbox «Responder | Comentario» tabs: a comment is an internal note (addInternalNote): it shows
// in the thread as a yellow bubble «Comentario interno · <autor>», is never sent (no sendMessage / Gmail: a fetch
// spy stays silent and the code path has no sendMail), does not reopen a closed conversation nor move it, lands on
// the contact timeline as a note linking the conversation, Ctrl+Enter works in both tabs, the tab is remembered
// per conversation during the session and «Responder» still sends as before. Run: node scripts/smoke-inbox-comments.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[inbox-comments]', ...a);
const fail = (msg) => { console.error(`[inbox-comments] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main class="content content--inbox" id="inbox-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/inbox/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'FormData', 'URL', 'Blob', 'MutationObserver']) globalThis[k] = dom.window[k];
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
dom.window.HTMLElement.prototype.scrollBy = function () {};
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls += 1; throw new Error('network blocked in the test'); };
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const submit = () => $('inbox-reply').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const ctrlEnter = () => $('inbox-reply').elements.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));

// static: the note branch of the submit handler has no Gmail send
const src = readFileSync(resolve(here, '../src/inbox.js'), 'utf8');
const noteBranch = src.slice(src.indexOf("composeMode(state.activeId) === 'note'"), src.indexOf('const m = sendMessage(state.activeId'));
if (!noteBranch.includes('addInternalNote(') || /sendMail|sendMessage\(/.test(noteBranch)) fail('the comment branch must only call addInternalNote (no sendMail / sendMessage)');
log('static: comment branch → addInternalNote only');

const data = await import(resolve(here, '../src/data.js'));
const Conv = await import(resolve(here, '../src/conversations-data.js'));
await Conv.ready;
await import(resolve(here, '../src/inbox.js'));
await wait(40);
const conv = Conv.conversations().find((c) => c.channel === 'email' && c.contactId);
if (!conv) fail('an e-mail conversation with a contact');
Conv.setConversationStatus(conv.id, 'closed');
const before = Conv.conversationById(conv.id);
// select it (closed ones are hidden by the default filter: switch the status chip first)
const statusChip = $('inbox-status');
statusChip.value = 'closed'; statusChip.dispatchEvent(new window.Event('change', { bubbles: true }));
await wait(20);
click(q(`.inbox__item[data-id="${conv.id}"]`));
await wait(20);
const bubbles = () => qa('#inbox-messages .msg');
const nBefore = bubbles().length;
const actsBefore = data.activitiesFor('contacts', conv.contactId).length;

// 1) tabs over the editor; Comentario changes placeholder, button and footer
const tabs = qa('#inbox-reply [data-compose]').map(text);
if (tabs.join('|') !== 'Responder|Comentario' || !q('#inbox-reply [data-compose="reply"].is-active')) fail(`tabs: ${tabs.join('|')}`);
$('inbox-reply').elements.body.value = 'Borrador que no se pierde';
click(q('#inbox-reply [data-compose="note"]'));
await wait(10);
const form = $('inbox-reply');
if (form.dataset.mode !== 'note' || !form.classList.contains('inbox__reply--note') || form.elements.body.placeholder !== 'Escribe un comentario interno…' || text(form.querySelector('[type="submit"]')) !== 'Comentar' || form.elements.body.value !== 'Borrador que no se pierde') fail('Comentario tab: placeholder, button, draft kept');
if (!/no se envía al contacto/.test(text(form.querySelector('.inbox__replyfoot')))) fail('footer explains the comment is internal');
log('tabs: Responder | Comentario; Comentario → «Comentar», placeholder interno, borrador conservado');

// 2) a comment (Ctrl+Enter) → yellow bubble with author, nothing sent, closed stays closed, timeline note
form.elements.body.value = 'Ojo: el cliente pidió factura a nombre de la empresa.';
ctrlEnter();
await wait(30);
const after = Conv.conversationById(conv.id);
const msgs = Conv.messagesOf(conv.id);
const note = msgs[msgs.length - 1];
if (!note || note.kind !== 'note' || !Conv.isInternalNote(note) || note.author !== Conv.ME) fail('comment stored as kind note by the author');
if (bubbles().length !== nBefore + 1 || !bubbles().pop().classList.contains('msg--note') || !/Comentario interno · Fernando L\./.test(text(bubbles().pop().querySelector('.msg__meta')))) fail('yellow bubble «Comentario interno · autor» in the thread');
if (after.status !== 'closed' || after.lastMessageAt !== before.lastMessageAt || (after.readAt || '') !== (before.readAt || '')) fail('a comment does not reopen, mark as answered nor move the conversation');
if (after.lastMessage && after.lastMessage.id === note.id) fail('the list preview ignores comments');
if (networkCalls !== 0) fail('no network call for a comment');
if (!/Comentario guardado/.test(text($('toast')))) fail('toast');
const acts = data.activitiesFor('contacts', conv.contactId);
const act = acts[0];
if (acts.length !== actsBefore + 1 || act.type !== 'note' || !act.text.includes(`«${conv.subject}»`) || !act.text.includes(`../inbox/?id=${conv.id}`) || act.extra.conversationId !== conv.id || !act.extra.internal) fail('contact timeline: note linking the conversation');
if (!JSON.parse(mem['crm:conversation_messages']).some((m) => m.id === note.id && m.kind === 'note')) fail('comment persisted');
log('comment: bubble', text(bubbles().pop().querySelector('.msg__meta')).slice(0, 32), '| status', after.status, '| network calls', networkCalls, '| timeline note ok');

// 3) the tab is remembered per conversation; another conversation starts on Responder
statusChip.value = ''; statusChip.dispatchEvent(new window.Event('change', { bubbles: true }));
await wait(20);
const other = Conv.conversations().find((c) => c.id !== conv.id);
click(q(`.inbox__item[data-id="${other.id}"]`));
await wait(10);
if ($('inbox-reply').dataset.mode !== 'reply') fail('another conversation opens on Responder');
click(q(`.inbox__item[data-id="${conv.id}"]`));
await wait(10);
if ($('inbox-reply').dataset.mode !== 'note' || !q('#inbox-reply [data-compose="note"].is-active')) fail('the Comentario tab is remembered for the conversation');
log('tab remembered per conversation');

// 4) Responder still sends (and reopens the closed thread) as before
click(q('#inbox-reply [data-compose="reply"]'));
$('inbox-reply').elements.body.value = 'Gracias, lo revisamos hoy mismo.';
submit();
await wait(30);
const sent = Conv.messagesOf(conv.id).pop();
const now = Conv.conversationById(conv.id);
if (!sent || sent.kind !== 'message' || sent.direction !== 'out' || now.status !== 'open' || !bubbles().pop().classList.contains('msg--out')) fail('Responder sends a real message and reopens');
log('Responder: sends, reopens, msg--out bubble');
console.log('[inbox-comments] OK');
process.exit(0);
