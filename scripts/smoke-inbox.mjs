// DOM smoke test for the Bandeja de entrada: the seeded [Prueba] conversations, the three columns (list with
// filters, thread with bubbles and reply box, contact card with actions), the new-conversation dialog, the
// timeline entries on the contact and the unread counter on the side navigation. Run: node scripts/smoke-inbox.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[inbox]', ...a);
const fail = (msg) => { console.error(`[inbox] FAIL: ${msg}`); process.exit(1); };
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main class="content content--inbox" id="inbox-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/inbox/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.history = dom.window.history;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.FormData = dom.window.FormData;
globalThis.Event = dom.window.Event;
const $ = (id) => document.getElementById(id);
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const change = (el, v) => { el.value = v; el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); };
const items = () => [...document.querySelectorAll('#inbox-items .inbox__item')];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const data = await import(resolve(here, '../src/data.js'));
const Conv = await import(resolve(here, '../src/conversations-data.js'));
await Conv.ready;
const unreadAtStart = Conv.unreadCount(); // before the page opens (and reads) the first conversation
await import(resolve(here, '../src/inbox.js'));
await wait(10);

// 1) the seed and the side navigation
const all = Conv.conversations();
log('conversations:', all.length, '| [Prueba]:', all.filter((c) => c.subject.startsWith('[Prueba]')).length, '| channels:', [...new Set(all.map((c) => c.channel))].join(','), '| messages:', all.map((c) => Conv.messagesOf(c.id).length).join('/'), '| unread:', Conv.unreadCount());
if (all.length !== 5 || all.some((c) => !c.subject.startsWith('[Prueba]') || !c.contact) || all.some((c) => Conv.messagesOf(c.id).length < 2 || Conv.messagesOf(c.id).length > 4)) fail('five test conversations with 2-4 messages linked to contacts');
const navLink = [...document.querySelectorAll('#sidenav .sidenav__sub')].find((a) => text(a).startsWith('Bandeja de entrada'));
const badge = document.querySelector('#sidenav [data-nav-badge="inbox"].sidenav__badge');
log('nav link:', navLink && navLink.getAttribute('href'), '| badge:', badge && text(badge), '| rail badge:', text(document.querySelector('.sidenav__railbadge')));
if (!navLink || navLink.getAttribute('href') !== '../inbox/' || !badge || Number(text(badge)) !== Conv.unreadCount() || badge.hidden) fail('side navigation entry with the unread counter');

// 2) the list: open conversations by default, each with contact, subject, excerpt, time and channel dot
log('open items:', items().length, '| first:', text(items()[0].querySelector('.inbox__who')), '/', text(items()[0].querySelector('.inbox__subject')), '/', text(items()[0].querySelector('.inbox__excerpt')).slice(0, 40), '/', text(items()[0].querySelector('.inbox__time')), '| dots:', items().every((li) => li.querySelector('.inbox__dot')), '| unread marked:', items().filter((li) => li.classList.contains('is-unread')).length);
if (items().length !== 3 || !items()[0].querySelector('.inbox__dot') || !/hace|ahora/.test(text(items()[0].querySelector('.inbox__time')))) fail('the open conversations are listed with their details');
// the selected (first) one was marked read on load
const first = Conv.conversationById(items()[0].dataset.id);
log('first selected:', items()[0].classList.contains('is-active'), '| read now:', !first.unread, '| badge after reading:', text(badge));
if (!items()[0].classList.contains('is-active') || first.unread || Number(text(badge)) !== unreadAtStart - 1) fail('opening a conversation marks it read and updates the counter');
// filters
click(document.querySelector('.inbox__tab[data-who="unassigned"]'));
log('Sin asignar:', items().length, items().map((li) => text(li.querySelector('.inbox__who'))).join(', '));
if (items().length !== 2 || items().some((li) => Conv.conversationById(li.dataset.id).assignedTo)) fail('Sin asignar filter');
click(document.querySelector('.inbox__tab[data-who="mine"]'));
log('Asignados a mí (open):', items().length);
if (items().length !== 1 || Conv.conversationById(items()[0].dataset.id).assignedTo !== Conv.ME) fail('Asignados a mí filter');
change($('inbox-status'), 'closed');
log('mine + closed:', items().length);
if (items().length !== 1 || Conv.conversationById(items()[0].dataset.id).status !== 'closed') fail('status filter');
click(document.querySelector('.inbox__tab[data-who="all"]'));
change($('inbox-status'), '');
change($('inbox-channel'), 'whatsapp');
log('all + whatsapp:', items().length, '| channel:', items()[0] && Conv.conversationById(items()[0].dataset.id).channel);
if (items().length !== 1 || Conv.conversationById(items()[0].dataset.id).channel !== 'whatsapp') fail('channel filter');
change($('inbox-channel'), '');
change($('inbox-status'), 'open');

