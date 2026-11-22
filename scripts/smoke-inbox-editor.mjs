// DOM smoke test for the inbox reply editor (src/inbox.js + src/rich-text.js): a contenteditable with B / I /
// list / link and an «Insertar» menu (templates and snippets resolved with the conversation's contact,
// documents); inserting a template resolves {{contacto.nombre}}; bold on a selection; sending keeps the format
// in the thread (sanitised HTML), the contact timeline gets plain text and the Gmail mock receives html + text;
// typing «#hor» suggests the snippet and inserts it; a comment keeps its format too; Ctrl+Enter still sends; a
// pasted script is reduced to text. Run: node scripts/smoke-inbox-editor.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[inbox-editor]', ...a);
const fail = (msg) => { console.error(`[inbox-editor] FAIL: ${msg}`); process.exit(1); };
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main class="content content--inbox" id="inbox-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/inbox/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'FormData', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'InputEvent', 'MutationObserver', 'customElements', 'Range', 'Node']) globalThis[k] = dom.window[k];
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
dom.window.confirm = () => true;
dom.window.prompt = () => 'https://megaglass.us/catalogo';
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const editor = () => $('inbox-editor');
const typeInto = (ed, s) => { ed.focus(); const t = document.createTextNode(s); ed.appendChild(t); const sel = dom.window.getSelection(); const r = document.createRange(); r.setStart(t, t.length); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); ed.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
const selectText = (ed, needle) => { const walker = document.createTreeWalker(ed, dom.window.NodeFilter.SHOW_TEXT); let node; while ((node = walker.nextNode())) { const i = node.textContent.indexOf(needle); if (i >= 0) { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + needle.length); const sel = dom.window.getSelection(); sel.removeAllRanges(); sel.addRange(r); return true; } } return false; };
const bubbles = () => qa('#inbox-messages .msg');

const gmailCalls = [];
const G = await import(resolve(here, '../src/gmail.js'));
G.setGmailClient({ functions: { invoke: async (name, opts) => { gmailCalls.push({ name, body: opts && opts.body }); return { data: { id: 'gm-1', threadId: 't-1' }, error: null }; } } });
const GI = await import(resolve(here, '../src/gmail-inbox.js'));
const data = await import(resolve(here, '../src/data.js'));
const Conv = await import(resolve(here, '../src/conversations-data.js'));
const T = await import(resolve(here, '../src/templates-data.js'));
const S = await import(resolve(here, '../src/snippets-data.js'));
await Promise.all([Conv.ready, T.ready, S.ready]);
const I = await import(resolve(here, '../src/inbox.js'));
await wait(20);
const conv = Conv.conversations().find((c) => c.channel === 'email' && c.contact && c.status === 'open') || Conv.conversations().find((c) => c.contact);
if (!conv) fail('an e-mail conversation with a contact');
click(q(`.inbox__item[data-id="${conv.id}"]`));
await wait(10);
GI.setThreads([{ id: 'im-1', account_id: 'acc-1', thread_id: 't-1', rfc_message_id: '<m1@x>', from_email: 'cliente@ejemplo.com', from_name: conv.contact.name, subject: conv.subject, received_at: new Date().toISOString(), conversation_id: conv.id }]);
const first = conv.contact.first || conv.contact.name.split(' ')[0];

