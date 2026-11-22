// Floating e-mail composer, laid out like the person's screenshot (attachments/picture-8.png):
// header with drag handle / collapse / expand / close, tool tabs, Para / De / Asunto,
// rich-text body with signature, formatting toolbar, associations, Enviar + follow-up task.
import { getComposeDraft, saveComposeDraft, removeComposeDraft, restoreDraftAttachments } from './compose-drafts.js';
import { toast, wireMenus, closeMenus } from './shell.js';
import { ACT_ICONS } from './action-icons.js';
import { addRecord, formatDate, TODAY, allContacts } from './data.js';
import { ready as templatesReady, templates as savedTemplates, resolveTokens, recordTemplateUse, bodyText } from './templates-data.js';
import { openTokenPicker, chipHtml, chipsToMarkers, renderTokens, contextFromRecord, insertAtCaret, trackCaret, plainText } from './tokens.js';
import { scheduleEmail, scheduledEntry, logScheduled, SEND_LATER_PRESETS, presetSendAt, datetimeInput as laterInput, whenText as laterText, timeZoneName } from './scheduled-emails.js';
import { snippets as savedSnippets } from './snippets-data.js';
import { attachSnippetAutocomplete } from './snippet-autocomplete.js';
import { ready as sequencesReady, sequences as savedSequences, activeEnrollment, STEP_TYPES } from './sequences-data.js';
import { openEnrollDialog } from './sequence-enroll.js';
import { ready as emailsReady, activeAccounts, signatureById, PROVIDERS } from './connected-emails.js';
import { openConnectWizard } from './connected-emails-ui.js';
import { sendMail } from './gmail.js';
import { attachmentMetadata, formatAttachmentSize, validateAttachmentSize, encodeAttachments } from './mail-attachments.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const SIG_KEY = 'crm:signature';
// "De": the user's connected and active e-mail accounts (Ajustes › General › Correo); none → nothing can be sent.
const senders = () => activeAccounts().map((a) => [loadSig().name, a.email, a]);
const senderIndex = () => ctx?.fromAccountId && senders().some((s) => s[2].id === ctx.fromAccountId) ? senders().findIndex((s) => s[2].id === ctx.fromAccountId) : Math.min(ctx && ctx.senderIdx ? ctx.senderIdx : 0, Math.max(0, senders().length - 1));
const currentSender = () => senders()[senderIndex()] || [loadSig().name, '', null];
// The account's own signature when it has one, the sender card otherwise.
function signatureFor(account, sig) {
  const custom = account && account.signatureId && account.signatureId !== 'default' ? signatureById(account.signatureId) : null;
  return custom ? `<div class="sig sig--custom">${custom.html}</div>` : signatureHtml(sig);
}
const reopenAfterConnect = () => { if (el && !el.hidden && ctx) { syncFields(); render(); } };
const DEFAULT_SIG = {
  name: 'Fernando Lovera Colin',
  title: 'President',
  company: 'Megaglass USA LLC',
  phones: '+52-712-690-1001 | +1-305-753-0007',
  email: 'fernando-lovera@megaglass.us',
  web: 'www.megaglass.com.mx',
  address: 'Brickell AVE STE 950976, Miami, FL 33131-2848',
  cta: "Let's Talk",
};
// "Plantillas" lists the saved message templates (CRM › Plantillas de mensaje); a late load refreshes the panel.
const rootPath = () => document.body.dataset.root || '';
const tplPanelHtml = () => {
  const timestamp = (value) => Date.parse(value) || 0;
  const list = savedTemplates().sort((a, b) => timestamp(b.lastUsedAt) - timestamp(a.lastUsedAt) || timestamp(b.updatedAt) - timestamp(a.updatedAt));
  return `<div class="compose__seqsearch"><input type="search" placeholder="Buscar plantillas" aria-label="Buscar plantillas" data-tpl-search autocomplete="off" /></div><div class="compose__seqlist">${list.length ? list.map((t) => `<button class="menu__item" type="button" data-tpl="${esc(t.id)}" data-search="${esc(`${t.name || ''} ${t.subject || ''}`.toLowerCase())}">${esc(t.name)}${t.shared ? '' : ' <span class="muted">· Privada</span>'}</button>`).join('') : '<div class="menu__note" data-tpl-empty>Todavía no hay plantillas guardadas</div>'}<div class="menu__note" data-tpl-no-results role="status" hidden></div></div><div class="menu__sep"></div><a class="menu__item" href="${rootPath()}templates/">Administrar plantillas</a>`;
};
// "Secuencias" lists the real sequences (Ventas › Secuencias); choosing one opens the enrolment dialog.
const seqPanelHtml = () => {
  const list = savedSequences().filter((s) => s.steps.length);
  const cid = ctx && ctx.contactId;
  return `<div class="compose__seqsearch"><input type="search" placeholder="Buscar secuencias" aria-label="Buscar secuencias" data-seq-search autocomplete="off" /></div><div class="compose__seqlist">${list.length ? list.map((s) => {
    const counts = Object.entries(STEP_TYPES).map(([type, meta]) => { const n = s.steps.filter(st => st.type === type).length; return n ? `<span>${meta.icon} ${n} ${esc(meta.label)}</span>` : ''; }).join('');
    const active = cid && activeEnrollment(cid, s.id);
    return `<button class="menu__item compose__seqrow" type="button" data-seq="${esc(s.id)}" data-name="${esc(s.name.toLowerCase())}"><span class="compose__seqtitle"><strong>${esc(s.name)}</strong><span class="tag">${active ? (active.status === 'paused' ? 'En pausa' : 'Ya inscrito') : 'Disponible'}</span></span><span class="compose__seqtypes">${counts}</span><span class="muted">${s.steps.length} pasos</span></button>`;
  }).join('') : '<div class="menu__note">Todavía no hay secuencias</div>'}<div class="menu__note" data-seq-no-results role="status" hidden>Sin secuencias que coincidan</div></div><div class="menu__sep"></div><a class="menu__item" href="${rootPath()}sequences/">Administrar secuencias</a>`;
};
const DOCUMENTS = ['Catálogo Megaglass 2026.pdf', 'Ficha técnica vidrio templado.pdf', 'Guía de instalación.pdf'];
const MEETINGS = ['Llamada de 15 minutos', 'Visita técnica (60 min)', 'Presentación de propuesta (30 min)'];
const QUOTES = ['Crear cotización nueva', 'Cotización #1042 — Fachada Cristales Norte', 'Cotización #1039 — Mamparas Hogar Luz'];

