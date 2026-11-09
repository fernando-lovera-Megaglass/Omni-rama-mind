// Floating e-mail composer, laid out like the person's screenshot (attachments/picture-8.png):
// header with drag handle / collapse / expand / close, tool tabs, Para / De / Asunto,
// rich-text body with signature, formatting toolbar, associations, Enviar + follow-up task.
import { toast, wireMenus, closeMenus } from './shell.js';
import { addRecord, formatDate, TODAY } from './data.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const SIG_KEY = 'crm:signature';
const SENDERS = [
  ['Fernando Lovera Colin', 'fernando-lovera@megaglass.us'],
  ['Ventas Megaglass', 'ventas@megaglass.us'],
  ['Soporte Megaglass', 'soporte@megaglass.us'],
];
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
const TEMPLATES = [
  ['Seguimiento de propuesta', 'Seguimiento: propuesta de {{empresa}}', 'Hola {{nombre}},<br><br>Quería hacer seguimiento de la propuesta que te enviamos. ¿Has tenido ocasión de revisarla? Quedo a tu disposición para resolver cualquier duda.<br><br>Un saludo,'],
  ['Presentación de Megaglass', 'Soluciones de vidrio para {{empresa}}', 'Hola {{nombre}},<br><br>Soy {{remitente}}, de Megaglass. Fabricamos e instalamos soluciones de vidrio para fachadas, cerramientos y mamparas. Me encantaría conocer tus próximos proyectos y ver cómo podemos ayudar.<br><br>¿Te viene bien una llamada esta semana?<br><br>Saludos,'],
  ['Confirmación de visita técnica', 'Confirmación de visita técnica', 'Hola {{nombre}},<br><br>Te confirmo la visita técnica para tomar medidas. Si necesitas cambiar la fecha, responde a este correo.<br><br>Gracias,'],
  ['Envío de cotización', 'Cotización {{empresa}}', 'Hola {{nombre}},<br><br>Adjunto la cotización solicitada. Incluye materiales, instalación y plazos de entrega. Cualquier ajuste que necesites, dímelo.<br><br>Un saludo,'],
];
const SEQUENCES = ['Prospección instaladores (5 pasos)', 'Reactivación de clientes', 'Seguimiento post-cotización'];
const DOCUMENTS = ['Catálogo Megaglass 2026.pdf', 'Ficha técnica vidrio templado.pdf', 'Guía de instalación.pdf'];
const MEETINGS = ['Llamada de 15 minutos', 'Visita técnica (60 min)', 'Presentación de propuesta (30 min)'];
const QUOTES = ['Crear cotización nueva', 'Cotización #1042 — Fachada Cristales Norte', 'Cotización #1039 — Mamparas Hogar Luz'];
const SNIPPETS = ['Horario de atención: L–V 9:00–18:00.', 'Garantía de 10 años en vidrio templado.', 'Plazo habitual de instalación: 3–4 semanas.'];

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
}

function fill(tpl, s) {
  return tpl
    .replace(/{{nombre}}/g, ctx.firstName || ctx.to || '')
    .replace(/{{empresa}}/g, ctx.company || 'tu empresa')
    .replace(/{{remitente}}/g, s.name);
}