// ---- the editor replaces the textarea: toolbar + Insertar menu ----
if (!editor() || editor().getAttribute('contenteditable') !== 'true' || !$('inbox-reply').elements.body || !$('inbox-reply').elements.body.hidden) fail('contenteditable editor with the hidden mirror textarea');
if (!q('#inbox-reply [data-fmt="bold"]') || !q('#inbox-reply [data-fmt="italic"]') || !q('#inbox-reply [data-fmt="insertUnorderedList"]') || !q('#inbox-reply [data-rt="link"]')) fail('toolbar B / I / list / link');
if (!q('#inbox-reply [data-rt-insert]') || !qa('#inbox-reply [data-ins-tpl]').length || !qa('#inbox-reply [data-ins-snip]').length || qa('#inbox-reply [data-ins-doc]').length !== 3) fail('Insertar menu with templates, snippets and documents');
if (!/Ctrl \+ Enter envía/.test(text(q('.inbox__replyfoot')))) fail('footer keeps the Ctrl+Enter hint');
// searching inside the menu filters the lists
const tplSearch = q('[data-ins-search="tpl"]');
tplSearch.value = 'visita'; tplSearch.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
if (qa('#inbox-reply [data-ins-tpl]').length !== 1 || !/visita técnica/i.test(text(q('#inbox-reply [data-ins-tpl]')))) fail('template search filters');
tplSearch.value = ''; tplSearch.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
log('editor: contenteditable, barra B/I/lista/enlace, menú Insertar (plantillas con buscador, fragmentos, documentos)');