let el = null;
let ctx = null;
let collapsed = false;
let expanded = false;

const loadSig = () => { try { return { ...DEFAULT_SIG, ...(JSON.parse(localStorage.getItem(SIG_KEY)) || {}) }; } catch { return { ...DEFAULT_SIG }; } };
const saveSig = (s) => localStorage.setItem(SIG_KEY, JSON.stringify(s));

function signatureHtml(s) {
  return `
    <div class="sig">
      <div class="sig__left">
        <span class="sig__photo" aria-hidden="true">${esc(s.name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase())}</span>
        <span class="sig__logo" aria-hidden="true"><span class="sig__logo-mark"></span><span class="sig__logo-text">MEGA<br>GLASS</span><small>reflejando inspiración</small></span>
      </div>
      <div class="sig__right">
        <div class="sig__name">${esc(s.name)}</div>
        <div>${esc(s.title)}</div>
        <div>${esc(s.company)}</div>
        <hr class="sig__rule" />
        <div class="sig__row"><span class="sig__ico">☏</span>${esc(s.phones)}</div>
        <div class="sig__row"><span class="sig__ico">✉</span>${esc(s.email)}</div>
        <div class="sig__row"><span class="sig__ico">⚲</span>${esc(s.web)}</div>
        <div class="sig__row"><span class="sig__ico">⌖</span>${esc(s.address)}</div>
        <div class="sig__social"><span class="sig__dot">f</span><span class="sig__dot">in</span></div>
        <span class="sig__cta">${esc(s.cta)}</span>
      </div>
    </div>`;
}

function businessDaysFrom(n) {
  const d = new Date(TODAY);
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left -= 1;
  }
  return d;
}
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const FOLLOW_OPTS = [[1, 'En 1 día laborable'], [2, 'En 2 días laborables'], [3, 'En 3 días laborables'], [5, 'En 1 semana'], [10, 'En 2 semanas']];

function mount() {
  if (el) return;
  el = document.createElement('section');
  el.className = 'compose';
  el.id = 'compose';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Correo');
  document.body.appendChild(el);
  document.addEventListener('crm:enrolled', () => {
    const panel = el.querySelector('#cmp-seq-panel');
    if (panel && ctx) { panel.innerHTML = seqPanelHtml(); wireSeqSearch(); }
  });
}

// The search box inside the Secuencias menu (shown when there are many): filters the list, keeps the menu open.
function wireSeqSearch() {
  const ss = el && el.querySelector('[data-seq-search]');
  if (!ss || ss.dataset.wired) return;
  ss.dataset.wired = '1';
  ss.addEventListener('click', (e) => e.stopPropagation());
  ss.addEventListener('input', () => { const q = ss.value.trim().toLowerCase(); el.querySelectorAll('#cmp-seq-panel [data-seq]').forEach((b) => { b.hidden = Boolean(q) && !b.dataset.name.includes(q); }); el.querySelector('[data-seq-no-results]').hidden = !q || Boolean(el.querySelector('#cmp-seq-panel [data-seq]:not([hidden])')); });
}
function wireTplSearch() {
  const search = el && el.querySelector('[data-tpl-search]');
  if (!search || search.dataset.wired) return;
  search.dataset.wired = '1';
  search.addEventListener('click', (e) => e.stopPropagation());
  search.addEventListener('input', () => {
    const query = search.value.trim();
    let matches = 0;
    el.querySelectorAll('#cmp-tpl-panel [data-tpl]').forEach((button) => {
      button.hidden = !button.dataset.search.includes(query.toLowerCase());
      if (!button.hidden) matches += 1;
    });
    const empty = el.querySelector('[data-tpl-empty]');
    if (empty) empty.hidden = Boolean(query);
    const note = el.querySelector('[data-tpl-no-results]');
    note.hidden = !query || matches > 0;
    note.textContent = note.hidden ? '' : `Sin resultados para '${query}'`;
  });
}
// The contact the composer was opened for (its record when known, otherwise what the caller passed).
function tokenContact() {
  const known = ctx.contactId ? allContacts().find((c) => String(c.id) === String(ctx.contactId)) : null;
  return known || { first: ctx.firstName, name: ctx.to, company: ctx.company, email: (ctx.recipients[0] || {}).email || '' };
}
// What the personalisation tokens read from here: the contact (with its company, deal, ticket and owner);
// the "De" sender stands in as the owner when the contact has none.
function composeContext() {
  const c = tokenContact();
  const sender = currentSender();
  const extra = !c.owner || c.owner === 'Sin asignar' ? { owner: { first: sender[0].split(' ')[0], last: sender[0].split(' ').slice(1).join(' '), name: sender[0], email: sender[1], phone: '', jobTitle: '' } } : {};
  return contextFromRecord('contacts', c, extra);
}

