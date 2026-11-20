import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[forecast-categories]', ...a);
const fail = (msg) => { console.error(`[forecast-categories] FAIL: ${msg}`); process.exit(1); };
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
  globalThis.URL = dom.window.URL;
  globalThis.Blob = dom.window.Blob;
  dom.window.confirm = () => true;
  dom.window.prompt = (q, d) => d;
  dom.window.HTMLElement.prototype.scrollBy = function () {};
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


useDom('<body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="settings-root"></main><div id="scrim"></div></body>', 'http://localhost/settings/#obj-deals:pipelines');
const data = await import('../src/data.js');
await import('../src/settings.js');
click(q('[data-pipe-edit="0"]'));
const selector = q('[data-stage-forecast]');
if (!selector || selector.options.length !== 5) fail('forecast selector');
const key = selector.dataset.stageForecast;
change(selector, 'committed');
q('form[data-save="pipeline"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
if (data.dealPipelineDefs()[0].stages.find(s => s[0] === key)[4] !== 'committed') fail('saved category');
// Fresh module and document simulate reloading the editor from persisted storage.
useDom('<body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="settings-root"></main><div id="scrim"></div></body>', 'http://localhost/settings/#obj-deals:pipelines');
await import('../src/settings.js?reload=forecast');
click(q('[data-pipe-edit="0"]'));
if (q('[data-stage-forecast]').value !== 'committed') fail('category after reload');
const rows = data.pipelineRowsFromDefs(data.dealPipelineDefs());
if (rows[0].pipeline.extra.forecastCategories[key] !== 'committed') fail('Supabase payload');
const pipes = rows.map((r, i) => ({ ...r.pipeline, id: i + 1 }));
const stages = rows.flatMap((r, i) => r.stages.map(s => ({ ...s, pipeline_id: i + 1 })));
const restored = data.pipelineDefsFromRows(JSON.parse(JSON.stringify(pipes)), stages);
if (restored[0].stages.find(s => s[0] === key)[4] !== 'committed') fail('Supabase round trip');
if (data.dealForecastLabel({ pipeline: restored[0].name, stage: key }) !== 'Comprometido') fail('deal label');
if (data.stageForecastCategory(['won']) !== 'won' || data.stageForecastCategory(['lost']) !== 'lost') fail('closed defaults');
useDom('<body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', 'http://localhost/deals/');
await import('../src/deals.js');
if (!document.body.textContent.includes('Categoría de previsión') || !document.body.textContent.includes('Comprometido')) fail('list column');
log('OK: editor save/reload, Supabase payload round trip and deal column (offline; no remote writes)');
