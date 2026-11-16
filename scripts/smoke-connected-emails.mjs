// DOM smoke test for Ajustes › General › Correo (connected e-mail accounts): the accounts table (provider
// logo, inbox type, status, inbox automation, default signature, per-account menu), the Configurar section
// (aliases, signatures, unsubscribe link), the 3-step connection wizard (benefits → e-mail with provider
// detection → provider cards → simulated OAuth consent / generic IMAP form with advanced options and
// simulated verification), deactivate / reconnect / remove, and the composer: connected accounts as "De",
// "enviado desde" in the timeline and the "Conecta tu correo para enviar" notice that opens the wizard.
// Run: node scripts/smoke-connected-emails.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[correo]', ...a);
const fail = (msg) => { console.error(`[correo] FAIL: ${msg}`); process.exit(1); };
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear: () => { Object.keys(mem).forEach((k) => delete mem[k]); } };
function useDom(html, url) {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.history = dom.window.history;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  globalThis.FormData = dom.window.FormData;
  globalThis.FileReader = dom.window.FileReader;
  globalThis.URL = dom.window.URL;
  globalThis.Blob = dom.window.Blob;
  dom.window.confirm = () => true;
  dom.window.prompt = (q, d) => (q.includes('imagen') ? 'https://megaglass.example/logo.png' : q.includes('enlace') ? 'https://megaglass.example' : d);
  return dom;
}
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const $ = (id) => document.getElementById(id);
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const input = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
const change = (el, v) => { if (v !== undefined) el.value = v; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const toastText = () => text($('toast'));

// ===== 1) Settings › General › Correo =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main class="content content--settings" id="settings-root"></main><div id="scrim"></div></body>', 'http://localhost/settings/#prefs-general');
const data = await import(resolve(here, '../src/data.js'));
const E = await import(resolve(here, '../src/connected-emails.js'));
await E.ready;
E.setVerifyDelay(40);
await import(resolve(here, '../src/settings.js'));
click(q('[data-general-tab="correo"]'));
const rows = () => qa('#cem-rows tr[data-account]');
if (E.connectedEmailsLive()) fail('the test must run in local mode (no Supabase env)');
if (!$('cem') || !text($('cem')).includes('Conecta tus cuentas individuales de correo electrónico de trabajo a Omni para registrar, enviar y recibir correos y hacerles seguimiento en el CRM.')) fail('intro text');
const heads = qa('.cem__table thead th').map(text).filter(Boolean);
if (heads.join('|') !== 'Correo|Tipo de bandeja de entrada|Estado|Automatización de la bandeja de entrada|Firma predeterminada') fail(`columns: ${heads.join('|')}`);
if (rows().length !== 1 || !text(rows()[0]).includes(E.userEmail()) || !text(rows()[0]).includes('Tipo de bandeja de entrada: G Suite') || !text(rows()[0].querySelector('.cem__status')).includes('Activado') || !rows()[0].querySelector('.cem__logo--gsuite')) fail(`seed row: ${text(rows()[0])}`);
if (!rows()[0].querySelector('[data-cem-auto]').checked || !rows()[0].querySelector('[data-cem-sig]') || !text(rows()[0].querySelector('[data-cem-sig]')).includes('Valor predeterminado')) fail('automation toggle / signature select');
if (qa('#cem-rows [data-account] .menu__item').map(text).join('|') !== 'Reconectar|Editar firma|Desactivar|Eliminar') fail(`row menu: ${qa('#cem-rows [data-account] .menu__item').map(text).join('|')}`);
if (text(q('[data-cem="connect"]')) !== 'Conectar cuenta de correo' || !q('[data-cem="add-alias"]') || !q('[data-cem="manage-sigs"]') || !$('cem-unsub') || !$('cem-unsub').checked) fail('buttons / Configurar section');
log('pane: intro, table with the seeded G Suite account, menu, Configurar');

// ===== 2) Wizard: intro → e-mail (gmail detection) → manual provider cards → generic IMAP form =====
click(q('[data-cem="connect"]'));
await wait(5);
const wizard = () => $('cem-wizard');
if (!wizard() || !wizard().classList.contains('is-open') || text(q('#cw-title')) !== 'Ahorra tiempo en Omni y en tu bandeja de entrada') fail('wizard step 1');
if (qa('.cw__benefit').length !== 3 || !text(q('.cw__benefits')).includes('Enviar y programar correos desde Omni') || !text(q('.cw__benefits')).includes('Registrar respuestas automáticamente') || !text(q('.cw__benefits')).includes('Sugerir tareas de seguimiento')) fail('benefits');
if (!$('w-auto').checked || text(q('[data-w="to-email"]')) !== 'Conecta tu bandeja de entrada') fail('automation checkbox / CTA');
click(q('[data-w="to-email"]'));
if (text(q('#cw-title')) !== 'Configura tu cuenta de correo' || !$('w-email') || text(q('[data-w="detect"]')) !== 'Siguiente') fail('wizard step 2');
input($('w-email'), 'sin-arroba');
click(q('[data-w="detect"]'));
if (!text($('w-err')).includes('válida')) fail('e-mail validation');
input($('w-email'), 'maria@gmail.com');
click(q('[data-w="detect"]'));
const detect = text(q('.cw__detect'));
if (!detect.includes('Tu correo está alojado por Google') || !detect.includes('Recomendamos conectarse a Gmail') || text(q('[data-w="use"][data-provider="gmail"]')) !== 'Conectarse con Gmail' || !q('[data-w="to-provider"]') || text(q('[data-w="to-provider"]')) !== 'Quiero elegir yo mismo mi proveedor de correo') fail(`gmail detection: ${detect}`);
click(q('[data-w="to-provider"]'));
if (text(q('#cw-title')) !== 'Selecciona tu proveedor de correo' || qa('.cw__provider').map((b) => b.dataset.provider).join() !== 'gmail,outlook,exchange,imap') fail('provider cards');
if (qa('.cw__provider').map(text).join('|') !== 'GGoogle / Gmail|OMicrosoft Outlook|EMicrosoft Exchange|✉Otro proveedor de correo electrónico' || !q('[data-w="help"]') || text(q('[data-w="help"]')) !== '¿No sabes cuál elegir?') fail(`provider labels: ${qa('.cw__provider').map(text).join('|')}`);
click(q('[data-w="help"]'));
if ($('w-help').hidden) fail('help text');
click(q('[data-w="use"][data-provider="imap"]'));
if (text(q('#cw-title')) !== 'Conecta tu bandeja de entrada con Omni CRM' || text(q('.cw__sub')) !== 'Bandeja de entrada genérica' || !text(q('.cw__detect')).includes('maria@gmail.com') || text(q('.cw__detect [data-w="to-email"]')) !== 'Conectar una cuenta diferente' || !text(q('.cw__privacy')).includes('Omni podrá localizar conversaciones relevantes') || text(q('[data-w="to-imap"]')) !== 'Continuar') fail('generic inbox screen');
click(q('[data-w="to-imap"]'));
if ($('w-imap-email').value !== 'maria@gmail.com' || !$('w-imap-pass') || !$('w-adv').hidden || text(q('[data-w="toggle-adv"]')).indexOf('Opciones avanzadas') !== 0) fail('imap form');
click(q('[data-w="toggle-adv"]'));
if ($('w-adv').hidden || !$('w-same').checked || !$('w-user') || $('w-imap-host').value !== 'imap.gmail.com' || $('w-imap-port').value !== '993' || $('w-smtp-host').value !== 'smtp.gmail.com' || $('w-smtp-port').value !== '587' || !$('w-trust') || !text($('w-adv')).includes('Confiar en cualquier certificado') || !text($('w-adv')).includes('El correo saliente usa las mismas credenciales que el correo entrante')) fail('advanced options');
click(q('[data-w="imap-connect"]'));
if (!text($('w-err')).includes('contraseña')) fail('password required');
input($('w-imap-pass'), 'secreta');
input($('w-imap-host'), 'invalid.example');
click(q('[data-w="imap-connect"]'));
if (!q('.cw__verifying') || !text(q('.cw__verifying')).includes('Verificando credenciales...')) fail('verifying spinner');
await wait(120);
if (!text($('w-err')).includes('No se pudo conectar al servidor') || $('w-adv').hidden) fail(`connection error: ${text($('w-err'))}`);
input($('w-imap-pass'), 'secreta');
input($('w-imap-host'), 'imap.gmail.com');
click(q('[data-w="imap-connect"]'));
await wait(120);
if (wizard().classList.contains('is-open')) fail('wizard should close after connecting');
if (rows().length !== 2 || !text(rows()[1]).includes('maria@gmail.com') || !text(rows()[1]).includes('Tipo de bandeja de entrada: IMAP') || !text(rows()[1].querySelector('.cem__status')).includes('Activado')) fail(`imap account row: ${rows().map(text).join(' | ')}`);
if (!toastText().includes('maria@gmail.com conectada')) fail(`toast: ${toastText()}`);
const imapAcc = E.accountByEmail('maria@gmail.com');
if (!imapAcc || imapAcc.provider !== 'imap' || imapAcc.imapHost !== 'imap.gmail.com' || imapAcc.smtpPort !== 587 || imapAcc.status !== 'active') fail('imap account not persisted');
if (!JSON.parse(mem[`crm:connected_emails:${E.userEmail()}`]).some((a) => a.email === 'maria@gmail.com')) fail('account not saved in storage');
log('wizard: benefits, gmail detection, 4 provider cards, generic IMAP form with advanced options, failed then successful verification');

// ===== 3) Wizard: corporate domain detected via MX → simulated Google consent =====
click(q('[data-cem="connect"]'));
await wait(5);
click(q('[data-w="to-email"]'));
input($('w-email'), 'pedro@megaglass.us');
click(q('[data-w="detect"]'));
if (!text(q('.cw__detect')).includes('alojado por Google') || !text(q('.cw__detect')).includes('registros MX de megaglass.us') || text(q('[data-w="use"][data-provider="gsuite"]')) !== 'Conectarse con Google Workspace') fail(`mx detection: ${text(q('.cw__detect'))}`);
click(q('[data-w="use"][data-provider="gsuite"]'));
if (!q('.oauth') || !text(q('.oauth__account')).includes('pedro@megaglass.us') || !text(q('.oauth__perms')).includes('Leer, redactar y enviar correos') || text(q('[data-w="allow"]')) !== 'Permitir' || text(q('.cw .bmodal__foot [data-w="to-provider"]')) !== 'Cancelar') fail('consent screen');
click(q('[data-w="allow"]'));
if (wizard().classList.contains('is-open') || rows().length !== 3 || !text(rows()[2]).includes('pedro@megaglass.us') || !text(rows()[2]).includes('G Suite')) fail('google account connected');
// Outlook detection + manual exchange path
click(q('[data-cem="connect"]'));
await wait(5);
click(q('[data-w="to-email"]'));
input($('w-email'), 'ana@hotmail.com');
click(q('[data-w="detect"]'));
if (!text(q('.cw__detect')).includes('alojado por Microsoft') || !q('[data-w="use"][data-provider="outlook"]')) fail('outlook detection');
click(q('.cw__back'));
input($('w-email'), 'ana@dominio-desconocido.com');
click(q('[data-w="detect"]'));
if (!text(q('.cw__detect')).includes('No pudimos detectar el proveedor') || qa('.cw__provider').length !== 4) fail('unknown domain must offer the provider cards');
click(q('[data-w="close"]'));
log('wizard: MX detection → Google Workspace consent → connected; Outlook detection');

// ===== 4) Configurar: alias, signatures, unsubscribe; per-account automation / signature =====
click(q('[data-cem="add-alias"]'));
input($('cem-alias'), 'no-es-correo');
click(q('[data-cemm="save-alias"]'));
if ($('cem-alias-err').hidden) fail('alias validation');
input($('cem-alias'), 'ventas@megaglass.us');
click(q('[data-cemm="save-alias"]'));
if (!E.aliases().includes('ventas@megaglass.us') || !text($('cem-aliases')).includes('ventas@megaglass.us')) fail('alias added');
click(q('[data-cem="manage-sigs"]'));
if (!$('cem-modal').classList.contains('is-open') || !$('sig-name') || !$('sig-body')) fail('signature manager');
input($('sig-name'), 'Firma corta');
$('sig-body').innerHTML = '<p><b>Fernando Lovera</b> · Megaglass</p>';
click(q('[data-cemm="sig-img-url"]'));
if (!$('sig-body').querySelector('img')) fail('image not inserted');
click(q('[data-cemm="save-sig"]'));
const sig = E.signatures().find((s) => s.name === 'Firma corta');
if (!sig || !sig.html.includes('<img') || !text($('cem-sigs')).includes('Firma corta')) fail('signature saved');
const sel = rows()[0].querySelector('[data-cem-sig]');
if (![...sel.options].some((o) => o.value === sig.id)) fail('signature option missing in the account select');
change(sel, sig.id);
if (E.accountById(rows()[0].dataset.account).signatureId !== sig.id) fail('account signature not saved');
const auto = rows()[1].querySelector('[data-cem-auto]');
auto.checked = false;
change(auto);
if (E.accountById(rows()[1].dataset.account).inboxAutomation !== false) fail('automation toggle');
$('cem-unsub').checked = false;
change($('cem-unsub'));
if (E.unsubscribeLink() !== false) fail('unsubscribe setting');
log('configurar: alias, signature with image assigned to the account, automation toggle, unsubscribe link');

// ===== 5) Desactivar → Reconectar (error de conexión simulado) → Reconectar → Eliminar =====
const imapRow = () => rows().find((r) => r.dataset.account === imapAcc.id);
click(imapRow().querySelector('[data-cem="disable"]'));
if (!text(imapRow().querySelector('.cem__status')).includes('Desactivada') || !imapRow().querySelector('[data-cem-auto]').disabled) fail('deactivate');
click(imapRow().querySelector('[data-cem="reconnect"]'));
if (!text(imapRow().querySelector('.cem__status')).includes('Error de conexión') || !imapRow().querySelector('.cem__status--error')) fail('simulated connection error');
click(imapRow().querySelector('[data-cem="reconnect"]'));
if (!text(imapRow().querySelector('.cem__status')).includes('Activado')) fail('reconnect');
click(imapRow().querySelector('[data-cem="remove"]'));
if (!text($('cem-modal-body')).includes('maria@gmail.com')) fail('remove confirmation');
click(q('[data-cemm="confirm-remove"]'));
if (rows().length !== 2 || E.accountByEmail('maria@gmail.com')) fail('remove');
log('deactivate → error de conexión → reconnected → removed');

// ===== 6) Composer: connected accounts as "De", "enviado desde" in the timeline, no-account notice =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>', 'http://localhost/contacts/record/?id=3');
document.body.dataset.type = 'contacts';
document.execCommand = () => true;
await import(resolve(here, '../src/record.js'));
click(q('.record__quick [data-action="email"]'));
if ($('compose').hidden) fail('composer did not open');
const senders = qa('.compose__from [data-sender]');
if (senders.length !== E.activeAccounts().length || !text(q('.compose__frombtn')).includes(E.userEmail()) || !senders.some((b) => text(b).includes('pedro@megaglass.us')) || !text(senders[0]).includes('G Suite')) fail(`senders: ${senders.map(text).join(' | ')}`);
if (!q('.compose__from [data-cm="connect-email"]')) fail('"Conectar otra cuenta" entry');
if (!$('compose').querySelector('.sig--custom')) fail('the account signature should be the custom one assigned above');
click(senders[1]);
if (!text(q('.compose__frombtn')).includes('pedro@megaglass.us')) fail('sender switch');
click(q('[data-cm="send"]'));
const tl = text($('rec-timeline').firstElementChild);
if ($('compose').hidden !== true) fail('composer should close after sending');
const mail = [...$('rec-timeline').children].map(text).find((t) => t.includes('Correo enviado'));
if (!mail || !mail.includes('enviado desde pedro@megaglass.us')) fail(`timeline: ${mail || tl}`);
E.accounts().forEach((a) => E.disable(a.id));
click(q('.record__quick [data-action="email"]'));
if (!q('.compose__nofrom') || !q('.compose__warn') || text(q('.compose__warn')) !== 'Conecta tu correo para enviar' || q('.compose__from')) fail('no-account state');
click(q('[data-cm="send"]'));
await wait(5);
if (!toastText().includes('Conecta tu correo para enviar') || !$('cem-wizard') || !$('cem-wizard').classList.contains('is-open') || $('compose').hidden) fail('send without account must warn and open the wizard');
click(q('#cem-wizard [data-w="to-email"]'));
input($('w-email'), 'fernando-lovera@megaglass.us');
click(q('[data-w="detect"]'));
click(q('[data-w="use"][data-provider="gsuite"]'));
click(q('[data-w="allow"]'));
if (E.activeAccounts().length !== 1 || !q('.compose__from') || q('.compose__nofrom')) fail('composer should refresh with the reconnected account');
log('composer: senders from connected accounts, "enviado desde", notice + wizard without accounts, refreshed after connecting');

console.log('[correo] OK');
process.exit(0);