function render() {
  const sig = loadSig();
  const sender = currentSender();
  const follow = FOLLOW_OPTS.find((o) => o[0] === ctx.followDays) || FOLLOW_OPTS[1];
  const followDate = businessDaysFrom(follow[0]);
  el.className = `compose${collapsed ? ' is-collapsed' : ''}${expanded ? ' is-expanded' : ''}`;
  el.innerHTML = `
    <header class="compose__head" id="compose-head">
      <span class="compose__grip" aria-hidden="true">⋮⋮</span>
      <button class="compose__chev" type="button" data-cm="collapse" aria-label="${collapsed ? 'Desplegar' : 'Contraer'}">${collapsed ? '›' : '⌄'}</button>
      <h2>Correo${collapsed && ctx.subject ? ` <span class="muted">· ${esc(ctx.subject)}</span>` : ''}</h2>
      <span class="compose__tools">
        <button class="icon-btn" type="button" data-cm="expand" aria-label="${expanded ? 'Restaurar tamaño' : 'Ampliar'}">${expanded ? ACT_ICONS.shrink : ACT_ICONS.expand}</button>
        <button class="icon-btn" type="button" data-cm="close" aria-label="Cerrar">×</button>
      </span>
    </header>
    <div class="compose__body">
      <nav class="compose__tabs">
        <div class="menu"><button type="button" aria-haspopup="true">Plantillas</button><div class="menu__panel" id="cmp-tpl-panel">${tplPanelHtml()}</div></div>
        <div class="menu"><button type="button" aria-haspopup="true">Secuencias</button><div class="menu__panel" id="cmp-seq-panel">${seqPanelHtml()}</div></div>
        <div class="menu"><button type="button" aria-haspopup="true">Documentos</button><div class="menu__panel">${DOCUMENTS.map((d) => `<button class="menu__item" type="button" data-doc="${esc(d)}">${d}</button>`).join('')}</div></div>
        <div class="menu"><button type="button" aria-haspopup="true">Reuniones <span class="caret"></span></button><div class="menu__panel">${MEETINGS.map((m) => `<button class="menu__item" type="button" data-meet="${esc(m)}">${m}</button>`).join('')}</div></div>
        <div class="menu"><button type="button" aria-haspopup="true">Cotizaciones <span class="caret"></span></button><div class="menu__panel">${QUOTES.map((q) => `<button class="menu__item" type="button" data-quote="${esc(q)}">${q}</button>`).join('')}</div></div>
      </nav>

      <div class="compose__row">
        <label class="compose__lbl" for="cmp-to">Para</label>
        <div class="compose__chips" id="cmp-to-chips">
          ${ctx.recipients.map((r, i) => `<span class="chip-to" title="${esc(r.email ? `Se enviará a: ${r.email}` : (r.name || ''))}">${esc(r.name || r.email)} <button type="button" data-rm="${i}" aria-label="Quitar">×</button></span>`).join('')}
          <input id="cmp-to" type="email" placeholder="${ctx.recipients.length ? '' : 'Añadir destinatario'}" aria-label="Añadir destinatario" />
        </div>
      </div>
      <div class="compose__row">
        <span class="compose__lbl">De</span>
        ${senders().length ? `<div class="menu compose__from">
          <button class="compose__frombtn" type="button" aria-haspopup="true">${esc(sender[0])} (${esc(sender[1])} <span class="caret"></span>)</button>
          <div class="menu__panel">${senders().map((s, i) => `<button class="menu__item${i === senderIndex() ? ' is-current' : ''}" type="button" data-sender="${i}">${esc(s[0])} (${esc(s[1])}) <span class="muted">· ${esc((PROVIDERS[s[2].provider] || PROVIDERS.imap).inbox)}</span></button>`).join('')}<div class="menu__sep"></div><button class="menu__item" type="button" data-cm="connect-email">Conectar otra cuenta de correo</button></div>
        </div>` : '<span class="compose__nofrom">Sin cuenta de correo conectada · <button class="link-btn" type="button" data-cm="connect-email">Conectar cuenta de correo</button></span>'}
        <span class="compose__ccbtns">
          <button class="link-btn${ctx.showCc ? ' is-on' : ''}" type="button" data-cm="cc">CC</button>
          <button class="link-btn${ctx.showBcc ? ' is-on' : ''}" type="button" data-cm="bcc">Cco</button>
        </span>
      </div>
      ${ctx.showCc ? `<div class="compose__row"><label class="compose__lbl" for="cmp-cc">CC</label><input class="compose__input" id="cmp-cc" type="text" value="${esc(ctx.cc || '')}" placeholder="correo@ejemplo.com" /></div>` : ''}
      ${ctx.showBcc ? `<div class="compose__row"><label class="compose__lbl" for="cmp-bcc">Cco</label><input class="compose__input" id="cmp-bcc" type="text" value="${esc(ctx.bcc || '')}" placeholder="correo@ejemplo.com" /></div>` : ''}
      <div class="compose__row">
        <label class="compose__lbl" for="cmp-subject">Asunto</label>
        <input class="compose__input compose__subject" id="cmp-subject" type="text" value="${esc(ctx.subject || '')}" />
      </div>

      <div class="compose__editor">
        <div class="compose__text" id="cmp-text" contenteditable="true" data-placeholder="Escribe &quot;/&quot; para pedirle al asistente que redacte un correo para ${esc(ctx.to || 'este contacto')}">${ctx.body || ''}</div>
        <div class="compose__slash" id="cmp-slash" hidden>
          <button class="menu__item" type="button" data-ai="followup">✦ Redactar un seguimiento</button>
          <button class="menu__item" type="button" data-ai="intro">✦ Presentar Megaglass</button>
          <button class="menu__item" type="button" data-ai="thanks">✦ Agradecer la reunión</button>
        </div>
        ${signatureFor(sender[2], sig)}
        ${ctx.attachments.length ? `<div class="compose__files">${ctx.attachments.map((f, i) => `<span class="chip-to">${ACT_ICONS.attach} ${esc(f.name)} (${formatAttachmentSize(f.size)}) <button type="button" data-rmfile="${i}" aria-label="Quitar">×</button></span>`).join('')}</div>` : ''}
      </div>

      <div class="compose__toolbar">
        <button type="button" data-fmt="bold" title="Negrita"><b>B</b></button>
        <button type="button" data-fmt="italic" title="Cursiva"><i>I</i></button>
        <button type="button" data-fmt="underline" title="Subrayado"><u>U</u></button>
        <button type="button" data-fmt="removeFormat" title="Quitar formato">I<sub>x</sub></button>
        <div class="menu"><button type="button" aria-haspopup="true"><strong>Más</strong> <span class="caret"></span></button><div class="menu__panel">
          <button class="menu__item" type="button" data-fmt="insertUnorderedList">Lista con viñetas</button>
          <button class="menu__item" type="button" data-fmt="insertOrderedList">Lista numerada</button>
          <button class="menu__item" type="button" data-fmt="justifyLeft">Alinear a la izquierda</button>
          <button class="menu__item" type="button" data-fmt="justifyCenter">Centrar</button>
          <button class="menu__item" type="button" data-fmt="formatBlock" data-arg="blockquote">Cita</button>
        </div></div>
        <span class="compose__sep"></span>
        <button type="button" data-cm="link" title="Insertar enlace" aria-label="Insertar enlace">${ACT_ICONS.link}</button>
        <button type="button" data-cm="image" title="Insertar imagen" aria-label="Insertar imagen">${ACT_ICONS.image}</button>
        <div class="menu"><button type="button" aria-haspopup="true"><strong>Insertar</strong> <span class="caret"></span></button><div class="menu__panel">
          <div class="menu__title">Insertar</div>
          <button class="menu__item" type="button" data-cm="ins-token">Token de personalización</button>
          <button class="menu__item" type="button" data-cm="ins-snippet">Fragmento</button>
          <button class="menu__item" type="button" data-meet="${esc(MEETINGS[0])}">Enlace de reunión</button>
          <button class="menu__item" type="button" data-doc="${esc(DOCUMENTS[0])}">Documento</button>
          <button class="menu__item" type="button" data-quote="${esc(QUOTES[1])}">Cotización</button>
          <button class="menu__item" type="button" data-cm="video">Vídeo</button>
        </div></div>
        <label class="compose__attach" title="Adjuntar archivo" aria-label="Adjuntar archivo">${ACT_ICONS.attach}<input type="file" id="cmp-file" multiple hidden /></label>
        <span class="compose__right">
          <div class="menu"><button type="button" aria-haspopup="true"><span class="ai-spark">✦</span> <span class="caret"></span></button><div class="menu__panel menu__panel--right">
            <button class="menu__item" type="button" data-ai="followup">Redactar seguimiento</button>
            <button class="menu__item" type="button" data-ai="improve">Mejorar redacción</button>
            <button class="menu__item" type="button" data-ai="shorten">Acortar</button>
            <button class="menu__item" type="button" data-ai="formal">Tono más formal</button>
          </div></div>
          <div class="menu"><button type="button" aria-haspopup="true"><strong>Asociado con ${ctx.assoc.filter((a) => a.on).length} registros</strong> <span class="caret"></span></button><div class="menu__panel menu__panel--right">
            ${ctx.assoc.map((a, i) => `<label class="menu__item compose__assoc"><input type="checkbox" data-assoc="${i}" ${a.on ? 'checked' : ''} /> ${esc(a.label)} <span class="muted">· ${esc(a.kind)}</span></label>`).join('')}
          </div></div>
        </span>
      </div>

      <footer class="compose__foot">
        <span class="splitbtn">
          <button class="pill pill--send" type="button" data-cm="send"${senders().length ? '' : ' title="Conecta tu correo para enviar"'}>Enviar</button>${senders().length ? '' : '<span class="compose__warn" role="status">Conecta tu correo para enviar</span>'}
          <div class="menu"><button class="pill pill--send pill--send-caret" type="button" aria-haspopup="true" aria-label="Más opciones de envío"><span class="caret"></span></button><div class="menu__panel menu__panel--up">
            <button class="menu__item" type="button" data-cm="send-later">Enviar más tarde</button>
            <button class="menu__item" type="button" data-cm="save-draft">Guardar borrador</button>
          </div></div>
        </span>
        <label class="compose__follow">
          <input type="checkbox" id="cmp-follow" ${ctx.follow ? 'checked' : ''} />
          <span>Crear una tarea de
            <span class="menu"><button class="link-btn link-btn--dark" type="button" aria-haspopup="true">${esc(ctx.followType || 'Por hacer')} <span class="caret"></span></button><div class="menu__panel menu__panel--up">${['Por hacer', 'Llamada', 'Correo'].map((t) => `<button class="menu__item" type="button" data-ftype="${t}">${t}</button>`).join('')}</div></span>
            para hacer seguimiento en
            <span class="menu"><button class="link-btn link-btn--dark" type="button" aria-haspopup="true">${follow[1]} (${DAY_NAMES[followDate.getDay()]}) <span class="caret"></span></button><div class="menu__panel menu__panel--up">${FOLLOW_OPTS.map(([n, l]) => `<button class="menu__item" type="button" data-fdays="${n}">${l} (${DAY_NAMES[businessDaysFrom(n).getDay()]})</button>`).join('')}</div></span>
          </span>
        </label>
        ${ctx.updatedAt ? `<span class="muted" role="status">Borrador guardado a las ${esc(new Date(ctx.updatedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false }))}</span><button type="button" class="link-btn" data-cm="discard-draft">Descartar borrador</button>` : ''}
      </footer>
    </div>`;
  wireMenus(el);
  wireSeqSearch();
  wireTplSearch();
  const text = el.querySelector('#cmp-text');
  if (text && !collapsed) {
    text.addEventListener('input', () => {
      ctx.body = text.innerHTML;
      const plain = text.textContent;
      el.querySelector('#cmp-slash').hidden = !(plain.trim() === '/' || plain.endsWith(' /'));
    });
    // "#atajo" inserts a snippet with this contact's data in place of its tokens.
    attachSnippetAutocomplete(text, { context: composeContext });
    trackCaret(text); // tokens, snippets, links and documents land where the caret was
    const subj = el.querySelector('#cmp-subject');
    if (subj) trackCaret(subj);
  }
}

