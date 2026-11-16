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
// The assignee shows as an owner (avatar + name), so the text carries the initials before the name.
if (Conv.conversationById(wa.id).assignedTo !== 'Sofía R.' || !/asignada a .*Sofía R\./.test(text(document.querySelector('.inbox__threadsub'))) || !document.querySelector('.inbox__threadsub .owner .avatar')) fail('assign');
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

// ===== Side navigation: "Bandeja de entrada" lives only in CRM (with its badge), not in Servicio =====
const inboxLinks = [...document.querySelectorAll('#sidenav a[href$="inbox/"]')];
if (inboxLinks.length !== 1 || !inboxLinks[0].querySelector('[data-nav-badge="inbox"]')) fail(`one inbox link with its badge expected, got ${inboxLinks.length}`);
const groups = [...document.querySelectorAll('#sidenav .sidenav__group')];
const crmGroup = groups.find((g) => text(g).includes('Contactos'));
const serviceGroup = groups.find((g) => text(g).includes('Encuestas de feedback'));
if (!crmGroup || !text(crmGroup).includes('Bandeja de entrada') || !serviceGroup || text(serviceGroup).includes('Bandeja de entrada')) fail('inbox must be in CRM and not in Servicio');
log('nav: one "Bandeja de entrada" (CRM) with the unread badge; none in Servicio');

