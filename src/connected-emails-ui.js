// Ajustes › General › Correo: the connected-accounts table (provider logo, inbox type, status, inbox
// automation, default signature, per-account actions), the Configurar section (aliases, signatures,
// unsubscribe link) and the three-step connection wizard — benefits → e-mail with provider detection →
// provider cards → simulated OAuth consent or the generic IMAP/SMTP form with advanced options.
import { toast, wireMenus, closeMenus } from './shell.js';
import { ACT_ICONS } from './action-icons.js';
import { ready, accounts, accountById, activeAccounts, connect, disable, reconnect, remove, setAutomation, setAccountSignature, aliases, addAlias, removeAlias, unsubscribeLink, setUnsubscribeLink, signatures, signatureOptions, signatureById, saveSignature, deleteSignature, detectProvider, defaultImap, verifyImap, isEmail, PROVIDERS, STATUS_LABELS, userEmail } from './connected-emails.js';
import { gmailConfigured, configNotice, startConnect, consumeCallbackParams, refreshStatus, gmailAccounts, ready as gmailReady, disconnect as gmailDisconnect, setStatus as gmailSetStatus } from './gmail.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);
const logo = (provider) => { const p = PROVIDERS[provider] || PROVIDERS.imap; return `<span class="cem__logo cem__logo--${esc(provider)}" aria-hidden="true">${p.logo}</span>`; };
export const INTRO = 'Conecta tus cuentas individuales de correo electrónico de trabajo a Omni para registrar, enviar y recibir correos y hacerles seguimiento en el CRM.';

