import './filter-chip.js';
// Bandeja de entrada: the original's conversations inbox in three columns — the list with its filters on the
// left, the thread (chat bubbles + reply box) in the middle, the contact card and the actions on the right.
import { boot } from './page.js';
import { toast, setNavBadge, linkHtml, wireMenus, closeMenus } from './shell.js';
import { ACT_ICONS } from './action-icons.js';
import { ready as templatesReady, templates as savedTemplates, resolveTokens, recordTemplateUse } from './templates-data.js';
import { ready as snippetsReady, snippets as savedSnippets } from './snippets-data.js';
import { renderTokens, contextFromRecord, insertAtCaret, trackCaret } from './tokens.js';
import { attachSnippetAutocomplete } from './snippet-autocomplete.js';
import { sanitizeHtml, isHtml, htmlToText, messageHtml, textToHtml, format as formatEditor, wrapSelection } from './rich-text.js';
import { ownerHtml } from './owner.js';
import { emptyStateHtml } from './empty-state.js';
import { enhanceOwnerSelects } from './owner-select.js';
import { mountCreateTicket } from './create-ticket.js';
import { addActivity, allCompanies, allContacts, relativeTimeFine, formatDate, initials, colorFor } from './data.js';
import { ready, conversations, conversationById, messagesOf, sendMessage, addInternalNote, isInternalNote, createConversation, markRead, bulkAssignConversations, bulkSetConversationStatus, bulkMarkConversationsRead, bulkDeleteConversations, assignConversation, setConversationStatus, reopenSnoozed, snoozeUntilFor, SNOOZE_OPTIONS, unreadCount, CHANNELS, STATUS_LABELS, ASSIGNEES, ME } from './conversations-data.js';
import { ready as gmailReady, hasGmail, sendMail } from './gmail.js';
import { syncInbox, gmailThreadFor } from './gmail-inbox.js';

boot({ root: '../', active: 'crm', sub: 'Bandeja de entrada', title: 'Bandeja de entrada' });
await ready;