function render() {
  const sig = loadSig();
  const sender = SENDERS[ctx.senderIdx || 0];
  const follow = FOLLOW_OPTS.find((o) => o[0] === ctx.followDays) || FOLLOW_OPTS[1];
  const followDate = businessDaysFrom(follow[0]);
  el.className = `compose${collapsed ? ' is-collapsed' : ''}${expanded ? ' is-expanded' : ''}`;
  el.innerHTML = `
    <header class="compose__head" id="compose-head">
      <span class="compose__grip" aria-hidden="true">⋮⋮</span>
      <button class="compose__chev" type="button" data-cm="collapse" aria-label="${collapsed ? 'Desplegar' : 'Contraer'}">${collapsed ? '›' : '⌄'}</button>
      <h2>Correo${collapsed && ctx.subject ? ` <span class="muted">· ${esc(ctx.subject)}</span>` : ''}</h2>
      <span class="compose__tools">
        <button class="icon-btn" type="button" data-cm="expand" aria-label="${expanded ? 'Restaurar tamaño' : 'Ampliar'}">${expanded ? '⤡' : '⛶'}</button>
        <button class="icon-btn" type="button" data-cm="close" aria-label="Cerrar">×</button>
      </span>
    </header>
    <div class="compose__body">
      <nav class="compose__tabs">
        <div class="menu"><button type="button" aria-haspopup="true">Plantillas</button><div class="menu__panel">${TEMPLATES.map((t, i) => `<button class="menu__item" type="button" data-tpl="${i}">${t[0]}</button>`).join('')}<div class="menu__sep"></div><button class="menu__item" type="button" data-cm="manage-tpl">Administrar plantillas</button></div></div>
        <div class="menu"><button type="button" aria-haspopup="true">Secuencias</button><div class="menu__panel">${SEQUENCES.map((s) => `<button class="menu__item" type="button" data-seq="${esc(s)}">${s}</button>`).join('')}</div></div>
        <div class="menu"><button type="button" aria-haspopup="true">Documentos</button><div class="menu__panel">${DOCUMENTS.map((d) => `<button class="menu__item" type="button" data-doc="${esc(d)}">${d}</button>`).join('')}</div></div>
        <div class="menu"><button type="button" aria-haspopup="true">Reuniones <span class="caret"></span></button><div class="menu__panel">${MEETINGS.map((m) => `<button class="menu__item" type="button" data-meet="${esc(m)}">${m}</button>`).join('')}</div></div>
        <div class="menu"><button type="button" aria-haspopup="true">Cotizaciones <span class="caret"></span></button><div class="menu__panel">${QUOTES.map((q) => `<button class="menu__item" type="button" data-quote="${esc(q)}">${q}</button>`).join('')}</div></div>
      </nav>

      <div class="compose__row">
        <label class="compose__lbl" for="cmp-to">Para</label>
        <div class="compose__chips" id="cmp-to-chips">
          ${ctx.recipients.map((r, i) => `<span class="chip-to">${esc(r.name || r.email)} <button type="button" data-rm="${i}" aria-label="Quitar">×</button></span>`).join('')}
          <input id="cmp-to" type="email" placeholder="${ctx.recipients.length ? '' : 'Añadir destinatario'}" aria-label="Añadir destinatario" />
        </div>
      </div>
      <div class="compose__row">
        <span class="compose__lbl">De</span>
        <div class="menu compose__from">
          <button class="compose__frombtn" type="button" aria-haspopup="true">${esc(sender[0])} (${esc(sender[1])} <span class="caret"></span>)</button>
          <div class="menu__panel">${SENDERS.map((s, i) => `<button class="menu__item${i === (ctx.senderIdx || 0) ? ' is-current' : ''}" type="button" data-sender="${i}">${esc(s[0])} (${esc(s[1])})</button>`).join('')}</div>
        </div>
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
        ${signatureHtml(sig)}
        ${ctx.attachments.length ? `<div class="compose__files">${ctx.attachments.map((f, i) => `<span class="chip-to">📎 ${esc(f)} <button type="button" data-rmfile="${i}" aria-label="Quitar">×</button></span>`).join('')}</div>` : ''}
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
        <button type="button" data-cm="link" title="Insertar enlace">🔗</button>
        <button type="button" data-cm="image" title="Insertar imagen">🖼</button>
        <div class="menu"><button type="button" aria-haspopup="true"><strong>Insertar</strong> <span class="caret"></span></button><div class="menu__panel">
          <div class="menu__title">Insertar</div>
          ${SNIPPETS.map((s) => `<button class="menu__item" type="button" data-snippet="${esc(s)}">Fragmento: ${s}</button>`).join('')}
          <button class="menu__item" type="button" data-meet="${esc(MEETINGS[0])}">Enlace de reunión</button>
          <button class="menu__item" type="button" data-doc="${esc(DOCUMENTS[0])}">Documento</button>
          <button class="menu__item" type="button" data-quote="${esc(QUOTES[1])}">Cotización</button>
          <button class="menu__item" type="button" data-cm="video">Vídeo</button>
        </div></div>
        <label class="compose__attach" title="Adjuntar archivo">📎<input type="file" id="cmp-file" multiple hidden /></label>
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
          <button class="pill pill--send" type="button" data-cm="send">Enviar</button>
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
      </footer>
    </div>`;
  wireMenus(el);
  const text = el.querySelector('#cmp-text');
  if (text && !collapsed) {
    text.addEventListener('input', () => {
      ctx.body = text.innerHTML;
      const plain = text.textContent;
      el.querySelector('#cmp-slash').hidden = !(plain.trim() === '/' || plain.endsWith(' /'));
    });
  }
}

function insertHtml(html) {
  const text = el.querySelector('#cmp-text');
  text.focus();
  const plain = text.textContent.trim();
  if (plain === '/') text.innerHTML = '';
  document.execCommand('insertHTML', false, html);
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
  const subject = (el.querySelector('#cmp-subject') || {}).value || ctx.subject || '(sin asunto)';
  const recipients = ctx.recipients.map((r) => r.name || r.email).join(', ');
  if (!ctx.recipients.length) {
    toast('Añade al menos un destinatario');
    return;
  }
  const sender = SENDERS[ctx.senderIdx || 0];
  ctx.onSent?.({ type: 'email', when: Date.now(), who: sender[0], text: `${whenLabel ? `Correo programado (${whenLabel})` : 'Correo enviado'} a ${recipients}: "${subject}".` });
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
  toast(whenLabel ? `Correo programado para ${whenLabel}` : `Correo enviado a ${recipients}`);
  close();
}

function close() {
  el.hidden = true;
  ctx = null;
  collapsed = false;
  expanded = false;
}