// ---------- settings pane ----------
function rowsHtml() {
  const list = accounts();
  if (!list.length) return '<tr><td colspan="6"><div class="tpls__empty">Todavía no has conectado ninguna cuenta de correo.</div></td></tr>';
  // A real Google account (OAuth, src/gmail.js) shows its badge, its real state (gmail.users.getProfile) and
  // its own actions: Comprobar estado / Desactivar / Desconectar (revokes the token in Google).
  return list.map((a) => `
    <tr data-account="${esc(a.id)}"${a.real ? ' data-real="1"' : ''}>
      <td><div class="cem__mail">${logo(a.provider)}<span><strong>${esc(a.email)}</strong>${a.alias ? `<small class="muted">alias: ${esc(a.alias)}</small>` : ''}</span></div></td>
      <td>Tipo de bandeja de entrada: ${esc((PROVIDERS[a.provider] || PROVIDERS.imap).inbox)}${a.real ? '<span class="cem__badge">Conectada con Google</span>' : ''}</td>
      <td><span class="cem__status cem__status--${esc(a.status)}"${a.lastError ? ` title="${esc(a.lastError)}"` : ''}><span class="cem__dot" aria-hidden="true"></span>${esc(STATUS_LABELS[a.status] || a.status)}</span>${a.real && a.status === 'error' && a.lastError ? `<small class="muted cem__err">${esc(a.lastError)}</small>` : ''}</td>
      <td><label class="switchwrap"><input type="checkbox" class="switch" data-cem-auto="${esc(a.id)}" ${a.inboxAutomation ? 'checked' : ''} ${a.status === 'active' ? '' : 'disabled'} aria-label="Automatización de la bandeja de entrada" /><span>${a.inboxAutomation ? 'Activada' : 'Desactivada'}</span></label></td>
      <td><select class="cem__sig" data-cem-sig="${esc(a.id)}" aria-label="Firma predeterminada">${signatureOptions().map(([id, n]) => `<option value="${esc(id)}" ${a.signatureId === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></td>
      <td><div class="menu cem__menu"><button class="link-btn" type="button" aria-haspopup="true">Acciones <span class="caret"></span></button><div class="menu__panel menu__panel--right">
        ${a.real ? `<button class="menu__item" type="button" data-cem="gmail-status" data-id="${esc(a.id)}">Comprobar estado</button>
        <button class="menu__item" type="button" data-cem="edit-sig" data-id="${esc(a.id)}">Editar firma</button>
        ${a.status === 'disabled' ? `<button class="menu__item" type="button" data-cem="gmail-enable" data-id="${esc(a.id)}">Activar</button>` : `<button class="menu__item" type="button" data-cem="gmail-disable" data-id="${esc(a.id)}">Desactivar</button>`}
        <div class="menu__sep"></div>
        <button class="menu__item menu__item--danger" type="button" data-cem="gmail-disconnect" data-id="${esc(a.id)}">Desconectar</button>` : `<button class="menu__item" type="button" data-cem="reconnect" data-id="${esc(a.id)}">Reconectar</button>
        <button class="menu__item" type="button" data-cem="edit-sig" data-id="${esc(a.id)}">Editar firma</button>
        ${a.status === 'disabled' ? `<button class="menu__item" type="button" data-cem="reconnect" data-id="${esc(a.id)}">Activar</button>` : `<button class="menu__item" type="button" data-cem="disable" data-id="${esc(a.id)}">Desactivar</button>`}
        <div class="menu__sep"></div>
        <button class="menu__item menu__item--danger" type="button" data-cem="remove" data-id="${esc(a.id)}">Eliminar</button>`}
      </div></div></td>
    </tr>`).join('');
}
function innerHtml() {
  const al = aliases();
  const sigs = signatures();
  return `
    <h3 class="gh">Correo</h3>
    <p class="muted">${INTRO}</p>
    <div class="table-wrap"><table class="mini-table stable cem__table"><thead><tr><th>Correo</th><th>Tipo de bandeja de entrada</th><th>Estado</th><th>Automatización de la bandeja de entrada</th><th>Firma predeterminada</th><th></th></tr></thead><tbody id="cem-rows">${rowsHtml()}</tbody></table></div>
    <p><button class="btn btn--primary" type="button" data-cem="connect">Conectar cuenta de correo</button></p>
    <h3 class="gh">Configurar</h3>
    <div class="cem__config">
      <div class="cem__cfg">
        <strong>Alias de correo</strong><p class="muted">Los correos que envíes desde estas direcciones fuera de Omni se asociarán a tu usuario.</p>
        <ul class="cem__list" id="cem-aliases">${al.length ? al.map((e) => `<li><span>${esc(e)}</span><button class="link-btn" type="button" data-cem="remove-alias" data-email="${esc(e)}">Quitar</button></li>`).join('') : '<li class="muted">Sin alias.</li>'}</ul>
        <button class="link-btn" type="button" data-cem="add-alias">Agregar alias de correo</button>
      </div>
      <div class="cem__cfg">
        <strong>Firmas de correo electrónico</strong><p class="muted">Crea firmas con texto enriquecido e imagen. Cada cuenta puede usar la ficha de remitente predeterminada o una firma propia.</p>
        <ul class="cem__list" id="cem-sigs"><li><span>Valor predeterminado (ficha de remitente)</span><a class="link-btn" href="#sl-templates">Editar ficha</a></li>${sigs.map((s) => `<li><span>${esc(s.name)}</span><span><button class="link-btn" type="button" data-cem="edit-signature" data-id="${esc(s.id)}">Editar</button> <button class="link-btn" type="button" data-cem="delete-signature" data-id="${esc(s.id)}">Eliminar</button></span></li>`).join('')}</ul>
        <button class="link-btn" type="button" data-cem="manage-sigs">Gestionar firmas de correo electrónico</button>
      </div>
      <label class="ocheck ocheck--sm cem__unsub"><input type="checkbox" id="cem-unsub" ${unsubscribeLink() ? 'checked' : ''} /><span><strong>Incluir enlace de cancelación de suscripción (Recomendado)</strong><small>Añade al pie de tus correos uno a uno un enlace para dejar de recibir comunicaciones.</small></span></label>
    </div>`;
}
export const paneHtml = () => `<div id="cem" class="cem">${innerHtml()}</div>`;
// Renders the pane inside `container` and wires its events (once per container element).
export function mountConnectedEmails(container) {
  if (!container) return;
  const rerender = () => { container.innerHTML = innerHtml(); wireMenus(container); };
  if (!container.dataset.cemWired) {
    container.dataset.cemWired = '1';
    container.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cem]');
      if (!b) return;
      const a = b.dataset.cem;
      const id = b.dataset.id;
      if (a !== 'add-alias' && a !== 'manage-sigs' && a !== 'connect') closeMenus();
      if (a === 'connect') openConnectWizard({ onConnected: rerender });
      else if (a === 'reconnect') { const r = reconnect(id); rerender(); toast(r && r.ok ? `Cuenta ${r.account.email} conectada de nuevo` : (r && r.error) || 'No se pudo reconectar'); } else if (a === 'disable') { const acc = disable(id); rerender(); toast(`Cuenta ${acc ? acc.email : ''} desactivada`); } else if (a === 'remove') { const acc = accountById(id); openModal('Eliminar cuenta de correo', `<p>¿Seguro que quieres eliminar <strong>${esc(acc ? acc.email : '')}</strong>? Dejarás de enviar y registrar correos desde esta cuenta.</p>`, `<button class="btn btn--primary tpls__danger" type="button" data-cemm="confirm-remove" data-id="${esc(id)}">Eliminar</button><button class="btn btn--secondary" type="button" data-bm="close">Cancelar</button>`, { onAction: (act) => { if (act === 'confirm-remove') { remove(id); closeModal(); rerender(); toast('Cuenta eliminada'); } } }); } else if (a === 'edit-sig') openSignatureManager({ accountId: id, onChange: rerender });
      else if (a === 'manage-sigs') openSignatureManager({ onChange: rerender });
      else if (a === 'edit-signature') openSignatureManager({ signatureId: id, onChange: rerender });
      else if (a === 'delete-signature') { deleteSignature(id); rerender(); toast('Firma eliminada'); } else if (a === 'add-alias') openModal('Agregar alias de correo', '<p class="muted">Los correos enviados desde el alias fuera de Omni se asociarán a tu usuario.</p><label class="field"><span>Dirección de correo</span><input id="cem-alias" type="email" placeholder="nombre@empresa.com" /></label><div class="snp__error" id="cem-alias-err" hidden></div>', '<button class="btn btn--primary" type="button" data-cemm="save-alias">Agregar</button><button class="btn btn--secondary" type="button" data-bm="close">Cancelar</button>', { onAction: (act) => { if (act === 'save-alias') { const v = $('cem-alias').value; if (!isEmail(v)) { const err = $('cem-alias-err'); err.textContent = 'Escribe una dirección de correo válida.'; err.hidden = false; return; } addAlias(v); closeModal(); rerender(); toast(`Alias ${v.trim().toLowerCase()} agregado`); } } });
      else if (a === 'remove-alias') { removeAlias(b.dataset.email); rerender(); toast('Alias quitado'); }
      else if (a === 'gmail-status') { toast('Comprobando la cuenta con Google…'); refreshStatus().then((list) => { rerender(); const acc = list.find((x) => x.id === id); toast(acc && acc.status === 'active' ? `Cuenta ${acc.email} activa en Google` : `Error de conexión: ${(acc && acc.lastError) || 'sin detalles'}`); }).catch((e2) => toast(`No se pudo comprobar la cuenta: ${e2.message}`)); }
      else if (a === 'gmail-disable' || a === 'gmail-enable') { gmailSetStatus(id, a === 'gmail-disable' ? 'disable' : 'enable').then((acc) => { rerender(); toast(a === 'gmail-disable' ? `Cuenta ${acc ? acc.email : ''} desactivada` : acc && acc.status === 'active' ? `Cuenta ${acc.email} activada` : `No se pudo activar: ${(acc && acc.lastError) || 'error'}`); }).catch((e2) => toast(`No se pudo cambiar la cuenta: ${e2.message}`)); }
      else if (a === 'gmail-disconnect') { const acc = accountById(id); openModal('Desconectar cuenta de Google', `<p>¿Seguro que quieres desconectar <strong>${esc(acc ? acc.email : '')}</strong>? Omni revocará el acceso en Google y borrará los tokens y los correos sincronizados de esta cuenta.</p>`, `<button class="btn btn--primary tpls__danger" type="button" data-cemm="confirm-disconnect" data-id="${esc(id)}">Desconectar</button><button class="btn btn--secondary" type="button" data-bm="close">Cancelar</button>`, { onAction: (act) => { if (act === 'confirm-disconnect') { closeModal(); gmailDisconnect(id).then(() => { rerender(); toast('Cuenta de Google desconectada'); }).catch((e2) => toast(`No se pudo desconectar: ${e2.message}`)); } } }); }
    });
    // The real accounts change from the OAuth module (status check, disconnect): keep the table in sync.
    document.addEventListener('crm:gmail', () => { if (container.isConnected) rerender(); });
    container.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.cemAuto) { setAutomation(t.dataset.cemAuto, t.checked); const lbl = t.nextElementSibling; if (lbl) lbl.textContent = t.checked ? 'Activada' : 'Desactivada'; toast(t.checked ? 'Automatización de la bandeja de entrada activada' : 'Automatización de la bandeja de entrada desactivada'); } else if (t.dataset.cemSig) { setAccountSignature(t.dataset.cemSig, t.value); toast('Firma predeterminada actualizada'); } else if (t.id === 'cem-unsub') { setUnsubscribeLink(t.checked); toast(t.checked ? 'Se incluirá el enlace de cancelación de suscripción' : 'No se incluirá el enlace de cancelación de suscripción'); }
    });
  }
  wireMenus(container);
  // Back from Google's consent screen: the result travels in ?gmail=connected|error (consumed once).
  if (!callbackHandled) {
    callbackHandled = true;
    const cb = consumeCallbackParams();
    if (cb) toast(cb.status === 'connected' ? `Cuenta ${cb.email} conectada con Google` : `Google no completó la conexión: ${cb.reason || 'error'}`);
  }
  // The real state of the Google accounts (gmail.users.getProfile through the Edge Function), once per page load.
  gmailReady.then(() => {
    if (!container.isConnected) return;
    if (gmailAccounts().length && !statusChecked) { statusChecked = true; refreshStatus().then(() => { if (container.isConnected) rerender(); }).catch((e) => console.warn('[gmail] no se pudo comprobar el estado:', e.message)); }
  });
}
let callbackHandled = false;
let statusChecked = false;

// ---------- generic modal ----------
let modalAction = null;
function openModal(title, body, foot, { onAction = null, size = '' } = {}) {
  let m = $('cem-modal');
  if (!m) {
    m = document.createElement('div');
    m.className = 'bmodal bmodal--top';
    m.id = 'cem-modal';
    document.body.appendChild(m);
    m.addEventListener('click', (e) => { if (e.target.closest('[data-bm="close"]')) { e.preventDefault(); closeModal(); return; } const b = e.target.closest('[data-cemm]'); if (b && modalAction) modalAction(b.dataset.cemm, b); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.classList.contains('is-open')) closeModal(); });
  }
  modalAction = onAction;
  m.innerHTML = `<div class="bmodal__scrim" data-bm="close"></div><div class="bmodal__panel${size ? ` bmodal__panel--${size}` : ''}" role="dialog" aria-modal="true" aria-labelledby="cem-modal-title"><div class="bmodal__head"><h3 id="cem-modal-title">${esc(title)}</h3><button class="bmodal__close" type="button" data-bm="close" aria-label="Cerrar">×</button></div><div class="bmodal__body" id="cem-modal-body">${body}</div><div class="bmodal__foot" id="cem-modal-foot">${foot}</div></div>`;
  m.classList.add('is-open');
  m.setAttribute('aria-hidden', 'false');
  const first = m.querySelector('input, select, [contenteditable]');
  if (first) first.focus();
  return m;
}
function closeModal() { const m = $('cem-modal'); if (m) { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); } modalAction = null; }

// ---------- signatures (rich text + image) ----------
export function openSignatureManager({ accountId = null, signatureId = null, onChange = null } = {}) {
  const acc = accountId ? accountById(accountId) : null;
  const editing = signatureId ? signatureById(signatureId) : acc && acc.signatureId !== 'default' ? signatureById(acc.signatureId) : null;
  const list = signatures();
  const listHtml = `<div class="sigm__list">${list.length ? list.map((s) => `<button class="sigm__item${editing && editing.id === s.id ? ' is-active' : ''}" type="button" data-cemm="open-sig" data-id="${esc(s.id)}">${esc(s.name)}</button>`).join('') : '<p class="muted">Todavía no tienes firmas propias.</p>'}<button class="link-btn" type="button" data-cemm="new-sig">+ Nueva firma</button>${acc ? `<p class="muted sigm__hint">Cuenta: <strong>${esc(acc.email)}</strong>. La firma que guardes se asignará a esta cuenta.</p>` : ''}<p class="muted sigm__hint">La ficha de remitente predeterminada se edita en <a href="#sl-templates">Ventas › Plantillas y firma</a>.</p></div>`;
  const editorHtml = `<div class="sigm__editor">
    <label class="field"><span>Nombre de la firma</span><input id="sig-name" value="${esc(editing ? editing.name : '')}" placeholder="P. ej. Firma corta" /></label>
    <div class="tpe__field"><span>Firma</span>
      <div class="tpe__toolbar" role="toolbar" aria-label="Formato"><button type="button" data-sigfmt="bold"><b>N</b></button><button type="button" data-sigfmt="italic"><i>C</i></button><button type="button" data-sigfmt="underline"><u>S</u></button><button type="button" data-cemm="sig-link">${ACT_ICONS.link} Enlace</button><label class="sigm__img">${ACT_ICONS.image} Imagen<input type="file" id="sig-img" accept="image/*" hidden /></label><button type="button" data-cemm="sig-img-url">Imagen por URL</button></div>
      <div class="tpe__body sigm__body" id="sig-body" contenteditable="true" data-placeholder="Escribe tu firma…">${editing ? editing.html : ''}</div>
    </div>
    <div class="snp__error" id="sig-err" hidden></div>
  </div>`;
  openModal(editing ? 'Editar firma' : 'Gestionar firmas de correo electrónico', `<div class="sigm">${listHtml}${editorHtml}</div>`, `<button class="btn btn--primary" type="button" data-cemm="save-sig" data-id="${esc(editing ? editing.id : '')}">Guardar firma</button>${editing ? `<button class="btn btn--secondary" type="button" data-cemm="delete-sig" data-id="${esc(editing.id)}">Eliminar</button>` : ''}<button class="btn btn--secondary" type="button" data-bm="close">Cerrar</button>`, {
    size: 'wide',
    onAction: (act, b) => {
      const body = $('sig-body');
      if (act === 'open-sig') { openSignatureManager({ accountId, signatureId: b.dataset.id, onChange }); return; }
      if (act === 'new-sig') { openSignatureManager({ accountId, onChange }); return; }
      if (act === 'sig-link') { const url = window.prompt('URL del enlace', 'https://'); if (url) { body.focus(); body.insertAdjacentHTML('beforeend', ` <a href="${esc(url)}">${esc(url)}</a>`); } return; }
      if (act === 'sig-img-url') { const url = window.prompt('URL de la imagen', 'https://'); if (url) body.insertAdjacentHTML('beforeend', `<img src="${esc(url)}" alt="" style="max-height:80px">`); return; }
      if (act === 'delete-sig') { deleteSignature(b.dataset.id); closeModal(); if (onChange) onChange(); toast('Firma eliminada'); return; }
      if (act === 'save-sig') {
        const name = $('sig-name').value.trim();
        const html = body.innerHTML.trim();
        const err = $('sig-err');
        if (!name || !body.textContent.trim() && !body.querySelector('img')) { err.textContent = 'Escribe un nombre y el contenido de la firma.'; err.hidden = false; return; }
        const s = saveSignature({ id: b.dataset.id || undefined, name, html });
        if (acc) setAccountSignature(acc.id, s.id);
        closeModal();
        if (onChange) onChange();
        toast(`Firma «${s.name}» guardada${acc ? ` y asignada a ${acc.email}` : ''}`);
      }
    },
  });
  const m = $('cem-modal');
  m.querySelectorAll('[data-sigfmt]').forEach((btn) => btn.addEventListener('click', () => { const body = $('sig-body'); body.focus(); if (typeof document.execCommand === 'function') { try { document.execCommand(btn.dataset.sigfmt, false); } catch { /* ignore */ } } }));
  const file = $('sig-img');
  if (file) file.addEventListener('change', () => { const f = file.files && file.files[0]; if (!f || typeof FileReader === 'undefined') return; const r = new FileReader(); r.onload = () => { $('sig-body').insertAdjacentHTML('beforeend', `<img src="${r.result}" alt="" style="max-height:80px">`); }; r.readAsDataURL(f); });
}

// ---------- connection wizard ----------
let wiz = null;
const BENEFITS = [['✉', 'Enviar y programar correos desde Omni', 'Redacta en la ficha del contacto y envía desde tu propia cuenta.'], ['↩', 'Registrar respuestas automáticamente', 'Las respuestas de tus contactos aparecen en la cronología sin hacer nada.'], ['☑', 'Sugerir tareas de seguimiento', 'Omni propone la siguiente tarea cuando una conversación se enfría.']];
export async function openConnectWizard({ email = '', onConnected = null } = {}) {
  await ready;
  wiz = { step: 'intro', email, automation: true, provider: null, detect: null, error: '', onConnected, adv: false };
  let m = $('cem-wizard');
  if (!m) {
    m = document.createElement('div');
    m.className = 'bmodal cw-modal';
    m.id = 'cem-wizard';
    document.body.appendChild(m);
    m.addEventListener('click', onWizardClick);
    m.addEventListener('input', (e) => { if (!wiz) return; const t = e.target; if (t.id === 'w-email') wiz.email = t.value; if (t.id === 'w-imap-email') wiz.email = t.value; });
    m.addEventListener('change', (e) => { if (!wiz) return; const t = e.target; if (t.id === 'w-auto') wiz.automation = t.checked; });
    m.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'w-email') { e.preventDefault(); detect(); } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.classList.contains('is-open')) closeWizard(); });
  }
  m.classList.add('is-open');
  m.setAttribute('aria-hidden', 'false');
  renderWizard();
  return m;
}
export function closeWizard() { const m = $('cem-wizard'); if (m) { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); } wiz = null; }
export const wizardStep = () => (wiz ? wiz.step : null);
const panel = (title, body, foot = '', { wide = false, back = null } = {}) => `<div class="bmodal__scrim" data-w="close"></div><div class="bmodal__panel${wide ? ' bmodal__panel--wide' : ''} cw" role="dialog" aria-modal="true" aria-labelledby="cw-title"><div class="bmodal__head">${back ? `<button class="cw__back" type="button" data-w="${back}" aria-label="Volver">‹</button>` : ''}<h3 id="cw-title">${title}</h3><button class="bmodal__close" type="button" data-w="close" aria-label="Cerrar">×</button></div><div class="bmodal__body cw__body">${body}</div>${foot ? `<div class="bmodal__foot">${foot}</div>` : ''}</div>`;
const providerCards = () => `<div class="cw__providers">${['gmail', 'outlook', 'exchange', 'imap'].map((k) => `<button class="cw__provider" type="button" data-w="use" data-provider="${k}">${logo(k)}<strong>${esc(PROVIDERS[k].label)}</strong></button>`).join('')}</div><p class="cw__help"><button class="link-btn" type="button" data-w="help">¿No sabes cuál elegir?</button></p><p class="muted cw__helptext" id="w-help" hidden>Si entras a tu correo en gmail.com o tu empresa usa Google Workspace, elige Google. Si usas Outlook.com, Hotmail o Microsoft 365, elige Outlook; Exchange es para servidores Microsoft propios. Para cualquier otro servicio (IONOS, GoDaddy, Zoho, cPanel…), elige «Otro proveedor».</p>`;
function renderWizard() {
  const m = $('cem-wizard');
  if (!m || !wiz) return;
  const s = wiz.step;
  const err = wiz.error ? `<div class="snp__error" id="w-err" role="alert">${esc(wiz.error)}</div>` : '<div class="snp__error" id="w-err" hidden></div>';
  if (s === 'intro') {
    m.innerHTML = panel('Ahorra tiempo en Omni y en tu bandeja de entrada', `<ul class="cw__benefits">${BENEFITS.map(([i, t, d]) => `<li class="cw__benefit"><span class="cw__bico" aria-hidden="true">${i}</span><span><strong>${t}</strong><small class="muted">${d}</small></span></li>`).join('')}</ul><label class="ocheck ocheck--sm"><input type="checkbox" id="w-auto" ${wiz.automation ? 'checked' : ''} /><span><strong>Activar la automatización de la bandeja de entrada</strong><small>Registra las respuestas y sugiere tareas de seguimiento.</small></span></label>`, '<button class="btn btn--primary" type="button" data-w="to-email">Conecta tu bandeja de entrada</button><button class="btn btn--secondary" type="button" data-w="close">Ahora no</button>');
  } else if (s === 'email') {
    m.innerHTML = panel('Configura tu cuenta de correo', `<p class="muted">Escribe la dirección de la cuenta que quieres conectar; detectaremos el proveedor por su dominio.</p><label class="field"><span>Dirección de correo electrónico</span><input id="w-email" type="email" value="${esc(wiz.email)}" placeholder="tu@empresa.com" autocomplete="off" /></label>${err}`, '<button class="btn btn--primary" type="button" data-w="detect">Siguiente</button><button class="btn btn--secondary" type="button" data-w="to-intro">Atrás</button>', { back: 'to-intro' });
    $('w-email').focus();
  } else if (s === 'detect') {
    const d = wiz.detect;
    const p = d && d.provider ? PROVIDERS[d.provider] : null;
    m.innerHTML = panel('Configura tu cuenta de correo', p
      ? `<div class="cw__detect">${logo(d.provider)}<div><p><strong>Tu correo está alojado por ${esc(p.hosted)}.</strong> Recomendamos conectarse a ${esc(p.short)}.</p><p class="muted">${d.viaMx ? `Lo detectamos en los registros MX de <strong>${esc(d.domain)}</strong>.` : `Las cuentas de ${esc(d.domain)} se conectan con ${esc(p.short)}.`}</p></div></div>`
      : `<div class="cw__detect">${logo('imap')}<div><p><strong>No pudimos detectar el proveedor de ${esc(d ? d.domain : '')}.</strong></p><p class="muted">Elige tu proveedor de correo a continuación.</p></div></div>${providerCards()}`,
    `${p ? `<button class="btn btn--primary" type="button" data-w="use" data-provider="${esc(d.provider)}">Conectarse con ${esc(p.short)}</button>` : ''}<button class="link-btn" type="button" data-w="to-provider">Quiero elegir yo mismo mi proveedor de correo</button>`, { back: 'to-email' });
  } else if (s === 'provider') {
    m.innerHTML = panel('Selecciona tu proveedor de correo', `<p class="muted">Cuenta: <strong>${esc(wiz.email)}</strong></p>${providerCards()}`, '<button class="btn btn--secondary" type="button" data-w="to-email">Atrás</button>', { wide: true, back: 'to-email' });
  } else if (s === 'consent') {
    const p = PROVIDERS[wiz.provider];
    if (p.hosted === 'Google') { renderGoogleConsent(m, p, err); return; }
    m.innerHTML = panel(`Iniciar sesión con ${esc(p.hosted)}`, `<div class="oauth oauth--${esc(wiz.provider)}"><div class="oauth__head">${logo(wiz.provider)}<span>${esc(p.hosted)}</span></div><p class="oauth__account">${esc(wiz.email)}</p><h4>Omni CRM quiere acceder a tu cuenta de ${esc(p.hosted)}</h4><p class="muted">Esto permitirá a Omni CRM:</p><ul class="oauth__perms"><li>Leer, redactar y enviar correos</li><li>Ver la información básica de tu perfil</li></ul><p class="muted oauth__fine">Puedes revocar el acceso cuando quieras desde la configuración de tu cuenta de ${esc(p.hosted)}. Esta pantalla es una simulación: no se envían credenciales.</p></div>`, '<button class="btn btn--primary" type="button" data-w="allow">Permitir</button><button class="btn btn--secondary" type="button" data-w="to-provider">Cancelar</button>', { back: 'to-provider' });
  } else if (s === 'generic') {
    m.innerHTML = panel('Conecta tu bandeja de entrada con Omni CRM', `<p class="cw__sub">Bandeja de entrada genérica</p><div class="cw__detect">${logo('imap')}<div><p><strong>${esc(wiz.email)}</strong></p><button class="link-btn" type="button" data-w="to-email">Conectar una cuenta diferente</button></div></div><p class="muted cw__privacy">Omni podrá localizar conversaciones relevantes en tu bandeja de entrada para registrarlas en el CRM, enviar correos en tu nombre y sugerir seguimientos. Nunca leerá correos sin relación con tus contactos ni compartirá tus credenciales; se almacenan cifradas y puedes desconectar la cuenta cuando quieras.</p>`, '<button class="btn btn--primary" type="button" data-w="to-imap">Continuar</button><button class="btn btn--secondary" type="button" data-w="to-provider">Atrás</button>', { back: 'to-provider' });
  } else if (s === 'imap') {
    const d = defaultImap(wiz.email);
    m.innerHTML = panel('Conecta tu bandeja de entrada con Omni CRM', `<p class="cw__sub">Bandeja de entrada genérica (IMAP/SMTP)</p>
      <label class="field"><span>Dirección de correo electrónico <abbr class="snp__req" title="Obligatorio">*</abbr></span><input id="w-imap-email" type="email" value="${esc(wiz.email)}" /></label>
      <label class="field"><span>Contraseña <abbr class="snp__req" title="Obligatorio">*</abbr></span><input id="w-imap-pass" type="password" autocomplete="new-password" /></label>
      <button class="link-btn cw__advbtn" type="button" data-w="toggle-adv" aria-expanded="${wiz.adv}">Opciones avanzadas ${wiz.adv ? '⌄' : '›'}</button>
      <div class="cw__adv" id="w-adv" ${wiz.adv ? '' : 'hidden'}>
        <label class="ocheck ocheck--sm"><input type="checkbox" id="w-same" checked /><span><strong>El correo saliente usa las mismas credenciales que el correo entrante</strong></span></label>
        <label class="field"><span>Nombre de usuario (Opcional)</span><input id="w-user" placeholder="Si es distinto de la dirección de correo" /></label>
        <div class="cw__grid"><strong class="cw__gh">Correo entrante (IMAP)</strong><label class="field"><span>Servidor</span><input id="w-imap-host" value="${esc(d.imapHost)}" /></label><label class="field cw__port"><span>Puerto</span><input id="w-imap-port" type="number" value="${d.imapPort}" /></label></div>
        <div class="cw__grid"><strong class="cw__gh">Correo saliente (SMTP)</strong><label class="field"><span>Servidor</span><input id="w-smtp-host" value="${esc(d.smtpHost)}" /></label><label class="field cw__port"><span>Puerto</span><input id="w-smtp-port" type="number" value="${d.smtpPort}" /></label></div>
        <strong class="cw__gh">Seguridad del servidor</strong><label class="ocheck ocheck--sm"><input type="checkbox" id="w-trust" /><span><strong>Confiar en cualquier certificado</strong><small>Solo si tu servidor usa un certificado autofirmado.</small></span></label>
      </div>${err}`, '<button class="btn btn--primary" type="button" data-w="imap-connect">Conectar bandeja de entrada</button><button class="btn btn--secondary" type="button" data-w="to-generic">Atrás</button>', { wide: true, back: 'to-generic' });
  } else if (s === 'verifying') {
    m.innerHTML = panel('Conecta tu bandeja de entrada con Omni CRM', '<div class="cw__verifying"><span class="cw__spinner" aria-hidden="true"></span><p>Verificando credenciales...</p><p class="muted">Comprobamos el acceso IMAP y SMTP con los datos indicados.</p></div>');
  }
}
// Google: the real OAuth flow when the credentials exist (VITE_GOOGLE_CLIENT_ID + Supabase); otherwise a clear
// notice of what is missing, with the simulated account still available for the demo.
function renderGoogleConsent(m, p, err) {
  const perms = '<ul class="oauth__perms"><li>Leer, redactar y enviar correos</li><li>Ver la información básica de tu perfil</li></ul>';
  const head = `<div class="oauth__head">${logo(wiz.provider)}<span>Google</span></div><p class="oauth__account">${esc(wiz.email)}</p>`;
  if (gmailConfigured()) {
    m.innerHTML = panel('Iniciar sesión con Google', `<div class="oauth oauth--${esc(wiz.provider)}">${head}<h4>Omni CRM quiere acceder a tu cuenta de Google</h4><p class="muted">Te llevaremos a Google para autorizar a Omni; al terminar volverás a esta página con la cuenta conectada. Esto permitirá a Omni CRM:</p>${perms}<p class="muted oauth__fine">Permisos solicitados: gmail.send, gmail.readonly y userinfo.email. Puedes revocar el acceso cuando quieras desde la configuración de tu cuenta de Google.</p>${err}</div>`, '<button class="btn btn--primary" type="button" data-w="google-oauth">Continuar con Google</button><button class="btn btn--secondary" type="button" data-w="to-provider">Cancelar</button>', { back: 'to-provider' });
    return;
  }
  m.innerHTML = panel('Iniciar sesión con Google', `<div class="oauth oauth--${esc(wiz.provider)}">${head}<div class="cw__notice" role="alert" id="w-google-missing"><strong>Falta configurar las credenciales de Google.</strong><p>${esc(configNotice())}</p></div><h4>Omni CRM quiere acceder a tu cuenta de Google</h4>${perms}<p class="muted oauth__fine">Mientras tanto puedes conectar una cuenta simulada para probar el CRM: no se envían credenciales ni correos reales.</p></div>`, '<button class="btn btn--primary" type="button" disabled title="Configura VITE_GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET (docs/gmail-setup.md)">Continuar con Google</button><button class="btn btn--secondary" type="button" data-w="allow">Usar cuenta simulada (demo)</button><button class="link-btn" type="button" data-w="to-provider">Cancelar</button>', { back: 'to-provider' });
}
async function detect() {
  const v = String(wiz.email || '').trim();
  if (!isEmail(v)) { wiz.error = 'Escribe una dirección de correo válida.'; renderWizard(); return; }
  wiz.email = v.toLowerCase(); wiz.error = ''; wiz.detect = detectProvider(wiz.email); wiz.step = 'detect';
  renderWizard();
}
function finish(account) {
  const cb = wiz.onConnected;
  closeWizard();
  toast(`Cuenta ${account.email} conectada`);
  if (cb) cb(account);
}
async function onWizardClick(e) {
  const b = e.target.closest('[data-w]');
  if (!b || !wiz) return;
  const a = b.dataset.w;
  if (a === 'close') { closeWizard(); return; }
  if (a === 'to-intro') { wiz.step = 'intro'; wiz.error = ''; renderWizard(); } else if (a === 'to-email') { wiz.step = 'email'; wiz.error = ''; renderWizard(); } else if (a === 'detect') detect();
  else if (a === 'to-provider') { wiz.step = 'provider'; wiz.error = ''; renderWizard(); } else if (a === 'help') { const h = $('w-help'); if (h) h.hidden = !h.hidden; } else if (a === 'use') { wiz.provider = b.dataset.provider; wiz.error = ''; if (PROVIDERS[wiz.provider].oauth) { wiz.step = 'consent'; } else { wiz.step = 'generic'; } renderWizard(); } else if (a === 'google-oauth') { b.disabled = true; b.textContent = 'Abriendo Google…'; try { await startConnect({ returnTo: location.href, email: wiz.email }); } catch (e2) { if (wiz) { wiz.error = e2.message; renderWizard(); } } } else if (a === 'allow') { const acc = connect({ email: wiz.email, provider: wiz.provider, inboxAutomation: wiz.automation }); if (acc) finish(acc); } else if (a === 'to-generic') { wiz.step = 'generic'; wiz.error = ''; renderWizard(); } else if (a === 'to-imap') { wiz.step = 'imap'; wiz.error = ''; renderWizard(); $('w-imap-pass').focus(); } else if (a === 'toggle-adv') { wiz.adv = !wiz.adv; const adv = $('w-adv'); if (adv) { adv.hidden = !wiz.adv; b.setAttribute('aria-expanded', String(wiz.adv)); b.textContent = `Opciones avanzadas ${wiz.adv ? '⌄' : '›'}`; } } else if (a === 'imap-connect') {
    const form = { email: $('w-imap-email').value.trim().toLowerCase(), password: $('w-imap-pass').value, username: $('w-user').value.trim() || null, imapHost: $('w-imap-host').value.trim(), imapPort: Number($('w-imap-port').value), smtpHost: $('w-smtp-host').value.trim(), smtpPort: Number($('w-smtp-port').value), sameCredentials: $('w-same').checked, trustAny: $('w-trust').checked };
    if (!isEmail(form.email)) { wiz.error = 'Escribe una dirección de correo válida.'; renderWizard(); return; }
    if (!form.password) { wiz.error = 'Escribe la contraseña de la cuenta.'; renderWizard(); $('w-imap-pass').focus(); return; }
    wiz.email = form.email; wiz.form = form; wiz.step = 'verifying'; wiz.error = '';
    renderWizard();
    const r = await verifyImap(form);
    if (!wiz) return;
    if (!r.ok) { wiz.step = 'imap'; wiz.error = r.error; wiz.adv = true; renderWizard(); return; }
    const acc = connect({ email: form.email, provider: 'imap', inboxAutomation: wiz.automation, imapHost: form.imapHost, imapPort: form.imapPort, smtpHost: form.smtpHost, smtpPort: form.smtpPort, username: form.username });
    if (acc) finish(acc);
  }
}
export { activeAccounts, userEmail };
