// Smoke test: closing a deal fixes «Fecha de cierre» to today when it is empty or in the future (as the original),
// keeps a past one, never touches it on reopening, works for any closed stage of the pipeline (won / lost keys or
// a stage whose forecast category is won / lost), from every path (setField, board drag through changeDealStage,
// bulk edit), and leaves the optional closeDate automation of deal-close.js working. The won deal enters the view
// «Mis negocios ganados este mes». Run: node scripts/smoke-deal-close-date.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[deal-close-date]', ...a);
const fail = (msg) => { console.error(`[deal-close-date] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/deals/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'FormData', 'URL', 'Blob', 'MutationObserver']) globalThis[k] = dom.window[k];
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
dom.window.HTMLElement.prototype.scrollBy = function () {};
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const day = (iso) => String(iso || '').slice(0, 10);

const data = await import(resolve(here, '../src/data.js'));
const DC = await import(resolve(here, '../src/deal-close.js'));
const today = day(data.todayNoonIso());
if (today !== new Date().toISOString().slice(0, 10) && today !== `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`) fail('todayNoonIso is the real calendar day');
const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const PAST = '2026-09-01T12:00:00.000Z';
const defs = data.dealPipelineDefs();
const pipe = defs[0];
defs.forEach((d) => { d.rules = {}; d.required = {}; d.automation = {}; });
data.saveDealPipelineDefs(defs);
const openKey = pipe.stages.find((s) => !data.isClosedStage(s[0]))[0];
const mk = (name, closeDate, extra = {}) => data.addRecord('deals', { name, pipeline: pipe.name, stage: openKey, amount: 1000, owner: 'Fernando L.', closeDate, created: data.TODAY.toISOString(), lastActivity: data.TODAY.toISOString(), ...extra });
const get = (id) => data.findRecord('deals', id);

// ---- 1) future close date → won → today; enters «Mis negocios ganados este mes» ----
const a = mk('Fachada futura', FUTURE);
data.setField('deals', a.id, 'stage', 'won');
if (day(get(a.id).closeDate) !== today) fail(`future close date must become today (${get(a.id).closeDate})`);
if (!data.activitiesFor('deals', a.id).some((e) => /Fecha de cierre fijada a «/.test(e.text))) fail('system entry on the deal timeline');
if (data.activitiesFor('deals', a.id).some((e) => e.type === 'prop' && e.extra && e.extra.key === 'closeDate')) fail('no property-history row for the automatic date');
log('future → won: closeDate', day(get(a.id).closeDate));

// ---- 2) empty close date → lost → today; past close date → won → kept; reopening keeps it ----
const b = mk('Sin fecha', '');
data.setField('deals', b.id, 'stage', 'lost');
if (day(get(b.id).closeDate) !== today) fail('empty close date must become today when lost');
const c = mk('Cerrado en septiembre', PAST);
data.setField('deals', c.id, 'stage', 'won');
if (get(c.id).closeDate !== PAST) fail(`a past close date is kept (${get(c.id).closeDate})`);
data.setField('deals', a.id, 'stage', openKey);
if (day(get(a.id).closeDate) !== today) fail('reopening does not touch the date');
data.setField('deals', a.id, 'closeDate', FUTURE);
data.setField('deals', a.id, 'stage', openKey === pipe.stages[0][0] ? pipe.stages[1][0] : pipe.stages[0][0]);
if (get(a.id).closeDate !== FUTURE) fail('moving between open stages does not touch the date');
log('empty → lost: today; past kept on won; reopen and open→open untouched');

// ---- 3) a custom closed stage (forecast category lost) of another pipeline ----
const custom = defs[1] || defs[0];
const closedKey = `cerrado_${Date.now().toString(36)}`;
custom.stages.push([closedKey, 'Descartado', 0, '', 'lost']);
data.saveDealPipelineDefs(defs);
const d = data.addRecord('deals', { name: 'Descartable', pipeline: custom.name, stage: custom.stages[0][0], amount: 10, owner: 'Fernando L.', closeDate: FUTURE, created: data.TODAY.toISOString() });
if (!data.dealStageIsClosed(custom.name, closedKey) || data.dealStageIsClosed(custom.name, custom.stages[0][0])) fail('dealStageIsClosed by forecast category');
data.setField('deals', d.id, 'stage', closedKey);
if (day(get(d.id).closeDate) !== today) fail('a custom closed stage fixes the date too');
log('custom closed stage (forecast lost): closeDate today');

// Probability zero is sufficient even with an explicitly open forecast category.
const zeroKey = 'zero_probability_regression';
custom.stages.push([zeroKey, 'Eliminado personalizado', 0, '', 'pipeline']);
pipe.stages.push([zeroKey, 'Abierto en otro pipeline', 40, '', 'pipeline']);
data.saveDealPipelineDefs(defs);
for (const [input, expected] of [[FUTURE, today], ['', today], [PAST, day(PAST)]]) {
  const record = mk('Probabilidad cero', input, { pipeline: custom.name });
  data.setField('deals', record.id, 'stage', zeroKey);
  if (day(get(record.id).closeDate) !== expected) fail('zero probability must clamp only empty/future dates');
}
const otherPipeline = mk('Misma clave abierta', FUTURE);
data.setField('deals', otherPipeline.id, 'stage', zeroKey);
if (get(otherPipeline.id).closeDate !== FUTURE) fail('probability must belong to the deal pipeline');
log('zero probability: future/empty clamped, past kept, pipeline scoped');

// ---- 4) the closeDate automation of deal-close.js still works (uses the real now) ----
pipe.automation = { won: { closeDate: true } };
data.saveDealPipelineDefs(defs);
// closing through changeDealStage asks for the won / lost reason in a modal: answer it like a person would
const answerCloseModal = async () => {
  await wait(30);
  const modal = document.getElementById('deal-close-modal');
  if (!modal) return false;
  const reason = modal.querySelector('[data-edit="closedWonReason"], [data-edit="closedLostReason"]');
  if (reason) reason.value = 'Mejor precio';
  modal.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(30);
  return true;
};
const e = mk('Con automatización', PAST);
const pending = DC.changeDealStage(get(e.id), 'won');
await answerCloseModal();
const ok = await pending;
if (!ok || day(get(e.id).closeDate) !== new Date().toISOString().slice(0, 10)) fail(`automation closeDate = now (${get(e.id).closeDate})`);
pipe.automation = {};
data.saveDealPipelineDefs(defs);
log('automation closeDate: still sets the real date');

// ---- 5) board drag (list.js → changeDealStage) and bulk edit go through the same path ----
await import(resolve(here, '../src/deals.js'));
await wait(40);
click(q('button.views__tab[data-view="std:all"]'));
await wait(20);
click(q('[data-action="mode-board"]'));
await wait(40);
const f = mk('Arrastrado a ganado', FUTURE);
click(q('[data-action="mode-list"], [data-action="mode-table"]') || q('[data-action="mode-board"]'));
await wait(20);
click(q('[data-action="mode-board"]'));
await wait(40);
const card = q(`.kcard[data-id="${f.id}"]`);
const col = q('.kcol[data-group="won"]');
if (!card || !col) fail(`board card / won column (${Boolean(card)} / ${Boolean(col)})`);
const ds = { effectAllowed: '', dropEffect: '', setData() {}, getData() { return ''; } };
const ev = (t) => { const x = new window.Event(t, { bubbles: true, cancelable: true }); x.dataTransfer = ds; return x; };
card.dispatchEvent(ev('dragstart')); col.dispatchEvent(ev('dragover')); col.dispatchEvent(ev('drop'));
await answerCloseModal();
await wait(80);
if (get(f.id).stage !== 'won' || day(get(f.id).closeDate) !== today) fail(`board drag → won → closeDate today (${get(f.id).stage} / ${get(f.id).closeDate})`);
log('board drag to Ganado: closeDate today');
// the won deal is in «Mis negocios ganados este mes»
click(q('[data-action="mode-list"], [data-action="mode-table"]') || q('[data-action="mode-board"]'));
await wait(20);
// «Mis negocios ganados este mes» (src/deals.js): owner Fernando L., stage won and |closeDate − hoy del CRM| ≤ 30 días.
// The view measures «este mes» against the CRM's sample anchor (data.TODAY); check it while the real day is near it.
const inWonMonth = (r) => r.owner === 'Fernando L.' && r.stage === 'won' && Math.abs((data.TODAY - new Date(r.closeDate)) / 86400000) <= 30;
if (Math.abs((Date.now() - data.TODAY.getTime()) / 86400000) <= 30) {
  if (!inWonMonth(get(f.id))) fail('the won deal qualifies for «Mis negocios ganados este mes»');
  const wonTab = qa('button.views__tab').find((b) => /ganados este mes/i.test(b.textContent));
  if (wonTab) {
    click(wonTab); await wait(40);
    const s = document.getElementById('row-search'); s.value = 'Arrastrado a ganado'; s.dispatchEvent(new window.Event('input', { bubbles: true })); await wait(30);
    if (!qa('#table tbody tr[data-id]').some((tr) => Number(tr.dataset.id) === Number(f.id))) fail('the won deal is listed in «Mis negocios ganados este mes»');
  }
  log('view «Mis negocios ganados este mes»: the won deal qualifies' + (wonTab ? ' and is listed' : ' (tab not shown by default)'));
} else log('view «Mis negocios ganados este mes»: skipped (real day far from the sample anchor)');
console.log('[deal-close-date] OK');
process.exit(0);