// 3) the thread and the reply box
const wa = Conv.conversations().find((c) => c.channel === 'whatsapp');
click(document.querySelector(`.inbox__item[data-id="${wa.id}"]`));
const bubbles = () => [...document.querySelectorAll('#inbox-messages .msg')];
log('thread:', text(document.querySelector('.inbox__threadhead h2')), '| bubbles:', bubbles().length, '| in/out:', bubbles().map((m) => (m.classList.contains('msg--in') ? 'in' : 'out')).join(','), '| meta:', text(bubbles()[0].querySelector('.msg__meta')), '| url:', location.search);
if (!/Medidas para la mampara/.test(text(document.querySelector('.inbox__threadhead h2'))) || bubbles().length !== 2 || !bubbles().every((m) => m.classList.contains('msg--in')) || location.search !== `?id=${wa.id}`) fail('thread of the selected conversation');
const contactActsBefore = data.activitiesFor('contacts', wa.contactId).length;
$('inbox-reply').elements.body.value = 'Perfecto, el jueves a las 10:00 pasa nuestro técnico.';
$('inbox-reply').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
const waNow = Conv.conversationById(wa.id);
const last = Conv.messagesOf(wa.id).pop();
log('after reply: bubbles', bubbles().length, '| last out:', bubbles().pop().classList.contains('msg--out'), '| author:', last.author, '| last_message_at updated:', waNow.lastMessageAt === last.createdAt, '| toast:', text($('toast')));
if (bubbles().length !== 3 || !bubbles().pop().classList.contains('msg--out') || last.direction !== 'out' || waNow.lastMessageAt !== last.createdAt || last.author !== Conv.ME) fail('reply inserts a message and updates last_message_at');
const act = data.activitiesFor('contacts', wa.contactId)[0];
log('contact timeline:', data.activitiesFor('contacts', wa.contactId).length - contactActsBefore, 'new |', act.type, '|', act.text.slice(0, 60), '|', JSON.stringify(act.extra));
if (data.activitiesFor('contacts', wa.contactId).length !== contactActsBefore + 1 || act.type !== 'message' || act.extra.channel !== 'WhatsApp' || !/Mensaje enviado por WhatsApp/.test(act.text)) fail('the message lands on the contact timeline with the channel type');
log('stored locally:', JSON.parse(mem['crm:conversation_messages']).some((m) => m.id === last.id));
if (!JSON.parse(mem['crm:conversation_messages']).some((m) => m.id === last.id)) fail('message persisted');

