// DOM smoke test for the e-mail composer on a contact record. Run: node scripts/smoke-compose.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dom = new JSDOM(
  '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>',
  { url: 'http://localhost/contacts/record/?id=3' },
);
const mem = {};
globalThis.window = dom.window;
globalThis.document = dom.window.document;
document.body.dataset.type = 'contacts';
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
globalThis.FormData = dom.window.FormData;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.location = dom.window.location;
globalThis.URL = dom.window.URL;
globalThis.Blob = dom.window.Blob;
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
document.execCommand = (cmd, ui, val) => { if (cmd === 'insertHTML') document.getElementById('cmp-text').insertAdjacentHTML('beforeend', val); return true; };
dom.window.prompt = () => 'https://megaglass.us';

await import(resolve(here, '../src/record.js'));
const $ = (s) => document.getElementById(s);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
const log = (...a) => console.log('[compose]', ...a);

click(document.querySelector('.record__quick [data-action="email"]'));
log('open:', !$('compose').hidden, '| to chips:', document.querySelectorAll('#cmp-to-chips .chip-to').length, '| tabs:', [...document.querySelectorAll('.compose__tabs > .menu > button')].map((b) => b.textContent.trim()).join(' | '));
log('from:', document.querySelector('.compose__frombtn').textContent.trim());
log('signature name:', document.querySelector('.sig__name').textContent, '| cta:', document.querySelector('.sig__cta').textContent);
// Saved message templates (CRM › Plantillas de mensaje) with the contact's data in place of the tokens.
log('templates listed:', document.querySelectorAll('#cmp-tpl-panel [data-tpl]').length, '| manage link:', Boolean(document.querySelector('#cmp-tpl-panel a[href$="templates/"]')));
click(document.querySelector('#cmp-tpl-panel [data-tpl]'));
log('template subject:', $('cmp-subject').value, '| body has text:', $('cmp-text').textContent.length > 20, '| tokens resolved:', !$('cmp-text').innerHTML.includes('{{') && !$('cmp-subject').value.includes('{{'));
click(document.querySelector('[data-cm="cc"]'));
log('cc row shown:', Boolean($('cmp-cc')));
click(document.querySelector('[data-doc]'));
log('doc inserted:', $('cmp-text').textContent.includes('.pdf'));
// toolbar: no emoji; «Insertar enlace» / «Insertar imagen» are line icons (svg) like the rest of the bar
const tbText = document.querySelector('.compose__toolbar').textContent;
if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(tbText)) { console.error('[compose] FAIL: emoji left in the toolbar'); process.exit(1); }
if (!document.querySelector('[data-cm="link"] svg[stroke-width="1.8"]') || !document.querySelector('[data-cm="image"] svg[stroke-width="1.8"]') || document.querySelector('[data-cm="link"]').getAttribute('aria-label') !== 'Insertar enlace') { console.error('[compose] FAIL: link/image buttons must use the shared line icons'); process.exit(1); }
log('toolbar icons: link svg', Boolean(document.querySelector('[data-cm="link"] svg')), '| image svg', Boolean(document.querySelector('[data-cm="image"] svg')), '| no emoji');
click(document.querySelector('[data-cm="link"]'));
log('link inserted:', $('cmp-text').innerHTML.includes('href="https://megaglass.us"'));
click(document.querySelector('[data-fdays="3"]'));
log('follow-up checked:', $('cmp-follow').checked, '| label:', document.querySelector('.compose__follow').textContent.replace(/\s+/g, ' ').trim().slice(0, 90));
log('assoc button:', document.querySelector('.compose__right strong').textContent);
// Secuencias tab: the real sequences from the data layer; choosing one opens the enrolment dialog with the
// steps resolved for this contact; confirming creates the enrolment and the timeline entry.
const check = (cond, msg) => { if (!cond) { console.error(`[compose] FAIL: ${msg}`); process.exit(1); } };
const data = await import(resolve(here, '../src/data.js'));
const S = await import(resolve(here, '../src/sequences-data.js'));
await S.ready;
const c3 = data.allContacts().find((c) => String(c.id) === '3');
const seqItems = [...document.querySelectorAll('#cmp-seq-panel [data-seq]')];
check(seqItems.length === S.sequences().length && seqItems.length > 0, 'Secuencias menu must list the real sequences');
check(Boolean(document.querySelector('#cmp-seq-panel a[href$="sequences/"]')), '"Administrar secuencias" link');
log('sequences listed:', seqItems.map((b) => b.textContent.trim()).join(' / '));
const target = S.sequences().find((s) => s.name.includes('Prospección'));
click(document.querySelector(`#cmp-seq-panel [data-seq="${target.id}"]`));
await new Promise((r) => setTimeout(r, 20));
check($('enr-modal') && $('enr-modal').classList.contains('is-open'), 'enrol dialog did not open');
check($('enr-seq').value === target.id && !$('compose').hidden, 'sequence preselected, composer stays open');
const preview = $('enr-preview').textContent.replace(/\s+/g, ' ');
check(preview.includes(`Hola ${c3.first || c3.name.split(' ')[0]}`) && !preview.includes('{{'), `preview not resolved: ${preview.slice(0, 120)}`);
check(Boolean(document.querySelector('[data-ph="X CONTENT"]')) && $('enr-confirm').disabled && $('enr-date') && $('enr-time'), 'placeholder + start fields');
const ph = document.querySelector('[data-ph="X CONTENT"]');
ph.value = 'fachadas de vidrio';
ph.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
check(!$('enr-confirm').disabled, 'confirm enabled after placeholders');
const enrBefore = S.enrollmentsOfContact(3).length;
click($('enr-confirm'));
check(S.enrollmentsOfContact(3).length === enrBefore + 1 && !$('enr-modal').classList.contains('is-open'), 'enrolment not created');
const tl = $('rec-timeline').firstElementChild.textContent.replace(/\s+/g, ' ').trim();
check(tl.includes('Inscrito en la secuencia') && tl.includes(target.name), `timeline: ${tl.slice(0, 120)}`);
log('enrolled from composer:', target.name, '| timeline:', tl.slice(0, 80));
click(document.querySelector(`#cmp-seq-panel [data-seq="${target.id}"]`));
await new Promise((r) => setTimeout(r, 20));
check($('enr-warn') && $('enr-warn').textContent.includes('ya tiene una inscripción activa') && Boolean($('enr-reenroll')) && $('enr-confirm').disabled, 'already-enrolled warning with Reinscribir');
log('already enrolled → warning + reinscribir offered');
click(document.querySelector('#enr-modal [data-bm="close"]'));
click(document.querySelector('[data-cm="collapse"]'));
log('collapsed:', $('compose').classList.contains('is-collapsed'));
click(document.querySelector('[data-cm="collapse"]'));
click(document.querySelector('[data-cm="expand"]'));
log('expanded:', $('compose').classList.contains('is-expanded'));
const tasksBefore = JSON.parse(mem['crm:tasks:extra'] || '[]').length;
click(document.querySelector('[data-cm="send"]'));
log('closed after send:', $('compose').hidden, '| timeline first:', $('rec-timeline').firstElementChild.textContent.replace(/\s+/g, ' ').trim().slice(0, 110));
log('follow-up task created:', JSON.parse(mem['crm:tasks:extra'] || '[]').length === tasksBefore + 1);
log('OK');