function insertHtml(html) {
  const text = el.querySelector('#cmp-text');
  const plain = text.textContent.trim();
  if (plain === '/') text.innerHTML = '';
  insertAtCaret(text, html);
  ctx.body = text.innerHTML;
  el.querySelector('#cmp-slash').hidden = true;
}

function aiText(kind) {
  const s = loadSig();
  const name = ctx.firstName || ctx.to || '';
  const company = ctx.company || 'tu empresa';
  const map = {
    followup: `Hola ${name},<br><br>Te escribo para retomar nuestra última conversación sobre ${company}. Me gustaría saber si sigue siendo buen momento para avanzar y resolver cualquier duda pendiente.<br><br>¿Te viene bien una breve llamada esta semana?<br><br>Un saludo,<br>${s.name}`,
    intro: `Hola ${name},<br><br>Soy ${s.name}, de ${s.company}. Diseñamos, fabricamos e instalamos soluciones de vidrio para fachadas, cerramientos y mamparas, con plazos cortos y garantía de 10 años.<br><br>Me encantaría conocer tus próximos proyectos en ${company}.<br><br>Saludos,<br>${s.name}`,
    thanks: `Hola ${name},<br><br>Gracias por tu tiempo en la reunión de hoy. Te resumo los siguientes pasos: te enviaré la cotización actualizada y coordinamos la visita técnica.<br><br>Quedo atento a tus comentarios.<br><br>Un saludo,<br>${s.name}`,
  };
  return map[kind];
}