const root = document.getElementById('inbox-root');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
// compose: the editor tab («reply» | «note») chosen per conversation, remembered for the session.
const state = { who: 'all', status: 'open', channel: '', q: '', activeId: params.get('id') || null, selected: new Set(), compose: new Map() };
const composeMode = (id) => state.compose.get(id) || 'reply';
const excerpt = (s, n = 70) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const timeOf = (iso) => { const d = new Date(iso); return `${formatDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const STATUS_CLASS = { open: 'tag--open', closed: 'tag--done', snoozed: 'tag--none' };
const refreshBadge = () => setNavBadge('inbox', unreadCount());

root.innerHTML = `
  <div class="inbox">
    <aside class="inbox__list" aria-label="Conversaciones">
      <div class="inbox__listhead">
        <h1 class="page-title">Bandeja de entrada</h1>
        <div class="inbox__headbtns"><button class="btn btn--secondary btn--sm inbox__sync" type="button" data-inbox="sync" hidden title="Traer los últimos correos de tu cuenta de Gmail">Sincronizar Gmail</button><button class="btn btn--primary btn--sm inbox__new" type="button" data-inbox="new" aria-label="Nueva conversación" title="Nueva conversación">+</button></div>
      </div>
      <div class="inbox__tabs" role="tablist" aria-label="Asignación">
        <button class="inbox__tab is-active" type="button" role="tab" data-who="all">Todos</button>
        <button class="inbox__tab" type="button" role="tab" data-who="unassigned">Sin asignar</button>
        <button class="inbox__tab" type="button" role="tab" data-who="mine">Asignados a mí</button>
      </div>
      <div id="inbox-bulk" class="inbox__bulk" role="toolbar" aria-label="Acciones masivas" hidden>
        <strong id="inbox-selected-count" aria-live="polite"></strong>
        <label>Asignar a <select id="inbox-bulk-assign" aria-label="Asignar conversaciones seleccionadas"><option value="" disabled selected>Elegir usuario</option><option value="Sin asignar">Sin asignar</option>${ASSIGNEES.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></label>
        <button type="button" class="btn btn--ghost btn--sm" data-bulk="read">Marcar leído</button>
        <button type="button" class="btn btn--ghost btn--sm" data-bulk="unread">Marcar no leído</button>
        <button type="button" class="btn btn--ghost btn--sm" data-bulk="closed">Cerrar</button>
        <button type="button" class="btn btn--ghost btn--sm" data-bulk="open">Reabrir</button>
        <button type="button" class="btn btn--ghost btn--sm" data-bulk="snoozed">Posponer</button>
        <button type="button" class="btn btn--ghost btn--sm" data-bulk="delete">Eliminar</button>
        <button type="button" class="btn btn--ghost btn--sm" data-bulk="clear">Deseleccionar</button>
      </div>
      <div class="inbox__filters">
        <filter-chip id="inbox-status" aria-label="Estado"><template><option value="">Todos los estados</option><option value="open" selected>Abiertos</option><option value="closed">Cerrados</option><option value="snoozed">Pospuestos</option></template></filter-chip>
        <filter-chip id="inbox-channel" aria-label="Canal"><template><option value="">Todos los canales</option>${Object.entries(CHANNELS).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('')}</template></filter-chip>
      </div>
      <div class="search search--sm inbox__search"><span class="ico ico--search" aria-hidden="true"></span><input type="search" id="inbox-q" placeholder="Buscar conversaciones" aria-label="Buscar conversaciones" autocomplete="off" /></div>
      <label class="inbox__select-all"><input type="checkbox" id="inbox-select-all" /> Seleccionar todo lo visible</label>
      <ul class="inbox__items" id="inbox-items"></ul>
    </aside>
    <section class="inbox__thread" id="inbox-thread" aria-live="polite"></section>
    <aside class="inbox__side" id="inbox-side"></aside>
  </div>
  <div class="bmodal" id="inbox-modal" aria-hidden="true">
    <div class="bmodal__scrim" data-bm="close"></div>
    <div class="bmodal__panel" role="dialog" aria-modal="true" aria-labelledby="inbox-modal-title">
      <div class="bmodal__head"><h3 id="inbox-modal-title">Nueva conversación</h3><button class="bmodal__close" type="button" data-bm="close" aria-label="Cerrar">×</button></div>
      <form class="bmodal__body" id="inbox-new" novalidate>
        <label class="field"><span>Contacto</span><select name="contactId" required>${allContacts().slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')).map((c) => `<option value="${c.id}">${esc(c.name)}${c.email ? ` · ${esc(c.email)}` : ''}</option>`).join('')}</select></label>
        <label class="field"><span>Canal</span><select name="channel">${Object.entries(CHANNELS).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('')}</select></label>
        <label class="field"><span>Asunto</span><input name="subject" type="text" required autocomplete="off" /></label>
        <label class="field"><span>Dirección del primer mensaje</span><select name="direction"><option value="out">Enviado por nosotros</option><option value="in">Recibido del contacto</option></select></label>
        <label class="field"><span>Primer mensaje</span><textarea name="body" rows="4" required></textarea></label>
        <p class="inbox__formerror muted" id="inbox-new-error" hidden></p>
      </form>
      <div class="bmodal__foot"><button class="btn btn--primary" type="submit" form="inbox-new">Crear conversación</button><button class="btn btn--ghost" type="button" data-bm="close">Cancelar</button></div>
    </div>
  </div>`;

const ticketPanel = mountCreateTicket({
  root, fromConversation: true,
  onCreated(ticket, conversation) {
    const href = `../tickets/record/?id=${encodeURIComponent(ticket.id)}`;
    addActivity({ type: 'note', recordType: 'tickets', recordId: ticket.id,
      text: `Ticket creado desde la conversación "${conversation.subject}"`, who: ME, when: Date.now(),
      extra: { conversationId: conversation.id, href: `../inbox/?id=${encodeURIComponent(conversation.id)}` } });
    addInternalNote(conversation.id, { body: `Se creó el ticket ${ticket.name} (${href})`, author: ME });
    const draft = $('inbox-reply') ? getDraft() : undefined;
    renderAll();
    if (draft !== undefined && $('inbox-reply')) setDraft(draft);
    toast('Ticket creado', { actionLabel: 'Ver ticket', href });
  },
});
// Message bodies: plain text escaped (line breaks kept), rich text from the editor sanitised to the whitelist;
// in comments, internal ticket record paths become links.
const noteHtml = (body) => messageHtml(body).replace(/\.\.\/tickets\/record\/\?id=\d+/g, (href) => `<a href="${href}">${href}</a>`);
// The reply editor: a contenteditable with a mirror <textarea name="body"> (what the form, the drafts and the
// tests read) — the editor keeps the mirror in sync on input; setDraft() fills both.
const editorEl = () => $('inbox-editor');
function getDraft() { const ed = editorEl(); const ta = $('inbox-reply') && $('inbox-reply').elements.body; if (ed && ed.textContent.trim()) return ed.innerHTML; return ta ? ta.value : ''; }
function setDraft(value) {
  const ta = $('inbox-reply') && $('inbox-reply').elements.body;
  const ed = editorEl();
  if (ta) ta.value = value || '';
  if (ed) ed.innerHTML = value ? (isHtml(value) ? sanitizeHtml(value) : textToHtml(value)) : '';
}
const syncMirror = () => { const ta = $('inbox-reply') && $('inbox-reply').elements.body; const ed = editorEl(); if (ta && ed) ta.value = ed.textContent.trim() || ed.querySelector('ul,ol,a') ? ed.innerHTML : ''; };
const focusEditor = () => { const ed = editorEl(); if (ed) ed.focus(); };
// The conversation's contact for the personalisation tokens of templates and snippets.
const tokenContext = () => { const c = state.activeId ? conversationById(state.activeId) : null; return contextFromRecord('contacts', c && c.contact ? c.contact : null); };
const DOCUMENTS = ['Catálogo Megaglass 2026.pdf', 'Ficha técnica vidrio templado.pdf', 'Guía de instalación.pdf'];
const strip = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const insertListHtml = (kind, q = '') => {
  const s = strip(q);
  if (kind === 'tpl') { const list = savedTemplates().filter((t) => !s || strip(`${t.name} ${t.folder || ''}`).includes(s)); return list.length ? list.slice(0, 12).map((t) => `<button class="menu__item" type="button" data-ins-tpl="${esc(t.id)}">${esc(t.name)}${t.folder ? `<span class="muted"> · ${esc(t.folder)}</span>` : ''}</button>`).join('') : '<p class="muted inbox__insempty">Sin plantillas</p>'; }
  const list = savedSnippets().filter((x) => !s || strip(`${x.name} #${x.shortcut}`).includes(s));
  return list.length ? list.slice(0, 12).map((x) => `<button class="menu__item" type="button" data-ins-snip="${esc(x.id)}">${esc(x.name)}<span class="muted"> · #${esc(x.shortcut)}</span></button>`).join('') : '<p class="muted inbox__insempty">Sin fragmentos</p>';
};
const toolbarHtml = (note) => `
      <div class="compose__toolbar inbox__toolbar" role="toolbar" aria-label="Formato">
        <button type="button" data-fmt="bold" title="Negrita" aria-label="Negrita"><b>B</b></button>
        <button type="button" data-fmt="italic" title="Cursiva" aria-label="Cursiva"><i>I</i></button>
        <button type="button" data-fmt="insertUnorderedList" title="Lista con viñetas" aria-label="Lista con viñetas">${ACT_ICONS.list || '•'}</button>
        <button type="button" data-rt="link" title="Insertar enlace" aria-label="Insertar enlace">${ACT_ICONS.link}</button>
        <span class="compose__sep"></span>
        <div class="menu inbox__insertmenu"><button type="button" aria-haspopup="true" aria-expanded="false" data-rt-insert>Insertar <span class="caret"></span></button><div class="menu__panel inbox__insert">
          <div class="menu__title">Plantilla</div>
          <div class="inbox__inssearch search search--sm"><span class="ico ico--search" aria-hidden="true"></span><input type="search" placeholder="Buscar plantillas" aria-label="Buscar plantillas" data-ins-search="tpl" autocomplete="off" /></div>
          <div data-ins-list="tpl">${insertListHtml('tpl')}</div>
          <div class="menu__sep"></div>
          <div class="menu__title">Fragmento</div>
          <div class="inbox__inssearch search search--sm"><span class="ico ico--search" aria-hidden="true"></span><input type="search" placeholder="Buscar fragmentos" aria-label="Buscar fragmentos" data-ins-search="snip" autocomplete="off" /></div>
          <div data-ins-list="snip">${insertListHtml('snip')}</div>
          <div class="menu__sep"></div>
          <div class="menu__title">Documento</div>
          ${DOCUMENTS.map((d) => `<button class="menu__item" type="button" data-ins-doc="${esc(d)}">${ACT_ICONS.attach || '📄'} ${esc(d)}</button>`).join('')}
        </div></div>
        ${note ? '<span class="muted inbox__toolhint">Comentario interno</span>' : ''}
      </div>`;

// «Sincronizar Gmail» appears once a real Google account is connected (src/gmail.js): it brings the latest INBOX
// messages, turns them into conversations and logs them on the matching contacts.
gmailReady.then(() => { const b = root.querySelector('.inbox__sync'); if (b && hasGmail()) b.hidden = false; });
async function syncGmail(btn) {
  if (btn.disabled) return;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Sincronizando…';
  try {
    const r = await syncInbox();
    toast(r.imported ? `${r.imported} correo${r.imported === 1 ? '' : 's'} nuevo${r.imported === 1 ? '' : 's'} de Gmail` : 'No hay correos nuevos en Gmail');
    renderAll();
  } catch (e) {
    toast(`No se pudo sincronizar Gmail: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}
function visible() {
  const q = state.q.trim().toLowerCase();
  return conversations().filter((c) => {
    if (state.who === 'mine' && c.assignedTo !== ME) return false;
    if (state.who === 'unassigned' && c.assignedTo) return false;
    if (state.status && c.status !== state.status) return false;
    if (state.channel && c.channel !== state.channel) return false;
    if (q) { const hay = `${c.subject} ${c.contact ? c.contact.name : ''} ${c.lastMessage ? c.lastMessage.body : ''}`.toLowerCase(); if (!hay.includes(q)) return false; }
    return true;
  });
}
function renderList() {
  const list = visible();
  // Selection is always limited to the current filters; keep the open thread independent.
  const ids = new Set(list.map((c) => c.id));
  for (const id of state.selected) if (!ids.has(id)) state.selected.delete(id);
  if (state.activeId && !conversationById(state.activeId)) state.activeId = null;
  if (!state.activeId && list.length) state.activeId = list[0].id;
  renderSelection(list);
  root.querySelectorAll('.inbox__tab').forEach((t) => { t.classList.toggle('is-active', t.dataset.who === state.who); t.setAttribute('aria-selected', String(t.dataset.who === state.who)); });
  $('inbox-items').innerHTML = list.length
    ? list.map((c) => {
      const ch = CHANNELS[c.channel] || CHANNELS.email;
      const who = c.contact ? c.contact.name : (c.lastMessage && c.lastMessage.author) || 'Sin contacto';
      return `<li class="inbox__item${c.id === state.activeId ? ' is-active' : ''}${c.unread ? ' is-unread' : ''}" data-id="${esc(c.id)}">
        <input class="inbox__check" type="checkbox" data-select="${esc(c.id)}" aria-label="Seleccionar ${esc(c.subject)}" ${state.selected.has(c.id) ? 'checked' : ''} />
        <button class="inbox__itembtn" type="button">
          <span class="inbox__dot" style="background:${ch.color}" title="${esc(ch.label)}" aria-label="${esc(ch.label)}"></span>
          <span class="avatar avatar--sm" style="background:${c.contact ? colorFor(c.contact.id) : '#7c98b6'}" aria-hidden="true">${esc(initials(who))}</span>
          <span class="inbox__itembody">
            <span class="inbox__itemtop"><strong class="inbox__who">${esc(who)}</strong><span class="inbox__time">${esc(relativeTimeFine(c.lastMessageAt))}</span></span>
            <span class="inbox__subject">${esc(c.subject)}</span>
            <span class="inbox__excerpt">${c.lastMessage ? esc(excerpt(messageText(c.lastMessage))) : '<em class="muted">Sin mensajes</em>'}</span>
          </span>
        </button>
      </li>`;
    }).join('')
    : `<li class="inbox__empty">${emptyStateHtml({ art: 'inbox', compact: true, title: 'No hay conversaciones', text: 'Ninguna conversación coincide con estos filtros. Las nuevas aparecen aquí al llegar.', action: { label: 'Nueva conversación', attrs: 'data-inbox="new"' } })}</li>`;
}
function renderSelection(list = visible()) {
  const count = state.selected.size;
  root.querySelector('.inbox__tabs').hidden = count > 0;
  $('inbox-bulk').hidden = !count;
  $('inbox-selected-count').textContent = `${count} seleccionadas`;
  $('inbox-items').classList.toggle('has-selection', count > 0);
  const all = $('inbox-select-all');
  all.disabled = !list.length;
  all.checked = list.length > 0 && list.every((c) => state.selected.has(c.id));
  all.indeterminate = count > 0 && !all.checked;
  root.querySelectorAll('[data-select]').forEach((box) => { box.checked = state.selected.has(box.dataset.select); });
}
function applyBulk(action, who) {
  if (action === 'clear') { state.selected.clear(); renderSelection(); return; }
  const ids = [...state.selected];
  if (!ids.length) return;
  const affectsOpen = state.selected.has(state.activeId);
  const draft = $('inbox-reply') ? getDraft() : undefined;
  let count;
  let result;
  if (action === 'assign') {
    count = bulkAssignConversations(ids, who);
    result = who === 'Sin asignar' ? 'sin asignar' : `asignadas a ${who}`;
  } else if (action === 'read' || action === 'unread') {
    count = bulkMarkConversationsRead(ids, action === 'read');
    result = action === 'read' ? 'marcadas como leídas' : 'marcadas como no leídas';
  } else if (action === 'delete') {
    count = bulkDeleteConversations(ids);
    result = 'eliminadas';
  } else if (STATUS_LABELS[action]) {
    // bulk snooze: until tomorrow at 09:00 (the thread's own menu offers the other deadlines)
    count = bulkSetConversationStatus(ids, action, action === 'snoozed' ? { snoozeUntil: snoozeUntilFor('tomorrow') } : {});
    result = { closed: 'cerradas', open: 'reabiertas', snoozed: `pospuestas hasta ${timeOf(snoozeUntilFor('tomorrow'))}` }[action];
  } else return;
  renderList();
  if (affectsOpen) {
    renderThread(); renderSide();
    if (action !== 'delete' && draft !== undefined && $('inbox-reply')) setDraft(draft);
  }
  refreshBadge();
  toast(`${count} conversaciones ${result}`);
}
function renderThread() {
  const c = state.activeId ? conversationById(state.activeId) : null;
  const el = $('inbox-thread');
  if (!c) { el.innerHTML = `<div class="inbox__placeholder">${emptyStateHtml({ art: 'inbox', title: 'Selecciona una conversación', text: 'Elige un hilo de la lista para leerlo y responder, o empieza uno nuevo.', action: { label: 'Nueva conversación', attrs: 'data-inbox="new"' } })}</div>`; return; }
  const ch = CHANNELS[c.channel] || CHANNELS.email;
  const msgs = messagesOf(c.id);
  el.innerHTML = `
    <header class="inbox__threadhead">
      <div class="inbox__threadtitle"><h2>${esc(c.subject)}</h2><div class="muted inbox__threadsub">${c.contact ? `<a href="../contacts/record/?id=${c.contact.id}">${esc(c.contact.name)}</a>` : 'Sin contacto'} · <span class="inbox__chan" style="--chan:${ch.color}">${esc(ch.label)}</span> <span class="tag ${STATUS_CLASS[c.status] || 'tag--none'}">${esc(STATUS_LABELS[c.status] || c.status)}</span>${c.status === 'snoozed' ? ` · <span class="inbox__snoozed" data-snoozed-until="${esc(c.snoozeUntil || '')}">${c.snoozeUntil ? `Pospuesta hasta ${esc(timeOf(c.snoozeUntil))}` : 'Pospuesta sin plazo'}</span>` : ''} · ${c.assignedTo ? `asignada a ${ownerHtml(c.assignedTo)}` : ownerHtml('')}</div></div>
    </header>
    <div class="inbox__messages" id="inbox-messages">
      ${msgs.map((m) => (isInternalNote(m)
    ? `<div class="msg msg--note"><div class="msg__bubble">${noteHtml(m.body)}</div><div class="msg__meta">Comentario interno · ${esc(m.author)} · <span title="${esc(timeOf(m.createdAt))}">${esc(relativeTimeFine(m.createdAt))}</span></div></div>`
    : `<div class="msg msg--${m.direction}"><div class="msg__bubble">${messageHtml(m.body)}</div><div class="msg__meta">${esc(m.author)} · <span title="${esc(timeOf(m.createdAt))}">${esc(relativeTimeFine(m.createdAt))}</span></div></div>`)).join('') || '<p class="muted">Todavía no hay mensajes.</p>'}
    </div>
    ${(() => { const mode = composeMode(c.id); const note = mode === 'note'; return `
    <form class="inbox__reply${note ? ' inbox__reply--note' : ''}" id="inbox-reply" data-mode="${mode}">
      <div class="ptabs ptabs--sub inbox__composetabs" role="tablist" aria-label="Responder o comentar">
        <button type="button" role="tab" class="${note ? '' : 'is-active'}" aria-selected="${!note}" data-compose="reply">Responder</button>
        <button type="button" role="tab" class="${note ? 'is-active' : ''}" aria-selected="${note}" data-compose="note">Comentario</button>
      </div>
      ${toolbarHtml(note)}
      <div class="inbox__editor" id="inbox-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${note ? 'Comentario interno' : 'Respuesta'}" data-placeholder="${note ? 'Escribe un comentario interno…' : 'Escribe una respuesta…'}"></div>
      <textarea name="body" hidden placeholder="${note ? 'Escribe un comentario interno…' : 'Escribe una respuesta…'}" aria-hidden="true" tabindex="-1"></textarea>
      <div class="inbox__replyfoot"><span class="muted">${note ? 'Solo lo ve tu equipo: no se envía al contacto · Ctrl + Enter guarda' : c.status === 'closed' ? 'La conversación está cerrada: al responder se reabre.' : 'Ctrl + Enter envía'}</span><button class="btn btn--primary" type="submit">${note ? 'Comentar' : 'Enviar'}</button></div>
    </form>`; })()}`;
  const box = $('inbox-messages');
  box.scrollTop = box.scrollHeight;
  const ed = editorEl();
  if (ed) {
    ed.addEventListener('input', syncMirror);
    attachSnippetAutocomplete(ed, { context: tokenContext }); // "#atajo" inserts a snippet with this contact's data
    trackCaret(ed); // templates, snippets, documents and links land where the caret was
    ed.addEventListener('paste', (e) => { // pasted content arrives as plain text (no foreign markup)
      if (!e.clipboardData) return;
      e.preventDefault();
      const t = e.clipboardData.getData('text/plain');
      if (t) insertAtCaret(ed, textToHtml(t));
      syncMirror();
    });
  }
}
function renderSide() {
  const c = state.activeId ? conversationById(state.activeId) : null;
  const el = $('inbox-side');
  if (!c) { el.innerHTML = ''; return; }
  const contact = c.contact;
  const company = contact && contact.companyId ? allCompanies().find((x) => Number(x.id) === Number(contact.companyId)) : null;
  el.innerHTML = `
    <div class="card inbox__card">
      <h3 class="card__title">Contacto</h3>
      ${contact ? `<div class="inbox__contact"><span class="avatar avatar--sm" style="background:${colorFor(contact.id)}" aria-hidden="true">${esc(initials(contact.name))}</span><div><a class="inbox__contactname" href="../contacts/record/?id=${contact.id}">${esc(contact.name)}</a>${contact.jobTitle ? `<div class="muted">${esc(contact.jobTitle)}</div>` : ''}</div></div>
        <dl class="props inbox__props">
          <div class="props__row"><dt>Correo</dt><dd>${contact.email ? `<a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>` : '<span class="muted">--</span>'}</dd></div>
          <div class="props__row"><dt>Empresa</dt><dd>${company ? `<a href="../companies/record/?id=${company.id}">${esc(company.name)}</a>` : contact.company ? esc(contact.company) : '<span class="muted">--</span>'}</dd></div>
          <div class="props__row"><dt>Teléfono</dt><dd>${contact.phone ? linkHtml('phone', contact.phone) : '<span class="muted">--</span>'}</dd></div>
        </dl>
        <a class="link-btn" href="../contacts/record/?id=${contact.id}">Ver ficha del contacto ↗</a>` : '<p class="muted">Esta conversación no tiene contacto asociado.</p>'}
    </div>
    <div class="card inbox__card">
      <h3 class="card__title">Acciones</h3>
      <label class="field"><span>Asignar a</span><select id="inbox-assign" data-owner-select><option value="">Sin asignar</option>${ASSIGNEES.map((o) => `<option value="${esc(o)}" ${c.assignedTo === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
      <div class="inbox__actions">
        <button class="btn btn--ghost btn--sm" type="button" data-inbox="create-ticket" ${contact ? '' : 'disabled aria-describedby="inbox-ticket-hint" title="Asocia un contacto a la conversación para crear un ticket"'}>Crear ticket</button>
        ${contact ? '' : '<small id="inbox-ticket-hint" class="muted">Asocia un contacto a la conversación para crear un ticket.</small>'}
        <button class="btn btn--ghost btn--sm" type="button" data-inbox="toggle-status">${c.status === 'closed' ? 'Reabrir' : 'Marcar como cerrado'}</button>
        ${c.status === 'snoozed'
    ? '<button class="btn btn--ghost btn--sm" type="button" data-inbox="unsnooze">Quitar posposición</button>'
    : `<div class="menu inbox__snooze">
          <button class="btn btn--ghost btn--sm" type="button" aria-haspopup="true" aria-expanded="false" data-inbox-snooze-menu>Posponer <span class="caret"></span></button>
          <div class="menu__panel">
            ${SNOOZE_OPTIONS.filter(([k]) => k !== 'custom').map(([k, l]) => `<button class="menu__item" type="button" data-snooze="${k}">${l} <span class="muted">${esc(timeOf(snoozeUntilFor(k)))}</span></button>`).join('')}
            <div class="menu__sep"></div>
            <form class="inbox__snoozecustom" data-snooze-custom>
              <label class="field"><span>Fecha y hora personalizadas</span><input type="datetime-local" name="until" required min="${esc(localInput(new Date()))}"></label>
              <button class="btn btn--primary btn--sm" type="submit">Posponer</button>
            </form>
          </div>
        </div>`}
      </div>
    </div>`;
  enhanceOwnerSelects(el);
  wireMenus(el);
}
// A snoozed conversation comes back on its own when its deadline passes; the inbox checks every minute while
// it stays open (and once when it loads). Returns how many came back.
export function checkSnoozed(now = Date.now()) {
  const n = reopenSnoozed(now);
  if (n) { toast(`${n} ${n === 1 ? 'conversación pospuesta reabierta' : 'conversaciones pospuestas reabiertas'}`); renderAll(); }
  return n;
}
const localInput = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
function snoozeActive(until) {
  const c = state.activeId ? conversationById(state.activeId) : null;
  if (!c) return;
  const t = until ? new Date(until) : null;
  if (!t || Number.isNaN(t.getTime())) { toast('Elige una fecha y hora válidas'); return; }
  if (t.getTime() <= Date.now()) { toast('La fecha debe ser posterior a ahora'); return; }
  closeMenus();
  setConversationStatus(c.id, 'snoozed', { snoozeUntil: t.toISOString() });
  toast(`Conversación pospuesta hasta ${timeOf(t.toISOString())}`);
  renderAll();
}
function renderAll() { renderList(); renderThread(); renderSide(); refreshBadge(); }
function select(id) {
  state.activeId = id;
  markRead(id);
  if (history.replaceState) history.replaceState(null, '', `?id=${encodeURIComponent(id)}`);
  renderAll();
}
const modal = () => $('inbox-modal');
function openNew() {
  const m = modal();
  const form = $('inbox-new');
  form.reset();
  $('inbox-new-error').hidden = true;
  const c = state.activeId ? conversationById(state.activeId) : null;
  if (c && c.contactId) form.elements.contactId.value = String(c.contactId);
  m.classList.add('is-open');
  m.setAttribute('aria-hidden', 'false');
  setTimeout(() => form.elements.subject.focus(), 0);
}
function closeNew() { const m = modal(); m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); }

root.addEventListener('click', (e) => {
  if (e.target.closest('[data-select]')) return;
  const bulk = e.target.closest('[data-bulk]');
  if (bulk) { applyBulk(bulk.dataset.bulk); return; }
  const item = e.target.closest('.inbox__item[data-id]');
  if (item) { select(item.dataset.id); return; }
  const tab = e.target.closest('.inbox__tab[data-who]');
  if (tab) { state.who = tab.dataset.who; state.selected.clear(); renderAll(); return; }
  const act = e.target.closest('[data-inbox]');
  if (act) {
    const a = act.dataset.inbox;
    if (a === 'new') { openNew(); return; }
    if (a === 'sync') { syncGmail(act); return; }
    const c = state.activeId ? conversationById(state.activeId) : null;
    if (!c) return;
    if (a === 'create-ticket') {
      if (!c.contact || ticketPanel.isOpen()) return;
      ticketPanel.open({ id: c.id, subject: c.subject, name: c.subject, contactId: c.contactId,
        source: CHANNELS[c.channel]?.label || 'Correo', owner: c.assignedTo || 'Sin asignar' });
      return;
    }
    if (a === 'toggle-status') {
      const next = c.status === 'closed' ? 'open' : 'closed';
      setConversationStatus(c.id, next);
      toast(next === 'closed' ? 'Conversación cerrada' : 'Conversación reabierta');
    } else if (a === 'unsnooze') {
      setConversationStatus(c.id, 'open');
      toast('Conversación de nuevo abierta');
    }
    renderAll();
    return;
  }
  const snooze = e.target.closest('[data-snooze]');
  if (snooze) { e.preventDefault(); snoozeActive(snoozeUntilFor(snooze.dataset.snooze)); return; }
  if (e.target.closest('[data-snooze-custom]')) e.stopPropagation(); // typing inside the menu must not close it
  if (e.target.closest('[data-bm="close"]')) { e.preventDefault(); closeNew(); }
});
root.addEventListener('change', (e) => {
  if (e.target.matches('[data-select]')) {
    const id = e.target.dataset.select;
    if (e.target.checked) state.selected.add(id); else state.selected.delete(id);
    renderSelection(); return;
  }
  if (e.target.id === 'inbox-select-all') {
    state.selected = new Set(e.target.checked ? visible().map((c) => c.id) : []);
    renderSelection(); return;
  }
  if (e.target.id === 'inbox-bulk-assign') { applyBulk('assign', e.target.value); e.target.value = ''; return; }

  if (e.target.id === 'inbox-status') { state.status = e.target.value; state.selected.clear(); renderAll(); }
  else if (e.target.id === 'inbox-channel') { state.channel = e.target.value; state.selected.clear(); renderAll(); }
  else if (e.target.id === 'inbox-assign' && state.activeId) { assignConversation(state.activeId, e.target.value); toast(e.target.value ? `Asignada a ${e.target.value}` : 'Conversación sin asignar'); renderAll(); }
});
root.addEventListener('input', (e) => { if (e.target.id === 'inbox-q') { const before = state.activeId; state.q = e.target.value; renderList(); if (state.activeId !== before) { renderThread(); renderSide(); } } });
// «Responder | Comentario»: the tab is remembered per conversation; the draft survives the switch.
root.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-compose]');
  if (!tab || !state.activeId) return;
  const draft = $('inbox-reply') ? getDraft() : '';
  state.compose.set(state.activeId, tab.dataset.compose === 'note' ? 'note' : 'reply');
  renderThread();
  if ($('inbox-reply')) { setDraft(draft); focusEditor(); }
});
// The editor's toolbar and «Insertar» menu (templates and snippets with the conversation's contact, documents).
root.addEventListener('click', (e) => {
  const ed = editorEl();
  if (!ed) return;
  if (e.target.closest('.inbox__insert')) e.stopPropagation(); // searching inside the menu must not close it
  const fmt = e.target.closest('[data-fmt]');
  if (fmt) { e.preventDefault(); formatEditor(ed, fmt.dataset.fmt); syncMirror(); return; }
  const rt = e.target.closest('[data-rt]');
  if (rt && rt.dataset.rt === 'link') {
    e.preventDefault();
    const url = window.prompt('Dirección del enlace', 'https://');
    if (!url || !/^(https?:|mailto:)/i.test(url.trim())) { if (url) toast('Escribe una dirección que empiece por https://'); return; }
    if (!wrapSelection(ed, 'a', { href: url.trim() })) insertAtCaret(ed, `<a href="${esc(url.trim())}">${esc(url.trim())}</a>`);
    syncMirror();
    return;
  }
  const tpl = e.target.closest('[data-ins-tpl]');
  if (tpl) {
    const t = savedTemplates().find((x) => x.id === tpl.dataset.insTpl);
    closeMenus();
    if (!t) { toast('Esa plantilla ya no existe.'); return; }
    const c = state.activeId ? conversationById(state.activeId) : null;
    insertAtCaret(ed, sanitizeHtml(resolveTokens(t.body, c && c.contact, { name: ME })));
    try { recordTemplateUse(t.id); } catch { /* usage counter is best effort */ }
    syncMirror();
    toast(`Plantilla «${t.name}» insertada`);
    return;
  }
  const snip = e.target.closest('[data-ins-snip]');
  if (snip) {
    const s = savedSnippets().find((x) => x.id === snip.dataset.insSnip);
    closeMenus();
    if (!s) { toast('Ese fragmento ya no existe.'); return; }
    insertAtCaret(ed, sanitizeHtml(renderTokens(s.body, tokenContext())));
    syncMirror();
    return;
  }
  const doc = e.target.closest('[data-ins-doc]');
  if (doc) { closeMenus(); insertAtCaret(ed, `<p>📄 <a href="#">${esc(doc.dataset.insDoc)}</a></p>`); syncMirror(); }
});
root.addEventListener('input', (e) => {
  const s = e.target.closest && e.target.closest('[data-ins-search]');
  if (!s) return;
  const list = root.querySelector(`[data-ins-list="${s.dataset.insSearch}"]`);
  if (list) list.innerHTML = insertListHtml(s.dataset.insSearch, s.value);
});
// Late loads of the templates / snippets refresh the «Insertar» lists.
Promise.all([templatesReady, snippetsReady]).then(() => { root.querySelectorAll('[data-ins-list]').forEach((l) => { l.innerHTML = insertListHtml(l.dataset.insList); }); }).catch(() => {});
root.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.closest('#inbox-reply')) { e.preventDefault(); $('inbox-reply').requestSubmit ? $('inbox-reply').requestSubmit() : $('inbox-reply').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal().classList.contains('is-open')) closeNew(); });
root.addEventListener('submit', (e) => {
  if (e.target.id === 'inbox-reply') {
    e.preventDefault();
    // the editor's HTML (sanitised) or, for a plain draft, the text as it is; `plain` is the text part / checks
    const raw = getDraft();
    const rich = isHtml(raw);
    const body = rich ? sanitizeHtml(raw) : String(raw || '').trim();
    const plain = rich ? htmlToText(body) : body;
    if (!plain.trim() || !state.activeId) return;
    if (composeMode(state.activeId) === 'note') {
      // «Comentario»: internal, never leaves the CRM (no sendMessage, no Gmail), the thread keeps its status.
      const n = addInternalNote(state.activeId, { body, author: ME });
      if (!n) return;
      toast('Comentario guardado');
      renderAll();
      focusEditor();
      return;
    }
    const m = sendMessage(state.activeId, { body, direction: 'out', author: ME });
    if (!m) return;
    // A conversation imported from Gmail answers in the same Gmail thread, from the connected account: the
    // editor's HTML as the HTML part and its plain text as the text part.
    const th = gmailThreadFor(state.activeId);
    if (th && th.fromEmail) sendMail({ accountId: th.accountId, to: th.fromEmail, subject: /^re:/i.test(th.subject) ? th.subject : `Re: ${th.subject}`, html: rich ? body : textToHtml(body), text: plain, threadId: th.threadId, inReplyTo: th.rfcMessageId, references: th.rfcMessageId }).then(() => toast('Respuesta enviada por Gmail')).catch((e2) => toast(`No se pudo enviar por Gmail: ${e2.message}`));
    toast('Mensaje enviado');
    renderAll();
    focusEditor();
    return;
  }
  if (e.target.matches && e.target.matches('[data-snooze-custom]')) {
    e.preventDefault();
    snoozeActive(e.target.elements.until.value); // datetime-local: local time
    return;
  }
  if (e.target.id === 'inbox-new') {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target).entries());
    const err = $('inbox-new-error');
    if (!String(d.subject || '').trim() || !String(d.body || '').trim()) { err.textContent = 'Escribe el asunto y el primer mensaje.'; err.hidden = false; return; }
    const c = createConversation({ contactId: Number(d.contactId), channel: d.channel, subject: d.subject, body: d.body, direction: d.direction, author: ME });
    if (!c) { err.textContent = 'No se pudo crear la conversación.'; err.hidden = false; return; }
    closeNew();
    state.who = 'all';
    state.status = c.status;
    $('inbox-status').value = c.status;
    state.channel = '';
    $('inbox-channel').value = '';
    toast('Conversación creada', { actionLabel: 'Ver conversación', href: `?id=${encodeURIComponent(c.id)}` });
    select(c.id);
  }
});

renderAll();
if (state.activeId) markRead(state.activeId), renderAll();
// snoozed conversations whose time came: once now, then every minute while the inbox is open
checkSnoozed();
const snoozeTimer = setInterval(() => checkSnoozed(), 60_000);

export { state, renderAll, snoozeTimer };