// 4) the contact card and the actions
const side = $('inbox-side');
log('contact card:', text(side.querySelector('.inbox__contactname')), '|', side.querySelector('.inbox__contactname').getAttribute('href'), '| email:', text([...side.querySelectorAll('.props__row')][0].querySelector('dd')), '| company:', text([...side.querySelectorAll('.props__row')][1].querySelector('dd')));
if (text(side.querySelector('.inbox__contactname')) !== wa.contact.name || side.querySelector('.inbox__contactname').getAttribute('href') !== `../contacts/record/?id=${wa.contactId}`) fail('contact card');
change($('inbox-assign'), 'Sofía R.');
log('assigned:', Conv.conversationById(wa.id).assignedTo, '| header:', text(document.querySelector('.inbox__threadsub')));
if (Conv.conversationById(wa.id).assignedTo !== 'Sofía R.' || !/asignada a Sofía R\./.test(text(document.querySelector('.inbox__threadsub')))) fail('assign');
click(side.querySelector('[data-inbox="toggle-status"]'));
log('closed:', Conv.conversationById(wa.id).status, '| still selected in open list:', Boolean(document.querySelector(`.inbox__item[data-id="${wa.id}"]`)), '| button:', text($('inbox-side').querySelector('[data-inbox="toggle-status"]')));
if (Conv.conversationById(wa.id).status !== 'closed' || text($('inbox-side').querySelector('[data-inbox="toggle-status"]')) !== 'Reabrir') fail('close');
click($('inbox-side').querySelector('[data-inbox="toggle-status"]'));
if (Conv.conversationById(wa.id).status !== 'open') fail('reopen');
click($('inbox-side').querySelector('[data-inbox="snooze"]'));
log('snoozed:', Conv.conversationById(wa.id).status, '| tag:', text(document.querySelector('.inbox__threadsub .tag')));
if (Conv.conversationById(wa.id).status !== 'snoozed' || text(document.querySelector('.inbox__threadsub .tag')) !== 'Pospuesto') fail('snooze');
click($('inbox-side').querySelector('[data-inbox="snooze"]'));
// a reply to a closed conversation reopens it
Conv.setConversationStatus(wa.id, 'closed');
Conv.sendMessage(wa.id, { body: 'Una cosa más…', direction: 'out' });
if (Conv.conversationById(wa.id).status !== 'open') fail('replying reopens a closed conversation');

// 5) "+": a new conversation with contact, channel, subject and first message
click(document.querySelector('[data-inbox="new"]'));
log('modal open:', $('inbox-modal').classList.contains('is-open'), '| fields:', [...$('inbox-new').querySelectorAll('[name]')].map((e) => e.name).join(','), '| contact preselected:', $('inbox-new').elements.contactId.value === String(wa.contactId));
if (!$('inbox-modal').classList.contains('is-open') || [...$('inbox-new').querySelectorAll('[name]')].map((e) => e.name).join(',') !== 'contactId,channel,subject,direction,body') fail('new conversation dialog');
$('inbox-new').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
if (!$('inbox-modal').classList.contains('is-open') || $('inbox-new-error').hidden) fail('subject and message are required');
const target = data.allContacts().find((c) => Number(c.id) === 9);
$('inbox-new').elements.contactId.value = '9';
$('inbox-new').elements.channel.value = 'email';
$('inbox-new').elements.subject.value = 'Presupuesto de barandillas';
$('inbox-new').elements.direction.value = 'out';
$('inbox-new').elements.body.value = 'Hola, te envío el presupuesto de las barandillas de cristal.';
$('inbox-new').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
const created = Conv.conversations().find((c) => c.subject === 'Presupuesto de barandillas');
log('created:', Boolean(created), '| contact:', created && created.contact.name, '| assigned:', created && created.assignedTo, '| selected:', created && document.querySelector(`.inbox__item[data-id="${created.id}"].is-active`) !== null, '| modal closed:', !$('inbox-modal').classList.contains('is-open'), '| contact timeline:', data.activitiesFor('contacts', 9)[0].type, data.activitiesFor('contacts', 9)[0].text.slice(0, 40));
if (!created || created.contactId !== 9 || created.channel !== 'email' || created.assignedTo !== Conv.ME || Conv.messagesOf(created.id).length !== 1 || !document.querySelector(`.inbox__item[data-id="${created.id}"].is-active`) || data.activitiesFor('contacts', 9)[0].type !== 'email' || target.name !== created.contact.name) fail('new conversation');
// an incoming conversation counts as unread until it is opened
const incoming = Conv.createConversation({ contactId: 12, channel: 'chat', subject: 'Pregunta del chat', body: '¿Tienen vidrio templado de 12 mm?', direction: 'in', author: 'Visitante' });
log('incoming unread:', incoming.unread, '| counter:', Conv.unreadCount(), '| badge:', text(document.querySelector('.sidenav__badge')));
if (!incoming.unread) fail('incoming message is unread');
await import(resolve(here, '../src/inbox.js') + '?again');
log('badge after refresh:', text(document.querySelector('.sidenav__badge')), '| counter:', Conv.unreadCount());
if (Number(text(document.querySelector('.sidenav__badge'))) !== Conv.unreadCount()) fail('badge follows the counter');
log('OK');
process.exit(0);