function send(whenLabel) {
  if (ctx?.sending || ctx?.saving) return;
  // Nothing goes out without a connected account: the wizard opens and the draft stays.
  if (!senders().length) { toast('Conecta tu correo para enviar'); openConnectWizard({ onConnected: reopenAfterConnect }); return; }
  // Personalisation tokens (chips or {{…}} markers) become the contact's real data when the e-mail goes out.
  syncFields();
  const tokenCtx = composeContext();
  const subject = renderTokens((el.querySelector('#cmp-subject') || {}).value || ctx.subject || '(sin asunto)', tokenCtx);
  ctx.subject = subject;
  ctx.body = renderTokens(chipsToMarkers(ctx.body || ''), tokenCtx);
  const recipients = ctx.recipients.map((r) => r.name || r.email).join(', ');
  if (!ctx.recipients.length) {
    toast('Añade al menos un destinatario');
    return;
  }
  const sender = currentSender();
  const account = sender[2];
  // A real Google account sends through the Gmail API («Enviar más tarde» queues instead: scheduleSend below).
  if (account && account.real && !whenLabel) { sendViaGmail(account, sender, subject, recipients); return; }
  if (!whenLabel && ctx.templateId) void recordTemplateUse(ctx.templateId);
  logSent(sender, whenLabel, subject, recipients, { simulated: true });
  finishSend(sender, whenLabel, recipients);
}
// ---------- «Enviar más tarde»: the dialog with the presets and a custom date-time, then the queue ----------
function closeSendLater() { const p = el && el.querySelector('#cmp-later'); if (p) p.remove(); }
function openSendLater() {
  if (!ctx) return;
  if (!senders().length) { toast('Conecta tu correo para enviar'); openConnectWizard({ onConnected: reopenAfterConnect }); return; }
  closeSendLater();
  const foot = el.querySelector('.compose__foot');
  if (!foot) return;
  const now = new Date();
  const panel = document.createElement('div');
  panel.className = 'compose__later';
  panel.id = 'cmp-later';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Enviar más tarde');
  const minLocal = laterInput(new Date(now.getTime() + 60000).toISOString());
  panel.innerHTML = `
    <div class="compose__laterhead"><strong>Enviar más tarde</strong><button type="button" class="compose__laterclose" data-later="close" aria-label="Cerrar">×</button></div>
    <div class="compose__laterpresets">
      ${SEND_LATER_PRESETS.map(([k, l]) => `<button type="button" class="menu__item" data-later="${k}"><span>${l}</span><span class="muted">${esc(laterText(presetSendAt(k, now)))}</span></button>`).join('')}
    </div>
    <form class="compose__latercustom" data-later-form>
      <label class="field"><span>Fecha y hora personalizadas</span><input type="datetime-local" id="cmp-later-at" name="at" value="${esc(minLocal)}" min="${esc(minLocal)}" required /></label>
      <p class="muted compose__latertz">Zona horaria: ${esc(timeZoneName())}</p>
      <div class="compose__laterbtns"><button type="submit" class="btn btn--primary btn--sm" data-later="custom">Programar</button><button type="button" class="btn btn--ghost btn--sm" data-later="close">Cancelar</button></div>
    </form>`;
  foot.appendChild(panel);
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-later]');
    if (!b || b.dataset.later === 'custom') return;
    e.preventDefault();
    if (b.dataset.later === 'close') { closeSendLater(); return; }
    scheduleSend(presetSendAt(b.dataset.later));
  });
  panel.querySelector('[data-later-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = panel.querySelector('#cmp-later-at').value;
    const d = v ? new Date(v) : null;
    if (!d || Number.isNaN(d.getTime())) { toast('Elige una fecha y hora válidas'); return; }
    scheduleSend(d.toISOString());
  });
  setTimeout(() => { const i = panel.querySelector('#cmp-later-at'); if (i) i.focus(); }, 30);
}
// Queues the e-mail as it is now (tokens resolved, signature included) and logs «Correo programado para el …»
// on the record; the checker of src/scheduled-emails.js sends it when the time comes.
async function scheduleSend(sendAt) {
  if (!ctx || ctx.sending) return;
  if (!senders().length) { toast('Conecta tu correo para enviar'); openConnectWizard({ onConnected: reopenAfterConnect }); return; }
  syncFields();
  const tokenCtx = composeContext();
  const subject = renderTokens((el.querySelector('#cmp-subject') || {}).value || ctx.subject || '(sin asunto)', tokenCtx);
  ctx.subject = subject;
  ctx.body = renderTokens(chipsToMarkers(ctx.body || ''), tokenCtx);
  const recipients = ctx.recipients.map((r) => r.name || r.email).join(', ');
  if (!ctx.recipients.length) { toast('Añade al menos un destinatario'); return; }
  const sender = currentSender();
  const account = sender[2];
  const html = `${ctx.body || ''}${signatureFor(account, loadSig())}`;
  let item;
  ctx.sending = true;
  try {
    const attachments = ctx.attachments.length ? await encodeAttachments(ctx.attachments) : [];
    item = scheduleEmail({
      attachments,
      to: ctx.recipients.map((x) => x.email).filter(Boolean), toNames: recipients, cc: splitAddresses(ctx.cc), bcc: splitAddresses(ctx.bcc),
      subject, html, text: plainText(html), fromAccountId: account ? account.id : '', fromName: sender[0], fromEmail: sender[1], via: account && account.real ? 'gmail' : 'simulado',
      recordType: ctx.recordType || '', recordId: ctx.recordId || '', sendAt, templateId: ctx.templateId || null,
    });
  } catch (e) { ctx.sending = false; toast(e.message || String(e)); return; }
  if (ctx.templateId) void recordTemplateUse(ctx.templateId);
  if (ctx.onSent) ctx.onSent(scheduledEntry(item, sender[0])); else logScheduled(item);
  closeSendLater();
  finishSend(sender, '', recipients, '', `Correo programado para el ${laterText(item.sendAt)}${item.via === 'gmail' ? ' · saldrá por Gmail' : ' · cuenta simulada: no saldrá ningún correo'}`);
}
function logSent(sender, whenLabel, subject, recipients, extra) {
  ctx.onSent?.({ type: 'email', when: Date.now(), who: sender[0], text: `${extra.simulated ? `Simulación${whenLabel ? ` de programación (${whenLabel})` : ''} · no se envió ningún correo` : 'Correo enviado'} a ${recipients}: "${subject}" · enviado desde ${sender[1]}${extra.via === 'gmail' ? ' por Gmail' : ''}.`, extra: { from: sender[1], subject, attachments: ctx.attachments.map(attachmentMetadata), ...extra } });
}
const splitAddresses = (s) => String(s || '').split(/[,;]/).map((x) => x.trim()).filter(Boolean);
async function sendViaGmail(account, sender, subject, recipients) {
  const sendingCtx = ctx;
  sendingCtx.sending = true;
  const templateId = ctx.templateId;
  const btn = el.querySelector('[data-cm="send"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  try {
    const r = await sendMail({ accountId: account.id, to: ctx.recipients.map((x) => x.email).filter(Boolean), cc: splitAddresses(ctx.cc), bcc: splitAddresses(ctx.bcc), subject, html: `${ctx.body || ''}${signatureFor(account, loadSig())}`, fromName: sender[0], attachments: [...ctx.attachments] });
    if (templateId) void recordTemplateUse(templateId);
    if (ctx !== sendingCtx || el.hidden) return;
    logSent(sender, '', subject, recipients, { via: 'gmail', gmailId: r.id || '', threadId: r.threadId || '' });
    finishSend(sender, '', recipients, 'Gmail');
  } catch (e) {
    sendingCtx.sending = false;
    if (ctx !== sendingCtx) return;
    toast(`No se pudo enviar por Gmail: ${e.message}`);
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar'; }
  }
}
function finishSend(sender, whenLabel, recipients, via = '', customToast = '') {
  if (el.querySelector('#cmp-follow')?.checked) {
    const days = ctx.followDays || 2;
    const due = businessDaysFrom(days);
    addRecord('tasks', {
      name: `${ctx.followType === 'Llamada' ? 'Llamar a' : ctx.followType === 'Correo' ? 'Escribir a' : 'Seguimiento con'} ${ctx.to}`,
      type: ctx.followType === 'Por hacer' ? 'Tarea' : ctx.followType || 'Tarea',
      status: 'todo',
      priority: 'medium',
      owner: sender[0].startsWith('Fernando') ? 'Fernando L.' : 'Sofía R.',
      contactId: ctx.contactId || '',
      contact: ctx.to,
      due: due.toISOString(),
      lastActivity: TODAY.toISOString(),
    });
    ctx.onSent?.({ type: 'task', when: Date.now(), who: sender[0], text: `Tarea de seguimiento creada para el ${formatDate(due)}.` });
  }
  toast(customToast || (via ? `Correo enviado a ${recipients} por ${via}` : 'Simulación registrada: no se envió ningún correo ni se programó un envío real.'));
  removeComposeDraft(ctx.recordType, ctx.recordId);
  close();
}