function wire() {
  el.addEventListener('click', (e) => {
    const t = e.target;
    const cm = t.closest('[data-cm]');
    if (cm) {
      const a = cm.dataset.cm;
      closeMenus();
      if (a === 'close') close();
      else if (a === 'collapse') { collapsed = !collapsed; render(); }
      else if (a === 'expand') { expanded = !expanded; collapsed = false; render(); }
      else if (a === 'cc') { ctx.showCc = !ctx.showCc; syncFields(); render(); }
      else if (a === 'bcc') { ctx.showBcc = !ctx.showBcc; syncFields(); render(); }
      else if (a === 'send') send();
      else if (a === 'send-later') {
        const when = window.prompt('¿Cuándo quieres enviarlo? (por ejemplo: mañana 9:00)', 'mañana 9:00');
        if (when) send(when);
      } else if (a === 'save-draft') { syncFields(); toast('Borrador guardado'); close(); }
      else if (a === 'link') {
        const url = window.prompt('Dirección del enlace', 'https://');
        if (url) insertHtml(`<a href="${esc(url)}">${esc(url)}</a>`);
      } else if (a === 'image') toast('Arrastra una imagen al cuerpo del correo o usa el clip para adjuntarla.');
      else if (a === 'video') insertHtml('<p>▶ <a href="#">Vídeo: presentación Megaglass</a></p>');
      else if (a === 'manage-tpl') toast('La administración de plantillas estará disponible en la próxima versión.');
      return;
    }
    const tpl = t.closest('[data-tpl]');
    if (tpl) {
      const s = loadSig();
      const [, subj, body] = TEMPLATES[Number(tpl.dataset.tpl)];
      ctx.subject = fill(subj, s);
      ctx.body = fill(body, s);
      closeMenus();
      render();
      toast('Plantilla aplicada');
      return;
    }
    const seq = t.closest('[data-seq]');
    if (seq) { closeMenus(); toast(`${ctx.to} inscrito en la secuencia "${seq.dataset.seq}"`); ctx.onSent?.({ type: 'email', when: Date.now(), who: 'Tú', text: `Inscrito en la secuencia "${seq.dataset.seq}".` }); close(); return; }
    const doc = t.closest('[data-doc]');
    if (doc) { closeMenus(); insertHtml(`<p>📄 <a href="#">${esc(doc.dataset.doc)}</a></p>`); return; }
    const meet = t.closest('[data-meet]');
    if (meet) { closeMenus(); insertHtml(`<p>📅 <a href="#">Reservar: ${esc(meet.dataset.meet)}</a></p>`); return; }
    const quote = t.closest('[data-quote]');
    if (quote) { closeMenus(); insertHtml(`<p>🧾 <a href="#">${esc(quote.dataset.quote)}</a></p>`); return; }
    const snip = t.closest('[data-snippet]');
    if (snip) { closeMenus(); insertHtml(`<p>${esc(snip.dataset.snippet)}</p>`); return; }
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
    if (sender) { ctx.senderIdx = Number(sender.dataset.sender); closeMenus(); syncFields(); render(); return; }
    const ftype = t.closest('[data-ftype]');
    if (ftype) { closeMenus(); syncFields(); ctx.followType = ftype.dataset.ftype; ctx.follow = true; render(); return; }
    const fdays = t.closest('[data-fdays]');
    if (fdays) { closeMenus(); syncFields(); ctx.followDays = Number(fdays.dataset.fdays); ctx.follow = true; render(); return; }
  });
  el.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-assoc]');
    if (cb) { ctx.assoc[Number(cb.dataset.assoc)].on = cb.checked; syncFields(); render(); return; }
    if (e.target.id === 'cmp-follow') ctx.follow = e.target.checked;
    if (e.target.id === 'cmp-file') {
      ctx.attachments.push(...[...e.target.files].map((f) => f.name));
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
  const subj = el.querySelector('#cmp-subject');
  if (subj) ctx.subject = subj.value;
  const text = el.querySelector('#cmp-text');
  if (text) ctx.body = text.innerHTML;
  const cc = el.querySelector('#cmp-cc');
  if (cc) ctx.cc = cc.value;
  const bcc = el.querySelector('#cmp-bcc');
  if (bcc) ctx.bcc = bcc.value;
  const f = el.querySelector('#cmp-follow');
  if (f) ctx.follow = f.checked;
}

export function openCompose(options) {
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
    recipients: options.email ? [{ name: options.to, email: options.email }] : [],
    senderIdx: 0,
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
  collapsed = false;
  expanded = false;
  el.style.left = '';
  el.style.top = '';
  el.style.right = '';
  el.style.bottom = '';
  el.hidden = false;
  render();
  const subj = el.querySelector('#cmp-subject');
  if (subj) subj.focus();
}

export const getSignature = () => loadSig();
export const setSignature = (s) => saveSig({ ...loadSig(), ...s });
export const emailTemplates = () => TEMPLATES.map(([name, subject, body]) => ({ name, subject, body }));

export function editSignature() {
  const s = loadSig();
  const name = window.prompt('Nombre en la firma', s.name);
  if (name === null) return;
  const title = window.prompt('Cargo', s.title) ?? s.title;
  const company = window.prompt('Empresa', s.company) ?? s.company;
  saveSig({ ...s, name, title, company });
  toast('Firma actualizada');
}
