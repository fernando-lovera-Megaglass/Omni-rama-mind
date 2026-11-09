// DOM smoke test for the settings page.
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const mem = {};
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="settings-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/settings/#data-properties' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
Object.defineProperty(globalThis.localStorage, 'length', { get: () => Object.keys(mem).length });
globalThis.localStorage.key = (i) => Object.keys(mem)[i];
globalThis.location = dom.window.location;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.FormData = dom.window.FormData;
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
dom.window.confirm = () => true;

await import(resolve(here, '../src/settings.js'));
const $ = (s) => document.getElementById(s);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
const log = (...a) => console.log('[settings]', ...a);

log('nav groups:', document.querySelectorAll('.snav__group').length, '| items:', document.querySelectorAll('.snav__item').length, '| parents:', document.querySelectorAll('.snav__parent').length, '| active:', document.querySelector('.snav__item.is-active').textContent, '| rows:', document.querySelectorAll('.spane tbody tr').length);
// General page tabs
location.hash = '#prefs-general';
window.dispatchEvent(new dom.window.Event('hashchange'));
log('general tabs:', [...document.querySelectorAll('.gtabs button')].map((b) => b.textContent).join(' | '), '| fields:', document.querySelectorAll('.gform .gfield').length);
document.getElementById('pf-region').value = 'España';
document.getElementById('pf-region').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
log('format sample:', document.getElementById('pf-sample').textContent);
const pf = document.querySelector('form[data-save="profile"]');
pf.querySelector('[name="first"]').value = 'Fer';
pf.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
log('profile saved:', JSON.parse(mem['crm:profile']).first, JSON.parse(mem['crm:profile']).region);
click(document.querySelector('[data-general-tab="calendario"]'));
log('calendario tab:', document.querySelector('.gh').textContent, '| has time inputs:', document.querySelectorAll('input[type="time"]').length);
// every pane renders
let rendered = 0;
for (const a of [...document.querySelectorAll('.snav__item[href^="#"]')].map((x) => x.getAttribute('href').slice(1))) {
  location.hash = `#${a}`;
  window.dispatchEvent(new dom.window.Event('hashchange'));
  if (document.querySelector('.spane h2')) rendered += 1;
}
log('panes rendered:', rendered);
// collapsible parent + webhook creation
location.hash = '#int-webhooks';
window.dispatchEvent(new dom.window.Event('hashchange'));
log('integraciones parent open:', document.querySelector('[data-parent="account-integrations"]').classList.contains('is-open'));
click(document.querySelector('[data-act="new-webhook"]'));
document.querySelector('#pm-form [name="url"]').value = 'https://megaglass.us/hook';
document.getElementById('pm-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
log('webhooks:', JSON.parse(mem['crm:webhooks']).length);
location.hash = '#data-properties';
window.dispatchEvent(new dom.window.Event('hashchange'));
// create a custom property
click(document.querySelector('[data-act="new-prop"]'));
const form = $('prop-form');
form.querySelector('[name="label"]').value = 'Tipo de vidrio';
form.querySelector('[name="kind"]').value = 'enum';
form.querySelector('[name="kind"]').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
form.querySelector('[name="options"]').value = 'Templado\nLaminado\nDoble';
click($('prop-save'));
log('custom props stored:', JSON.parse(mem['crm:customprops:contacts']).map((p) => `${p.label}:${p.kind}:${(p.options || []).length}`).join(','));
$('props-q').value = 'vidrio';
$('props-q').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
log('search vidrio rows:', [...document.querySelectorAll('.spane tbody tr td:first-child')].map((t) => t.textContent).join(' | '));
// catalog picks it up
const props = await import(resolve(here, '../src/properties.js'));
log('catalog has custom:', props.propertyList('contacts').some((p) => p.label === 'Tipo de vidrio'), '| group:', props.propertyGroups('contacts').slice(-1)[0].title);
// users & teams
location.hash = '#account-users';
window.dispatchEvent(new dom.window.Event('hashchange'));
log('users rows:', document.querySelectorAll('.spane tbody tr').length);
click(document.querySelector('[data-act="new-team"]'));
document.querySelector('#pm-form [name="name"]').value = 'Instaladores';
document.getElementById('pm-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
log('teams stored:', JSON.parse(mem['crm:teams']).map((t) => t.name).join(','));
// pipelines
location.hash = '#obj-deals';
window.dispatchEvent(new dom.window.Event('hashchange'));
log('objects page:', document.querySelector('.spane h2').textContent, '| object:', document.querySelector('[data-objects-object]').value, '| tabs:', [...document.querySelectorAll('.otabs__tabs button')].map((b) => b.textContent).join(' | '), '| ext:', document.querySelector('.otabs__ext').textContent);
log('config sections:', [...document.querySelectorAll('.obody h3')].map((h) => h.textContent).join(' | '), '| amount select:', document.querySelector('[data-objsetting="amountMode"]').value);
click(document.querySelector('[data-objsetting="closeMode"][value="days"]'));
log('close mode days:', JSON.parse(mem['crm:settings:obj-deals']).closeMode, '| period select disabled:', document.querySelector('[data-objsetting="closePeriod"]').disabled);
click(document.querySelector('[data-objects-tab="record"]'));
log('record tab rows:', document.querySelectorAll('.spane tbody tr').length, '| cols:', document.querySelectorAll('.ocols > div').length);
click(document.querySelector('[data-objects-tab="preview"]'));
log('preview cards:', document.querySelectorAll('.opreview__card').length, '| tabs:', document.querySelectorAll('.opreview__tabs span').length);
click(document.querySelector('[data-objects-tab="index"]'));
const bcForm = document.querySelector('form[data-boardcard]');
[...bcForm.querySelectorAll('input[name="k"]')].slice(0, 2).forEach((i) => { i.checked = true; });
bcForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
log('boardcard saved:', JSON.parse(mem['crm:deals:boardcard']).join(','));
// switch object through the selector
const osel = document.querySelector('[data-objects-object]');
osel.value = 'contacts';
osel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
log('switched to contacts:', document.querySelector('.odesc').textContent.slice(0, 40), '| has pipelines tab:', Boolean(document.querySelector('[data-objects-tab="pipelines"]')));
location.hash = '#obj-deals:pipelines';
window.dispatchEvent(new dom.window.Event('hashchange'));
log('deep link pipelines tab active:', document.querySelector('.otabs__tabs button.is-active').textContent);
log('pipelines overview rows:', document.querySelectorAll('.ptable tbody tr').length, '| subtabs:', [...document.querySelectorAll('.ptabs button')].map((b) => b.textContent).join(' | '), '| colour:', document.querySelector('.pcolor.is-active').textContent.trim(), '| calc:', document.querySelector('.pcalc').textContent);
log('first row:', document.querySelector('.ptable tbody tr').textContent.replace(/\s+/g, ' ').trim().slice(0, 120));
// drag a pipeline row with its handle to reorder
{
  const dt = { effectAllowed: '', setData() {}, getData() { return ''; } };
  const ev = (type, target, extra = {}) => { const e = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, ...extra }); Object.defineProperty(e, 'dataTransfer', { value: dt }); target.dispatchEvent(e); };
  const rows = () => [...document.querySelectorAll('[data-dnd="pipes"] tr')].map((r) => r.querySelector('[data-pipe-edit]').textContent);
  const before = rows();
  const src = document.querySelector('[data-dnd="pipes"] tr[data-row="2"]');
  ev('mousedown', src.querySelector('.phandle'));
  ev('dragstart', src);
  const dst = document.querySelector('[data-dnd="pipes"] tr[data-row="0"]');
  ev('dragover', dst);
  ev('drop', dst);
  const after = rows();
  log('dnd pipelines:', before.slice(0, 3).join(' > '), '→', after.slice(0, 3).join(' > '), '| default now:', JSON.parse(mem['crm:pipelines:deals'])[0].name);
  // put it back so the rest of the test keeps its expectations
  const src2 = document.querySelector('[data-dnd="pipes"] tr[data-row="2"]');
  ev('mousedown', src2.querySelector('.phandle'));
  ev('dragstart', src2);
  const dst2 = document.querySelector('[data-dnd="pipes"] tr[data-row="0"]');
  ev('dragover', dst2);
  ev('drop', dst2);
  log('dnd restored:', rows().slice(0, 3).join(' > ') === before.slice(0, 3).join(' > '));
}
click(document.querySelector('[data-stage-color="dot"]'));
log('stage colour stored:', JSON.parse(mem['crm:settings:obj-deals']).stageColor);
$('pipe-q').value = 'saca';
$('pipe-q').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
log('search saca rows:', [...document.querySelectorAll('.ptable tbody [data-pipe-edit]')].map((b) => b.textContent).join(' | '));
$('pipe-q').value = '';
$('pipe-q').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
click(document.querySelector('[data-pipe-edit="0"]'));
const first = document.querySelector('[data-stage-label]');
first.value = 'Primera cita';
document.querySelector('form[data-save="pipeline"]').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
log('pipeline saved:', JSON.parse(mem['crm:pipeline:deals']).appointment.label, '| def label:', JSON.parse(mem['crm:pipelines:deals'])[0].stages[0][1], '| page title:', document.querySelector('.spane h2').textContent.trim(), '| subtabs:', [...document.querySelectorAll('.ptabs--sub button')].map((b) => b.textContent).join(' | '));
log('stage columns:', [...document.querySelectorAll('.ptable--stages thead th')].map((t) => t.textContent.trim()).filter(Boolean).join(' | '), '| prob selects:', document.querySelectorAll('.pprob').length);
click(document.querySelector('[data-act="stage-add"]'));
log('stages after add:', JSON.parse(mem['crm:pipelines:deals'])[0].stages.length, '| rows:', document.querySelectorAll('.peditor tbody tr').length);
click(document.querySelector('[data-stage-move="1"]'));
log('after move first stage:', JSON.parse(mem['crm:pipelines:deals'])[0].stages[0][0]);
// conditional property logic
log('logic cells:', document.querySelectorAll('[data-logic-edit]').length, '| built-in:', [...document.querySelectorAll('.plogic')].map((b) => b.textContent).join(' | '));
click(document.querySelector('[data-logic-edit="qualified"]'));
log('logic editor open:', Boolean(document.querySelector('.logic')), '| title:', document.querySelector('#logic-title').textContent, '| groups:', document.querySelectorAll('.lgroup').length, '| cond:', document.querySelector('.lcond').textContent.replace(/\s+/g, ' ').trim(), '| preview empty:', Boolean(document.querySelector('.lpreview__empty')));
click(document.querySelector('[data-logic-prop-add]'));
document.querySelector('[data-prop-pick]').value = document.querySelector('[data-prop-pick] option').value;
document.querySelector('[data-prop-pick-req]').checked = true;
click(document.querySelector('[data-logic-prop-apply]'));
log('props after add:', document.querySelectorAll('.lprop').length, '| preview fields:', document.querySelectorAll('.lpreview__field').length);
click(document.querySelector('[data-logic-group-add]'));
click(document.querySelector('[data-logic-cond-add="1"]'));
click(document.querySelector('[data-logic-cond-apply="1"]'));
log('groups:', document.querySelectorAll('.lgroup').length, '| conds in group 2:', document.querySelectorAll('.lgroup')[1].querySelectorAll('.lcond:not(.lcond--edit)').length);
const prev = document.querySelector('[data-logic-preview]');
prev.value = 'won';
prev.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
log('preview other stage empty:', Boolean(document.querySelector('.lpreview__empty')));
click(document.querySelector('[data-logic-save]'));
const savedDef = JSON.parse(mem['crm:pipelines:deals'])[0];
log('logic saved:', Object.keys(savedDef.logic).join(','), '| props:', savedDef.logic.qualified.props.length, '| required synced:', (savedDef.required.qualified || []).length, '| editor closed:', !document.querySelector('.logic'), '| cell:', document.querySelector('[data-logic-edit="qualified"]').textContent);
// rules, automation and labels of this pipeline
click(document.querySelector('[data-pipe-sub="rules"]'));
const ruleBox = document.querySelector('[data-pipe-rule="noBack"]');
ruleBox.checked = true;
ruleBox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
log('rule stored:', JSON.parse(mem['crm:pipelines:deals'])[0].rules.noBack, '| rules shown:', document.querySelectorAll('[data-pipe-rule]').length, '| required table rows:', document.querySelectorAll('.spane tbody tr').length);
click(document.querySelector('[data-pipe-sub="automate"]'));
const autoBox = document.querySelector('[data-pipe-auto="task"]');
autoBox.checked = true;
autoBox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
log('automation stored:', JSON.stringify(JSON.parse(mem['crm:pipelines:deals'])[0].automation), '| cards:', document.querySelectorAll('.pauto').length);
click(document.querySelector('[data-pipe-sub="labels"]'));
const plf = document.querySelector('form[data-save="pipelabel"]');
plf.querySelector('[name="label"]').value = 'Distribuidor';
plf.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
log('pipeline labels:', JSON.parse(mem['crm:pipelines:deals'])[0].labelList.join(','));
const psel = document.querySelector('[data-pipe-select]');
psel.value = '1';
psel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
log('switched pipeline:', document.querySelector('.spane h2').textContent.trim());
click(document.querySelector('[data-act="pipe-back"]'));
log('overview rules column:', document.querySelector('.ptable tbody tr').textContent.replace(/\s+/g, ' ').trim().slice(0, 80));
click(document.querySelector('[data-act="new-pipeline"]'));
document.querySelector('#pm-form [name="name"]').value = 'Mantenimiento';
document.getElementById('pm-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
log('pipelines stored:', JSON.parse(mem['crm:pipelines:deals']).slice(-1)[0].name, '| rows:', document.querySelectorAll('.ptable tbody tr').length);
click(document.querySelector('[data-pipe-rm="8"]'));
log('after remove:', JSON.parse(mem['crm:pipelines:deals']).length);
// row actions: description pencil, copy id, access menu
log('row menu items:', [...document.querySelectorAll('[data-dnd="pipes"] tr[data-row="1"] .menu__item')].map((b) => b.textContent).join(' | '), '| headers end:', [...document.querySelectorAll('.ptable thead th')].slice(-2).map((t) => t.textContent.trim()).join(' | '));
click(document.querySelector('[data-pipe-desc="1"]'));
document.querySelector('#pm-form [name="desc"]').value = 'Suministro de vidrio a obra';
document.getElementById('pm-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
log('desc saved:', JSON.parse(mem['crm:pipelines:deals'])[1].desc, '| shown:', document.querySelector('[data-dnd="pipes"] tr[data-row="1"] .pdesccell span').textContent);
click(document.querySelector('[data-pipe-access="1"]'));
document.querySelector('#acc-form [name="mode"][value="teams"]').checked = true;
document.querySelector('#acc-form [name="team"]').checked = true;
click(document.getElementById('acc-save'));
log('access saved:', JSON.stringify(JSON.parse(mem['crm:pipelines:deals'])[1].access), '| lock tag:', Boolean(document.querySelector('[data-dnd="pipes"] tr[data-row="1"] .tag--none')));
log('copy id button:', Boolean(document.querySelector('[data-dnd="pipes"] tr[data-row="1"] [data-copy]')));
click(document.querySelector('[data-pipe-tab="labels"]'));
log('labels tab:', document.querySelector('.obody h3').textContent, '| chips:', document.querySelectorAll('.chip').length);
click(document.querySelector('[data-pipe-tab="overview"]'));
click(document.querySelector('[data-objects-tab="config"]'));
click(document.querySelector('[data-objects-tab="assoc"]'));
const lf = document.querySelector('form[data-save="label"]');
lf.querySelector('[name="label"]').value = 'Instalador';
lf.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
log('assoc labels:', JSON.parse(mem['crm:assoclabels']).join(','));
// signature
location.hash = '#sl-templates';
window.dispatchEvent(new dom.window.Event('hashchange'));
const sf = document.querySelector('form[data-save="signature"]');
sf.querySelector('[name="title"]').value = 'CEO';
sf.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
log('signature title:', JSON.parse(mem['crm:signature']).title);
location.hash = '#data-audit';
window.dispatchEvent(new dom.window.Event('hashchange'));
log('audit pane:', document.querySelector('.spane h2').textContent);
// collapsible settings menu
click(document.querySelector('[data-act="snav-toggle"]'));
log('menu collapsed:', document.querySelector('.settings').classList.contains('is-collapsed'), '| rail:', Boolean(document.querySelector('.snav--rail')), '| items visible:', document.querySelectorAll('.snav__item').length, '| stored:', mem['crm:settings:navcollapsed'], '| tip:', document.querySelector('[data-act="snav-toggle"] .tip__text').textContent);
click(document.querySelector('[data-act="snav-toggle"]'));
log('menu expanded again:', !document.querySelector('.settings').classList.contains('is-collapsed'), '| items:', document.querySelectorAll('.snav__item').length);
log('OK');