function close() {
  el.hidden = true;
  ctx = null;
  collapsed = false;
  expanded = false;
}

async function saveAndClose(explicit = false) {
  if (!ctx || ctx.sending || ctx.saving) return false;
  syncFields();
  const hasContent = ctx.updatedAt || ctx.subject || bodyText(ctx.body) || /<(img|hr|video)\b/i.test(ctx.body) || ctx.attachments.length || ctx.cc || ctx.bcc || ctx.follow || JSON.stringify(ctx.recipients) !== ctx.initialRecipients;
  if (!explicit && !hasContent) { close(); return true; }
  const savingCtx = ctx;
  ctx.saving = true;
  el.inert = true;
  try {
    const { recipients, cc, bcc, subject, body, follow, followDays, followType, templateId, attachments, showCc, showBcc } = ctx;
    await saveComposeDraft(ctx.recordType, ctx.recordId, { recipients, cc, bcc, subject, body, follow, followDays, followType, templateId, attachments, showCc, showBcc, fromAccountId: ctx.fromAccountId || currentSender()[2]?.id || '' });
    if (explicit) toast('Borrador guardado');
    close();
    return true;
  } catch (error) {
    toast(`No se pudo guardar el borrador: ${error.message}. El correo sigue abierto.`);
    return false;
  } finally { savingCtx.saving = false; el.inert = false; }
}