// ---- insert a template with tokens → resolved with the contact; bold a piece; send ----
const tpl = T.templates().find((t) => /Seguimiento de propuesta/.test(t.name));
click(q(`#inbox-reply [data-ins-tpl="${tpl.id}"]`));
await wait(10);
let html = editor().innerHTML;
if (!html.includes(`Hola ${first}`) || /{{/.test(html) || !/<p>/.test(html)) fail(`template inserted with tokens resolved (${html.slice(0, 120)})`);
if (!/Plantilla «/.test(text($('toast')))) fail('toast for the template');
if (!selectText(editor(), 'seguimiento')) fail('select a word of the template');
click(q('#inbox-reply [data-fmt="bold"]'));
html = editor().innerHTML;
if (!/<b>seguimiento<\/b>/.test(html)) fail(`bold applied to the selection (${html.slice(0, 160)})`);
if ($('inbox-reply').elements.body.value !== html) fail('mirror textarea follows the editor');
const actsBefore = data.activitiesFor('contacts', conv.contactId).length;
const nBefore = bubbles().length;
editor().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
await wait(30);
const sent = Conv.messagesOf(conv.id).pop();
if (!sent || sent.direction !== 'out' || !/<b>seguimiento<\/b>/.test(sent.body) || !/<p>Hola/.test(sent.body) || /<script|style=/.test(sent.body)) fail(`message stored with its (sanitised) HTML (${sent && sent.body.slice(0, 120)})`);
if (bubbles().length !== nBefore + 1 || !bubbles().pop().querySelector('.msg__bubble b') || text(bubbles().pop().querySelector('.msg__bubble b')) !== 'seguimiento') fail('the bubble shows the bold text');
if (editor().innerHTML !== '' || $('inbox-reply').elements.body.value !== '') fail('editor cleared after sending');
const act = data.activitiesFor('contacts', conv.contactId)[0];
if (data.activitiesFor('contacts', conv.contactId).length !== actsBefore + 1 || /<[a-z]/.test(act.text) || !act.text.includes(`Hola ${first}`)) fail(`timeline gets plain text (${act.text.slice(0, 100)})`);
const gm = gmailCalls.find((c) => c.name === 'gmail-send');
if (!gm || !/<b>seguimiento<\/b>/.test(gm.body.html) || /<[a-z]/.test(gm.body.text) || !gm.body.text.includes(`Hola ${first}`) || gm.body.threadId !== 't-1' || gm.body.to[0] !== 'cliente@ejemplo.com') fail(`Gmail mock received html + plain text (${JSON.stringify(gm && gm.body).slice(0, 200)})`);
log(`plantilla «${tpl.name}» → «Hola ${first}» resuelto; negrita en «seguimiento»; enviado: hilo con <b>, cronología en texto plano, Gmail con html + text`);

// ---- «#hor» suggests the snippet and inserts it (tokens resolved) ----
typeInto(editor(), 'Gracias. #hor');
await wait(10);
const ac = q('.snipac, .snippet-ac, [data-snippet-ac], .ac');
const acItem = ac ? (ac.querySelector('button') || ac.querySelector('[data-pick]')) : null;
if (!acItem || !/Horario/.test(text(ac))) fail(`autocomplete lists the snippet (${ac ? text(ac).slice(0, 80) : 'no popup'})`);
click(acItem);
await wait(10);
html = editor().innerHTML;
if (!/lunes a viernes/.test(html) || /#hor/.test(html)) fail(`snippet inserted in place of #hor (${html.slice(0, 160)})`);
// a snippet through the menu with a token → the contact's name; a document; a link around a selection
click(q(`#inbox-reply [data-ins-snip="${S.snippets().find((s) => s.shortcut === 'garantia').id}"]`));
if (!editor().innerHTML.includes(`Hola ${first}, todos`)) fail('menu snippet with the contact token');
click(q('#inbox-reply [data-ins-doc]'));
if (!/📄 <a href="#">Catálogo Megaglass 2026.pdf<\/a>/.test(editor().innerHTML)) fail('document inserted');
if (!selectText(editor(), 'garantía')) fail('select a word for the link');
click(q('#inbox-reply [data-rt="link"]'));
if (!/<a href="https:\/\/megaglass\.us\/catalogo">garantía<\/a>/.test(editor().innerHTML)) fail(`link wraps the selection (${editor().innerHTML.slice(0, 200)})`);
log('«#hor» → sugerencia y fragmento insertado; fragmento del menú con token; documento; enlace sobre la selección');

// ---- a comment keeps its format; pasted markup is reduced to text; Comentario tab keeps the draft ----
editor().innerHTML = '';
$('inbox-reply').elements.body.value = '';
click(q('#inbox-reply [data-compose="note"]'));
await wait(10);
if (!editor() || !q('.inbox__reply--note') || $('inbox-reply').elements.body.placeholder !== 'Escribe un comentario interno…') fail('comment tab keeps the editor');
typeInto(editor(), 'Ojo con la factura');
selectText(editor(), 'factura');
click(q('#inbox-reply [data-fmt="italic"]'));
if (!/<i>factura<\/i>/.test(editor().innerHTML)) fail('italic applied');
// caret to the end (pasting over the still-selected word would replace it, as in any editor)
{ const r = document.createRange(); r.selectNodeContents(editor()); r.collapse(false); const sel = dom.window.getSelection(); sel.removeAllRanges(); sel.addRange(r); }
const paste = new dom.window.Event('paste', { bubbles: true, cancelable: true });
paste.clipboardData = { getData: () => '<script>alert(1)</script> línea 1\n\nlínea 2' };
editor().dispatchEvent(paste);
const pastedHtml = editor().innerHTML;
if (/<script/.test(pastedHtml) || !pastedHtml.includes('&lt;script&gt;') || !/línea 2/.test(pastedHtml)) fail(`pasted content lands as plain text (${pastedHtml.slice(0, 160)})`);
$('inbox-reply').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await wait(20);
const note = Conv.messagesOf(conv.id).pop();
if (!note || note.kind !== 'note' || !/<i>factura<\/i>/.test(note.body) || /<script/.test(note.body)) fail(`comment stored with format, no script (${note && note.body.slice(0, 120)})`);
if (!bubbles().pop().classList.contains('msg--note') || !bubbles().pop().querySelector('.msg__bubble i')) fail('comment bubble shows the italic');
if (gmailCalls.length !== 1) fail('a comment never reaches Gmail');
// a plain draft set the old way (mirror textarea) still sends as text
click(q('#inbox-reply [data-compose="reply"]'));
await wait(10);
$('inbox-reply').elements.body.value = 'Respuesta en texto plano';
$('inbox-reply').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await wait(20);
const plainMsg = Conv.messagesOf(conv.id).pop();
if (plainMsg.body !== 'Respuesta en texto plano' || gmailCalls.length !== 2 || gmailCalls[1].body.html !== '<p>Respuesta en texto plano</p>' || gmailCalls[1].body.text !== 'Respuesta en texto plano') fail('a plain draft is sent as text with a paragraph for Gmail');
log('comentario con cursiva guardado (sin script del pegado); borrador plano enviado como texto');
console.log('[inbox-editor] OK');
process.exit(0);
