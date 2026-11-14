// Bandeja de entrada: the original's conversations inbox in three columns — the list with its filters on the
// left, the thread (chat bubbles + reply box) in the middle, the contact card and the actions on the right.
import { boot } from './page.js';
import { toast, setNavBadge } from './shell.js';
import { allCompanies, allContacts, relativeTimeFine, formatDate, initials, colorFor } from './data.js';
import { ready, conversations, conversationById, messagesOf, sendMessage, createConversation, markRead, assignConversation, setConversationStatus, unreadCount, CHANNELS, STATUS_LABELS, ASSIGNEES, ME } from './conversations-data.js';

boot({ root: '../', active: 'crm', sub: 'Bandeja de entrada', title: 'Bandeja de entrada' });
await ready;

const root = document.getElementById('inbox-root');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const state = { who: 'all', status: 'open', channel: '', q: '', selected: params.get('id') || null };
const excerpt = (s, n = 70) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const timeOf = (iso) => { const d = new Date(iso); return `${formatDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const STATUS_CLASS = { open: 'tag--open', closed: 'tag--done', snoozed: 'tag--none' };
const refreshBadge = () => setNavBadge('inbox', unreadCount());

root.innerHTML = `
  <div class="inbox">
    <aside class="inbox__list" aria-label="Conversaciones">
      <div class="inbox__listhead">
        <h1>Bandeja de entrada</h1>
        <button class="btn btn--primary btn--sm inbox__new" type="button" data-inbox="new" aria-label="Nueva conversación" title="Nueva conversación">+</button>
      </div>
      <div class="inbox__tabs" role="tablist" aria-label="Asignación">
        <button class="inbox__tab is-active" type="button" role="tab" data-who="all">Todos</button>
        <button class="inbox__tab" type="button" role="tab" data-who="unassigned">Sin asignar</button>
        <button class="inbox__tab" type="button" role="tab" data-who="mine">Asignados a mí</button>
      </div>
      <div class="inbox__filters">
        <select id="inbox-status" aria-label="Estado"><option value="open">Abiertos</option><option value="closed">Cerrados</option><option value="snoozed">Pospuestos</option><option value="">Todos los estados</option></select>
        <select id="inbox-channel" aria-label="Canal"><option value="">Todos los canales</option>${Object.entries(CHANNELS).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('')}</select>
      </div>
      <div class="search search--sm inbox__search"><span class="ico ico--search" aria-hidden="true"></span><input type="search" id="inbox-q" placeholder="Buscar conversaciones" aria-label="Buscar conversaciones" autocomplete="off" /></div>
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
  if (state.selected && !conversationById(state.selected)) state.selected = null;
  if (!state.selected && list.length) state.selected = list[0].id;
  root.querySelectorAll('.inbox__tab').forEach((t) => { t.classList.toggle('is-active', t.dataset.who === state.who); t.setAttribute('aria-selected', String(t.dataset.who === state.who)); });
  $('inbox-items').innerHTML = list.length
    ? list.map((c) => {
      const ch = CHANNELS[c.channel] || CHANNELS.email;
      const who = c.contact ? c.contact.name : (c.lastMessage && c.lastMessage.author) || 'Sin contacto';
      return `<li class="inbox__item${c.id === state.selected ? ' is-active' : ''}${c.unread ? ' is-unread' : ''}" data-id="${esc(c.id)}">
        <button class="inbox__itembtn" type="button">
          <span class="inbox__dot" style="background:${ch.color}" title="${esc(ch.label)}" aria-label="${esc(ch.label)}"></span>
          <span class="avatar avatar--sm" style="background:${c.contact ? colorFor(c.contact.id) : '#7c98b6'}" aria-hidden="true">${esc(initials(who))}</span>
          <span class="inbox__itembody">
            <span class="inbox__itemtop"><strong class="inbox__who">${esc(who)}</strong><span class="inbox__time">${esc(relativeTimeFine(c.lastMessageAt))}</span></span>
            <span class="inbox__subject">${esc(c.subject)}</span>
            <span class="inbox__excerpt">${c.lastMessage ? esc(excerpt(c.lastMessage.body)) : '<em class="muted">Sin mensajes</em>'}</span>
          </span>
        </button>
      </li>`;
    }).join('')
    : '<li class="inbox__empty muted">No hay conversaciones con estos filtros.</li>';
}
function renderThread() {
  const c = state.selected ? conversationById(state.selected) : null;
  const el = $('inbox-thread');
  if (!c) { el.innerHTML = '<div class="inbox__placeholder"><p class="muted">Selecciona una conversación o crea una nueva con «+».</p></div>'; return; }
  const ch = CHANNELS[c.channel] || CHANNELS.email;
  const msgs = messagesOf(c.id);
  el.innerHTML = `
    <header class="inbox__threadhead">
      <div class="inbox__threadtitle"><h2>${esc(c.subject)}</h2><div class="muted inbox__threadsub">${c.contact ? `<a href="../contacts/record/?id=${c.contact.id}">${esc(c.contact.name)}</a>` : 'Sin contacto'} · <span class="inbox__chan" style="--chan:${ch.color}">${esc(ch.label)}</span> <span class="tag ${STATUS_CLASS[c.status] || 'tag--none'}">${esc(STATUS_LABELS[c.status] || c.status)}</span>${c.assignedTo ? ` · asignada a <strong>${esc(c.assignedTo)}</strong>` : ' · sin asignar'}</div></div>
    </header>
    <div class="inbox__messages" id="inbox-messages">
      ${msgs.map((m) => `<div class="msg msg--${m.direction}"><div class="msg__bubble">${esc(m.body)}</div><div class="msg__meta">${esc(m.author)} · <span title="${esc(timeOf(m.createdAt))}">${esc(relativeTimeFine(m.createdAt))}</span></div></div>`).join('') || '<p class="muted">Todavía no hay mensajes.</p>'}
    </div>
    <form class="inbox__reply" id="inbox-reply">
      <textarea name="body" rows="3" placeholder="Escribe una respuesta…" aria-label="Respuesta"></textarea>
      <div class="inbox__replyfoot"><span class="muted">${c.status === 'closed' ? 'La conversación está cerrada: al responder se reabre.' : 'Ctrl + Enter envía'}</span><button class="btn btn--primary" type="submit">Enviar</button></div>
    </form>`;
  const box = $('inbox-messages');
  box.scrollTop = box.scrollHeight;
}
function renderSide() {
  const c = state.selected ? conversationById(state.selected) : null;
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
          <div class="props__row"><dt>Teléfono</dt><dd>${contact.phone ? `<a href="tel:${esc(String(contact.phone).replace(/\s+/g, ''))}">${esc(contact.phone)}</a>` : '<span class="muted">--</span>'}</dd></div>
        </dl>
        <a class="link-btn" href="../contacts/record/?id=${contact.id}">Ver ficha del contacto ↗</a>` : '<p class="muted">Esta conversación no tiene contacto asociado.</p>'}
    </div>
    <div class="card inbox__card">
      <h3 class="card__title">Acciones</h3>
      <label class="field"><span>Asignar a</span><select id="inbox-assign"><option value="">Sin asignar</option>${ASSIGNEES.map((o) => `<option value="${esc(o)}" ${c.assignedTo === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
      <div class="inbox__actions">
        <button class="btn btn--ghost btn--sm" type="button" data-inbox="toggle-status">${c.status === 'closed' ? 'Reabrir' : 'Marcar como cerrado'}</button>
        <button class="btn btn--ghost btn--sm" type="button" data-inbox="snooze">${c.status === 'snoozed' ? 'Quitar posposición' : 'Posponer'}</button>
      </div>
    </div>`;
}
function renderAll() { renderList(); renderThread(); renderSide(); refreshBadge(); }
function select(id) {
  state.selected = id;
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
  const c = state.selected ? conversationById(state.selected) : null;
  if (c && c.contactId) form.elements.contactId.value = String(c.contactId);
  m.classList.add('is-open');
  m.setAttribute('aria-hidden', 'false');
  setTimeout(() => form.elements.subject.focus(), 0);
}
function closeNew() { const m = modal(); m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); }

root.addEventListener('click', (e) => {
  const item = e.target.closest('.inbox__item[data-id]');
  if (item) { select(item.dataset.id); return; }
  const tab = e.target.closest('.inbox__tab[data-who]');
  if (tab) { state.who = tab.dataset.who; state.selected = null; renderAll(); return; }
  const act = e.target.closest('[data-inbox]');
  if (act) {
    const a = act.dataset.inbox;
    if (a === 'new') { openNew(); return; }
    const c = state.selected ? conversationById(state.selected) : null;
    if (!c) return;
    if (a === 'toggle-status') {
      const next = c.status === 'closed' ? 'open' : 'closed';
      setConversationStatus(c.id, next);
      toast(next === 'closed' ? 'Conversación cerrada' : 'Conversación reabierta');
    } else if (a === 'snooze') {
      const next = c.status === 'snoozed' ? 'open' : 'snoozed';
      setConversationStatus(c.id, next);
      toast(next === 'snoozed' ? 'Conversación pospuesta' : 'Conversación de nuevo abierta');
    }
    renderAll();
    return;
  }
  if (e.target.closest('[data-bm="close"]')) { e.preventDefault(); closeNew(); }
});
root.addEventListener('change', (e) => {
  if (e.target.id === 'inbox-status') { state.status = e.target.value; state.selected = null; renderAll(); }
  else if (e.target.id === 'inbox-channel') { state.channel = e.target.value; state.selected = null; renderAll(); }
  else if (e.target.id === 'inbox-assign' && state.selected) { assignConversation(state.selected, e.target.value); toast(e.target.value ? `Asignada a ${e.target.value}` : 'Conversación sin asignar'); renderAll(); }
});
root.addEventListener('input', (e) => { if (e.target.id === 'inbox-q') { state.q = e.target.value; renderList(); } });
root.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.closest('#inbox-reply')) { e.preventDefault(); $('inbox-reply').requestSubmit ? $('inbox-reply').requestSubmit() : $('inbox-reply').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal().classList.contains('is-open')) closeNew(); });
root.addEventListener('submit', (e) => {
  if (e.target.id === 'inbox-reply') {
    e.preventDefault();
    const body = e.target.elements.body.value.trim();
    if (!body || !state.selected) return;
    const m = sendMessage(state.selected, { body, direction: 'out', author: ME });
    if (!m) return;
    toast('Mensaje enviado');
    renderAll();
    const ta = $('inbox-reply') && $('inbox-reply').elements.body;
    if (ta) ta.focus();
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
    toast('Conversación creada');
    select(c.id);
  }
});

renderAll();
if (state.selected) markRead(state.selected), renderAll();

export { state, renderAll };