function wire() {
  el.addEventListener('click', (e) => {
    if (ctx?.sending || ctx?.saving) return;
    const t = e.target;
    const cm = t.closest('[data-cm]');
    if (cm) {
      const a = cm.dataset.cm;
      closeMenus();
      if (a === 'close') void saveAndClose();
      else if (a === 'collapse') { syncFields(); collapsed = !collapsed; render(); }
      else if (a === 'expand') { syncFields(); expanded = !expanded; collapsed = false; render(); }
      else if (a === 'cc') { ctx.showCc = !ctx.showCc; syncFields(); render(); }
      else if (a === 'bcc') { ctx.showBcc = !ctx.showBcc; syncFields(); render(); }
      else if (a === 'send') send();
      else if (a === 'send-later') openSendLater();
      else if (a === 'save-draft') void saveAndClose(true);
      else if (a === 'discard-draft') {
        try { removeComposeDraft(ctx.recordType, ctx.recordId); close(); toast('Borrador descartado'); }
        catch (error) { toast(`No se pudo descartar el borrador: ${error.message}`); }
      }
      else if (a === 'link') {
        const url = window.prompt('Dirección del enlace', 'https://');
        if (url) insertHtml(`<a href="${esc(url)}">${esc(url)}</a>`);
      } else if (a === 'image') toast('Arrastra una imagen al cuerpo del correo o usa el clip para adjuntarla.');
      else if (a === 'video') insertHtml('<p>▶ <a href="#">Vídeo: presentación Megaglass</a></p>');
      else if (a === 'ins-token') openTokenPicker({ anchor: t.closest('.menu'), onPick: ({ token, defaultValue }) => insertHtml(`${chipHtml(token, defaultValue)} `) });
      else if (a === 'ins-snippet') openTokenPicker({ anchor: t.closest('.menu'), mode: 'snippet', snippets: savedSnippets(), onPick: ({ snippet }) => insertHtml(renderTokens(snippet.body, composeContext())) });
      else if (a === 'connect-email') { closeMenus(); openConnectWizard({ onConnected: reopenAfterConnect }); }
      return;
    }
    const tpl = t.closest('[data-tpl]');
    if (tpl) {
      const tp = savedTemplates().find((x) => x.id === tpl.dataset.tpl);
      closeMenus();
      if (!tp) { toast('Esa plantilla ya no existe.'); return; }
      syncFields();
      const sender = currentSender();
      const who = { name: sender[0], email: sender[1] };
      const contact = tokenContact();
      ctx.templateId = tp.id;
      ctx.subject = resolveTokens(tp.subject, contact, who);
      ctx.body = resolveTokens(tp.body, contact, who);
      render();
      toast(`Plantilla «${tp.name}» aplicada`);
      return;
    }
    const seq = t.closest('[data-seq]');
    if (seq) { closeMenus(); syncFields(); openEnrollDialog({ contact: tokenContact(), sequenceId: seq.dataset.seq }); return; }
    const doc = t.closest('[data-doc]');
    if (doc) { closeMenus(); insertHtml(`<p>📄 <a href="#">${esc(doc.dataset.doc)}</a></p>`); return; }
    const meet = t.closest('[data-meet]');
    if (meet) { closeMenus(); insertHtml(`<p>📅 <a href="#">Reservar: ${esc(meet.dataset.meet)}</a></p>`); return; }
    const quote = t.closest('[data-quote]');
    if (quote) { closeMenus(); insertHtml(`<p>🧾 <a href="#">${esc(quote.dataset.quote)}</a></p>`); return; }
    const ai = t.closest('[data-ai]');
    if (ai) {
      closeMenus();
      const kind = ai.dataset.ai;
      const text = el.querySelector('#cmp-text');
      if (kind === 'improve' || kind === 'shorten' || kind === 'formal') {
        const plain = text.textContent.trim();
        if (!plain) { toast('Escribe primero un borrador.'); return; }
        if (kind === 'shorten') text.innerHTML = `<p>${esc(plain.split('. ').slice(0, 2).join('. '))}.</p>`;
        if (kind === 'improve') text.innerHTML = `<p>${esc(plain.replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase()))}</p><p>Quedo a tu disposición para cualquier consulta.</p>`;
        if (kind === 'formal') text.innerHTML = `<p>Estimado/a ${esc(ctx.firstName || ctx.to)},</p><p>${esc(plain)}</p><p>Atentamente,</p>`;
        ctx.body = text.innerHTML;
      } else {
        text.innerHTML = aiText(kind);
        ctx.body = text.innerHTML;
        if (!ctx.subject) { ctx.subject = kind === 'intro' ? `Soluciones de vidrio para ${ctx.company || 'tu proyecto'}` : kind === 'thanks' ? 'Gracias por la reunión' : `Seguimiento · ${ctx.company || ctx.to}`; el.querySelector('#cmp-subject').value = ctx.subject; }
      }
      el.querySelector('#cmp-slash').hidden = true;
      toast('Texto generado');
      return;
    }
    const fmt = t.closest('[data-fmt]');
    if (fmt) {
      closeMenus();
      el.querySelector('#cmp-text').focus();
      document.execCommand(fmt.dataset.fmt, false, fmt.dataset.arg || null);
      ctx.body = el.querySelector('#cmp-text').innerHTML;
      return;
    }
    const rm = t.closest('[data-rm]');
    if (rm) { ctx.recipients.splice(Number(rm.dataset.rm), 1); syncFields(); render(); return; }
    const rmf = t.closest('[data-rmfile]');
    if (rmf) { ctx.attachments.splice(Number(rmf.dataset.rmfile), 1); syncFields(); render(); return; }
    const sender = t.closest('[data-sender]');
    if (sender) { ctx.senderIdx = Number(sender.dataset.sender); ctx.fromAccountId = senders()[ctx.senderIdx]?.[2].id || ''; closeMenus(); syncFields(); render(); return; }
    const ftype = t.closest('[data-ftype]');
    if (ftype) { closeMenus(); syncFields(); ctx.followType = ftype.dataset.ftype; ctx.follow = true; render(); return; }
    const fdays = t.closest('[data-fdays]');
    if (fdays) { closeMenus(); syncFields(); ctx.followDays = Number(fdays.dataset.fdays); ctx.follow = true; render(); return; }
  });
  el.addEventListener('input', (e) => {
    if (e.target.id === 'cmp-text' && !bodyText(e.target.innerHTML) && !e.target.querySelector('img')) ctx.templateId = null;
  });
  el.addEventListener('change', (e) => {
    if (ctx?.sending || ctx?.saving) return;
    const cb = e.target.closest('[data-assoc]');
    if (cb) { ctx.assoc[Number(cb.dataset.assoc)].on = cb.checked; syncFields(); render(); return; }
    if (e.target.id === 'cmp-follow') ctx.follow = e.target.checked;
    if (e.target.id === 'cmp-file') {
      const files = [...ctx.attachments, ...e.target.files];
      try { validateAttachmentSize(files); } catch (error) { toast(error.message); e.target.value = ''; return; }
      ctx.attachments = files;
      syncFields();
      render();
    }
  });
  el.addEventListener('keydown', (e) => {
    if (e.target.id === 'cmp-to' && (e.key === 'Enter' || e.key === ',')) {
      e.preventDefault();
      const v = e.target.value.trim().replace(/,$/, '');
      if (v) {
        ctx.recipients.push({ email: v });
        e.target.value = '';
        syncFields();
        render();
        el.querySelector('#cmp-to').focus();
      }
    }
    if (e.key === 'Escape') { el.querySelector('#cmp-slash').hidden = true; }
  });
  // drag the window by its header
  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    const head = e.target.closest('#compose-head');
    if (!head || e.target.closest('button') || expanded) return;
    const r = el.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    el.classList.add('is-dragging');
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const x = Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, e.clientX - drag.dx));
    const y = Math.max(8, Math.min(window.innerHeight - 60, e.clientY - drag.dy));
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  });
  document.addEventListener('pointerup', () => { if (drag) { drag = null; el.classList.remove('is-dragging'); } });
}