// ===== Ajustes › Herramientas › Bandeja de entrada (4 pages) =====
const dom2 = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main class="content content--settings" id="settings-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/settings/#ib-channels', pretendToBeVisual: true });
globalThis.window = dom2.window; globalThis.document = dom2.window.document; globalThis.location = dom2.window.location; globalThis.history = dom2.window.history; globalThis.HTMLElement = dom2.window.HTMLElement; globalThis.FormData = dom2.window.FormData; globalThis.Event = dom2.window.Event; globalThis.CustomEvent = dom2.window.CustomEvent;
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const click2 = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom2.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const input2 = (el, v) => { el.value = v; el.dispatchEvent(new dom2.window.Event('input', { bubbles: true })); };
const change2 = (el, v) => { if (v !== undefined) el.value = v; el.dispatchEvent(new dom2.window.Event('change', { bubbles: true })); };
const goSection = async (id) => { location.hash = `#${id}`; window.dispatchEvent(new dom2.window.Event('hashchange')); await wait(10); };
const IS = await import(resolve(here, '../src/inbox-settings.js'));
await IS.ready;
await import(resolve(here, '../src/settings.js'));
await wait(10);
// 1) Canales
if (!q('#ibs[data-ibs="channels"]')) fail('Canales page');
const cards = () => qa('.ibs__card');
if (cards().map((c) => text(c.querySelector('strong'))).join('|') !== 'Chat|Formulario|Correo del equipo|Llamadas|WhatsApp|Facebook Messenger') fail(`channel cards: ${cards().map((c) => text(c.querySelector('strong'))).join('|')}`);
if (!text(q('[data-channel-card="chat"]')).includes('3 chats activos') || !text(q('[data-channel-card="forms"] [data-ib="connect"]')).includes('Conectar formulario') || !text(q('[data-channel-card="teamEmail"]')).includes('1 dirección conectada') || text(q('[data-channel-card="calls"] [data-ib="connect"]')) !== 'Conectar número de teléfono' || text(q('[data-channel-card="whatsapp"] [data-ib="connect"]')) !== 'Conectar número' || !text(q('[data-channel-card="messenger"]')).includes('páginas')) fail('card contents');
click2(q('[data-channel-card="forms"] [data-ib="connect"]'));
if (!$('ibs-modal').classList.contains('is-open') || qa('[data-ibf-form]').length !== 3) fail('forms flow');
$('ibs-modal').querySelector('[data-ibf-form="cotizacion"]').checked = true;
click2(q('[data-ibm="forms-save"]'));
if (!text(q('[data-channel-card="forms"]')).includes('1 formulario conectado') || !IS.channels().forms.forms.includes('cotizacion')) fail('form connected');
click2(q('[data-channel-card="calls"] [data-ib="connect"]'));
input2($('ibf-number'), '712 690 1001');
click2(q('[data-ibm="calls-send"]'));
if (!text($('ibs-modal')).includes('Paso 2 de 2') || !$('ibf-code')) fail('calls step 2');
input2($('ibf-code'), '12');
click2(q('[data-ibm="calls-verify"]'));
if ($('ibf-err').hidden) fail('code validation');
input2($('ibf-code'), '123456');
click2(q('[data-ibm="calls-verify"]'));
if (!IS.channels().calls.numbers.includes('+527126901001') || !text(q('[data-channel-card="calls"]')).includes('1 número conectado')) fail('calls connected');
click2(q('[data-channel-card="whatsapp"] [data-ib="connect"]'));
input2($('ibf-wa'), '+52 712 690 1002');
click2(q('[data-ibm="wa-next"]'));
click2(q('[data-ibm="wa-linked"]'));
if (!text($('ibs-modal')).includes('Paso 3 de 3')) fail('whatsapp step 3');
click2(q('[data-ibm="wa-done"]'));
if (!IS.channels().whatsapp.numbers.includes('+527126901002')) fail('whatsapp connected');
click2(q('[data-channel-card="messenger"] [data-ib="connect"]'));
$('ibs-modal').querySelector('[data-ibf-page="megaglass"]').checked = true;
click2(q('[data-ibm="pages-save"]'));
if (!text(q('[data-channel-card="messenger"]')).includes('1 página conectada')) fail('messenger connected');
click2(q('[data-channel-card="chat"] [data-ib="connect"]'));
input2($('ibf-chat-name'), 'Chat de ventas');
click2(q('[data-ibm="chat-save"]'));
if (IS.channels().chat.name !== 'Chat de ventas') fail('chat configured');
click2(q('[data-channel-card="teamEmail"] [data-ib="connect"]'));
await wait(10);
if (!$('cem-wizard') || !$('cem-wizard').classList.contains('is-open')) fail('team e-mail must reuse the connected-accounts wizard');
click2(q('#cem-wizard [data-w="close"]'));
if (!JSON.parse(mem['crm:inbox_settings:channels']).calls.numbers.length) fail('channels not persisted');
log('channels: 6 cards, forms / calls (code) / WhatsApp (3 steps) / Messenger / chat flows, team e-mail → connected-accounts wizard');
// 2) Bandejas de entrada
await goSection('ib-inboxes');
if (!q('#ibs[data-ibs="inboxes"]') || qa('#ibx-current option').length !== 1 || !text(q('.ibs__current')).includes('Solo estás modificando esta vista')) fail('inboxes page');
if (qa('.ibs__current .menu__item').map(text).join('|') !== 'Renombrar|Crear bandeja|Eliminar' || qa('[data-ibx-tab]').map(text).join('|') !== 'Canales|ANS|Personalización de la barra lateral|Acceso') fail('inbox actions / tabs');
if (qa('#ibx-channels li').length !== 2) fail('inbox channels');
click2(q('[data-ibx="add-channel"]'));
const pick = $('ibs-modal').querySelector('[data-ibx-pick="forms:cotizacion"]');
if (!pick) fail('connected form must be offered to the inbox');
pick.checked = true;
click2(q('[data-ibm="add-channel"]'));
if (qa('#ibx-channels li').length !== 3 || !IS.inboxById('inbox-main').channels.includes('forms:cotizacion')) fail('channel added to the inbox');
click2(q('[data-ibx-tab="sla"]'));
if (!text($('ibx-body')).includes('Define cuándo se aplican los ANS') || !q('[data-ibx-sla-basis="business"]').checked || !text($('ibx-body')).includes('Fijar límites del ANS') || qa('.ibs__switchlbl').map(text).join('|') !== 'DESACTIVADA|DESACTIVADA') fail('ANS tab');
const slaOn = q('[data-ibx-sla-on="firstReply"]');
slaOn.checked = true;
change2(slaOn);
if (!q('[data-ibx-sla-h="firstReply"]') || text(q('.ibs__switchlbl')) !== 'ACTIVADA') fail('ANS switch must reveal hours/minutes');
change2(q('[data-ibx-sla-h="firstReply"]'), '2');
if (IS.inboxById('inbox-main').sla.firstReply.on !== true || IS.inboxById('inbox-main').sla.firstReply.hours !== 2) fail('ANS limit persisted');
change2(q('[data-ibx-sla-basis="calendar"]'), 'calendar');
if (IS.inboxById('inbox-main').sla.basis !== 'calendar') fail('ANS basis');
click2(q('[data-ibx-tab="views"]'));
if (qa('.ibs__table thead th').map(text).join('|') !== 'Ver nombre|Asignado a|Última actualización|Acciones' || qa('#ibx-views tr').length !== 2) fail('views tab');
click2(q('[data-ibx="create-view"]'));
input2($('ibx-view-name'), 'Urgentes');
change2($('ibx-view-assignee'), 'Sofía R.');
click2(q('[data-ibm="create-view"]'));
if (qa('#ibx-views tr').length !== 3 || !IS.inboxById('inbox-main').views.some((v) => v.name === 'Urgentes' && v.assignedTo === 'Sofía R.')) fail('team view created');
click2(q('[data-ibx-tab="access"]'));
if (!q('[data-ibx-access="all"]').checked || !$('ibx-access-lists').hidden) fail('access tab');
change2(q('[data-ibx-access="selected"]'), 'selected');
if ($('ibx-access-lists').hidden) fail('selected access must show users and teams');
const su = q('[data-ibx-user="Sofía R."]'); su.checked = true; change2(su);
const st = q('[data-ibx-team="SACA"]'); st.checked = true; change2(st);
const acc = IS.inboxById('inbox-main').access;
if (acc.mode !== 'selected' || !acc.users.includes('Sofía R.') || !acc.teams.includes('SACA')) fail('access persisted');
click2(q('[data-ibx="create"]'));
input2($('ibx-name'), 'Soporte');
click2(q('[data-ibm="create"]'));
if (qa('#ibx-current option').length !== 2 || text(qa('#ibx-current option').find((o) => o.selected)) !== 'Soporte') fail('inbox created and selected');
click2(q('[data-ibx="rename"]'));
input2($('ibx-name'), 'Soporte técnico');
click2(q('[data-ibm="rename"]'));
if (!IS.inboxes().some((i) => i.name === 'Soporte técnico')) fail('inbox renamed');
click2(q('[data-ibx="delete"]'));
click2(q('[data-ibm="delete"]'));
if (IS.inboxes().length !== 1 || qa('#ibx-current option').length !== 1) fail('inbox deleted');
log('inboxes: current view + Acciones (create/rename/delete), tabs Canales / ANS / vistas / Acceso persisted');
// 3) Gestión de disponibilidad (and its effect on automatic assignment)
await goSection('ib-availability');
if (!q('#ibs[data-ibs="availability"]') || !$('av-user') || !$('av-status') || !$('av-team') || !$('av-inbox') || qa('#av-rows tr[data-user]').length !== 4) fail('availability page');
if (q('[data-av-user="Diego G."]').value !== 'away' || !q('tr[data-user="Fernando L."] .ibs__dot--available')) fail('seeded statuses');
change2(q('[data-av-user="Fernando L."]'), 'away');
if (IS.availableUsers().includes('Fernando L.') || q('tr[data-user="Fernando L."] .ibs__dot--available')) fail('status change');
change2($('av-status'), 'away');
if (qa('#av-rows tr[data-user]').length !== 2) fail('status filter');
change2($('av-status'), '');
change2($('av-team'), 'SACA');
if (qa('#av-rows tr[data-user]').length !== 1) fail('team filter');
change2($('av-team'), '');
const assigned = [];
for (let i = 0; i < 4; i += 1) assigned.push(Conv.createConversation({ contactId: 12, channel: 'chat', subject: `Entrante ${i}`, body: 'Hola', direction: 'in', author: 'Visitante' }).assignedTo);
if (assigned.some((a) => a === 'Fernando L.' || a === 'Diego G.' || !a) || new Set(assigned).size !== 2) fail(`auto-assignment must rotate over the available users: ${assigned.join(', ')}`);
$('av-auto').checked = false;
change2($('av-auto'));
if (Conv.createConversation({ contactId: 12, channel: 'chat', subject: 'Sin turno', body: 'Hola', direction: 'in', author: 'Visitante' }).assignedTo !== '') fail('auto-assignment off → unassigned');
$('av-auto').checked = true;
change2($('av-auto'));
log(`availability: filters, per-user status, round-robin assignment over available users (${[...new Set(assigned)].join(', ')})`);
// 4) Lista de permitidos y denegados
await goSection('ib-spam');
if (!q('#ibs[data-ibs="spam"]') || !text(q('#ibs')).includes('Elige qué conversaciones entrantes deberían marcarse como spam') || !text(q('#ibs')).includes('Nunca marcar conversaciones de los remitentes como spam') || !text(q('#ibs')).includes('Siempre marcar')) fail('spam page');
input2($('spam-allow'), 'no-es-valido');
q('[data-spam-form="allow"]').dispatchEvent(new dom2.window.Event('submit', { bubbles: true, cancelable: true }));
if (IS.spam().allow.length !== 1) fail('invalid entry must be rejected');
input2($('spam-allow'), 'cliente@ejemplo.com');
q('[data-spam-form="allow"]').dispatchEvent(new dom2.window.Event('submit', { bubbles: true, cancelable: true }));
if (!IS.spam().allow.includes('cliente@ejemplo.com') || !qa('#spam-allow-rows tr[data-entry]').some((r) => r.dataset.entry === 'cliente@ejemplo.com')) fail('allow entry added');
input2($('spam-deny'), 'Spam.Example');
q('[data-spam-form="deny"]').dispatchEvent(new dom2.window.Event('submit', { bubbles: true, cancelable: true }));
if (!IS.spam().deny.includes('spam.example') || !IS.isSpamSender('alguien@spam.example') || IS.isSpamSender('cliente@ejemplo.com')) fail('deny entry / spam check');
click2(q('[data-spam-remove="allow"][data-entry="cliente@ejemplo.com"]'));
if (IS.spam().allow.includes('cliente@ejemplo.com')) fail('entry removed');
$('spam-auto').checked = false;
change2($('spam-auto'));
if (IS.spam().autoSpam !== false || JSON.parse(mem['crm:inbox_settings:spam']).autoSpam !== false) fail('auto-spam persisted');
log('spam: allow/deny lists with validation, removal and the automatic-spam switch');
log('OK');
process.exit(0);
