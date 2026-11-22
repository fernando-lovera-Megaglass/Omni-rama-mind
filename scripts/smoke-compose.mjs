// DOM smoke test for the e-mail composer on a contact record. Run: node scripts/smoke-compose.mjs
import assert from 'node:assert/strict';
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

// Deliberately shuffled: recent use takes priority over edits and total use count.
const templateFixtures = [
  { id: 'tpl-old', name: 'Presentación', subject: 'Hola', updatedAt: '2026-01-01' },
  { id: 'tpl-name', name: 'COTización', subject: 'Propuesta para {{contacto.nombre}}', updatedAt: '2026-01-02', lastUsedAt: '2026-02-02', uses: 1 },
  { id: 'tpl-subject', name: 'Propuesta', subject: 'COT para {{contacto.nombre}}', updatedAt: '2026-01-03', lastUsedAt: '2026-02-01', uses: 20 },
  { id: 'tpl-new', name: 'Visita', subject: 'Confirmación', updatedAt: '2026-03-01' },
  { id: 'tpl-thanks', name: 'Gracias', subject: 'Compra', updatedAt: '2026-01-05' },
  { id: 'tpl-follow', name: 'Seguimiento', subject: 'Reunión', updatedAt: '2026-01-04' },
].map((t) => ({ ...t, body: '<p>Hola {{contacto.nombre}}, esta es tu propuesta.</p>', shared: true }));
mem['crm:message_templates'] = JSON.stringify(templateFixtures);
mem['crm:message_template_folders'] = '[]';
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
// Wait for the async panel refresh too: its replacement input must stay wired.
await (await import(resolve(here, '../src/templates-data.js'))).ready;
await Promise.resolve();
const tplIds = () => [...document.querySelectorAll('#cmp-tpl-panel [data-tpl]:not([hidden])')].map((b) => b.dataset.tpl);
assert.deepEqual(tplIds(), ['tpl-name', 'tpl-subject', 'tpl-new', 'tpl-thanks', 'tpl-follow', 'tpl-old']);
click(document.querySelector('#cmp-tpl-panel').previousElementSibling);
const search = document.querySelector('[data-tpl-search]');
click(search);
assert.ok(search.closest('.menu').classList.contains('is-open'));
const filterTemplates = (value) => {
  search.value = value;
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
};
filterTemplates('cot');
assert.deepEqual(tplIds(), ['tpl-name', 'tpl-subject']);
filterTemplates('  CoT  ');
assert.deepEqual(tplIds(), ['tpl-name', 'tpl-subject']);
filterTemplates('<sin coincidencias>');
assert.deepEqual(tplIds(), []);
const noResults = document.querySelector('[data-tpl-no-results]');
assert.equal(noResults.hidden, false);
assert.equal(noResults.textContent, "Sin resultados para '<sin coincidencias>'");
assert.equal(noResults.children.length, 0);
assert.ok(document.querySelector('#cmp-tpl-panel a[href$="templates/"]'));
filterTemplates('');
assert.equal(tplIds().length, 6);
assert.equal(noResults.hidden, true);
filterTemplates('cot');
click(document.querySelector('#cmp-tpl-panel [data-tpl="tpl-name"]'));
const contact = (await import(resolve(here, '../src/data.js'))).allContacts().find((c) => String(c.id) === '3');
const firstName = contact.first || contact.name.split(' ')[0];
assert.equal($('cmp-subject').value, `Propuesta para ${firstName}`);
assert.equal($('cmp-text').textContent, `Hola ${firstName}, esta es tu propuesta.`);
assert.ok(!$('cmp-text').innerHTML.includes('{{'));
// Applying a template rerenders the composer; search must work again.
const rerenderedSearch = document.querySelector('[data-tpl-search]');
rerenderedSearch.value = 'cot';
rerenderedSearch.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
assert.deepEqual(tplIds(), ['tpl-name', 'tpl-subject']);
log('template search: name/subject, empty/reset, ordering and resolved insertion OK');
click(document.querySelector('[data-cm="cc"]'));
log('cc row shown:', Boolean($('cmp-cc')));
click(document.querySelector('[data-doc]'));
log('doc inserted:', $('cmp-text').textContent.includes('.pdf'));
// toolbar: no emoji; «Insertar enlace» / «Insertar imagen» are line icons (svg) like the rest of the bar
const tbText = document.querySelector('.compose__toolbar').textContent;
if (/\p{Extended_Pictographic}/u.test(tbText)) { console.error('[compose] FAIL: emoji left in the toolbar'); process.exit(1); }
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
const tl = $('rec-timeline').querySelector('.timeline__item').textContent.replace(/\s+/g, ' ').trim();
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
const attachmentInput = $('cmp-file');
Object.defineProperty(attachmentInput, 'files', { value: [new window.File(['pdf'], 'simulado.pdf', { type: 'application/pdf' })] });
attachmentInput.dispatchEvent(new window.Event('change', { bubbles: true }));
click(document.querySelector('[data-cm="send"]'));
assert.match($('rec-timeline').textContent, /Simulación.*no se envió ningún correo/);
assert.match($('rec-timeline').textContent, /simulado.pdf · 3 B/);

log('closed after send:', $('compose').hidden, '| timeline first:', $('rec-timeline').querySelector('.timeline__item').textContent.replace(/\s+/g, ' ').trim().slice(0, 110));
log('follow-up task created:', JSON.parse(mem['crm:tasks:extra'] || '[]').length === tasksBefore + 1);
log('OK');