function syncFields() {
  if (!el || !ctx) return;
  const toInput = el.querySelector('#cmp-to');
  if (toInput?.value.trim()) { ctx.recipients.push({ email: toInput.value.trim() }); toInput.value = ''; }
  const subj = el.querySelector('#cmp-subject');
  if (subj) ctx.subject = subj.value;
  const text = el.querySelector('#cmp-text');
  if (text) { ctx.body = text.innerHTML; if (!bodyText(ctx.body) && !text.querySelector('img')) ctx.templateId = null; }
  const cc = el.querySelector('#cmp-cc');
  if (cc) ctx.cc = cc.value;
  const bcc = el.querySelector('#cmp-bcc');
  if (bcc) ctx.bcc = bcc.value;
  const f = el.querySelector('#cmp-follow');
  if (f) ctx.follow = f.checked;
}

export function openCompose(options) {
  if (ctx && !el.hidden) {
    if (ctx.sending || ctx.saving) return;
    return saveAndClose().then((saved) => { if (saved) openCompose(options); });
  }
  mount();
  if (!el.dataset.wired) {
    el.dataset.wired = '1';
    wire();
  }
  ctx = {
    to: options.to || '',
    firstName: options.firstName || (options.to || '').split(' ')[0],
    company: options.company || '',
    contactId: options.contactId || '',
    // the record whose timeline gets the entries (scheduled sends need it to update theirs later)
    recordType: options.recordType || (options.contactId ? 'contacts' : ''),
    recordId: options.recordId || options.contactId || '',
    recipients: options.email ? [{ name: options.to, email: options.email }] : [],
    senderIdx: 0,
    templateId: options.templateId || null,
    subject: options.subject || '',
    body: options.body || '',
    attachments: [],
    showCc: false,
    showBcc: false,
    follow: false,
    followType: 'Por hacer',
    followDays: 2,
    assoc: options.assoc || [],
    onSent: options.onSent,
  };
  ctx.initialRecipients = JSON.stringify(ctx.recipients);
  try {
    const draft = getComposeDraft(ctx.recordType, ctx.recordId);
    if (draft) Object.assign(ctx, draft, { attachments: restoreDraftAttachments(draft.attachments) });
  } catch (error) { toast(`No se pudo recuperar el borrador: ${error.message}`); }
  collapsed = false;
  expanded = false;
  el.style.left = '';
  el.style.top = '';
  el.style.right = '';
  el.style.bottom = '';
  el.hidden = false;
  render();
  templatesReady.then(() => { const p = el && el.querySelector('#cmp-tpl-panel'); if (p && ctx) { p.innerHTML = tplPanelHtml(); wireTplSearch(); } });
  sequencesReady.then(() => { const p = el && el.querySelector('#cmp-seq-panel'); if (p && ctx) { p.innerHTML = seqPanelHtml(); wireSeqSearch(); } });
  emailsReady.then(() => { if (el && !el.hidden && ctx && !el.querySelector('.compose__from') && senders().length) reopenAfterConnect(); });
  const subj = el.querySelector('#cmp-subject');
  if (subj) subj.focus();
}

export const getSignature = () => loadSig();
export const setSignature = (s) => saveSig({ ...loadSig(), ...s });
export const signatureHtmlOf = (s) => signatureHtml(s || loadSig());
export const emailTemplates = () => savedTemplates().map(({ name, subject, body }) => ({ name, subject, body }));

export function editSignature() {
  const s = loadSig();
  const name = window.prompt('Nombre en la firma', s.name);
  if (name === null) return;
  const title = window.prompt('Cargo', s.title) ?? s.title;
  const company = window.prompt('Empresa', s.company) ?? s.company;
  saveSig({ ...s, name, title, company });
  toast('Firma actualizada');
}
