// DOM smoke test for «Etiquetas de Negocio» (src/deal-tags.js + src/deal-tags-ui.js): the tab under Ajustes ›
// Objetos › Negocios › Pipelines with its toolbar (filter by pipeline, «Etiquetas usadas: X de 50», «Ver uso de
// etiquetas», «Crear etiqueta» with the presets) and the seeded table; the three-step side panel from the
// «Atrasado» preset (settings → preloaded filters → review with the card preview → save); the evaluation engine
// (a deal with a past close date earns the chip, a future one does not); the chips on the board cards and in the
// list column; editing, deleting and the pipeline filter. Run: node scripts/smoke-deal-tags.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[deal-tags]', ...a);
const fail = (msg) => { console.error(`[deal-tags] FAIL: ${msg}`); process.exit(1); };
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

// ===== 1) Ajustes › Objetos › Negocios › Pipelines › Etiquetas de Negocio =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main class="content content--settings" id="settings-root"></main><div id="scrim"></div></body>', 'http://localhost/settings/#obj-deals:pipelines');
const data = await import(resolve(here, '../src/data.js'));
const T = await import(resolve(here, '../src/deal-tags.js'));
await T.ready;
if (T.dealTagsLive()) fail('the test must run in local mode');
if (T.dealTags().length !== 3 || T.dealTags().map((t) => t.name).join('|') !== 'Obsoleto|Importante|Negocios importantes') fail(`seed: ${T.dealTags().map((t) => t.name).join('|')}`);
await import(resolve(here, '../src/settings.js'));
await wait(10);
if (!q('[data-pipe-tab="overview"]') || !q('[data-pipe-tab="labels"]')) fail('pipelines sub-tabs missing');
if (!q('[data-stage-color="none"]') || !q('[data-stage-color="dot"]') || !q('[data-stage-color="badge"]')) fail('«Definir los colores de visualización del pipeline» selector missing');
const jfc = data.dealPipelineDefs().find((p) => /jfc/i.test(p.name));
const jfcRow = qa('[data-dnd="pipes"] tr').find((r) => text(r).includes(jfc.name));
if (!jfcRow || text(jfcRow.children[4]) !== '3') fail(`overview column «Etiquetas de negocios» for ${jfc.name}: ${jfcRow && text(jfcRow.children[4])}`);
click(q('[data-pipe-tab="labels"]'));
if (!$('dtags') || text(q('.dtags__title')) !== 'Etiquetas de Negocio') fail('labels tab');
if (text(q('.dtags__filter')).indexOf('Filtrar por:') !== 0 || text(qa('#dtags-pipeline option')[0]) !== 'Todos los pipelines' || qa('#dtags-pipeline option').length !== data.dealPipelineDefs().length + 1) fail('pipeline filter');
if (text(q('.dtags__count')) !== 'Etiquetas usadas: 3 de 50' || !q('[data-dt="usage"]') || text(q('[data-dt="usage"]')) !== 'Ver uso de etiquetas') fail(`toolbar: ${text(q('.dtags__bar'))}`);
const presets = qa('.dtags__preset');
if (presets.map((b) => text(b.querySelector('strong'))).join('|') !== 'Atrasado|Urgente|Agregar contacto' || !text(presets[0]).includes('La fecha de cierre pasó hace más de 1 día') || !text(presets[1]).includes('en menos de 3 días') || !text(presets[2]).includes('contactos asociados es menor que 1') || text(q('.dtags__scratch')) !== 'Crear desde cero' || text(q('.dtags__presets-title')) !== 'Ajuste preestablecido') fail('preset menu');
const rows = () => qa('#dtags-rows tr[data-tag]');
if (rows().length !== 3 || !rows()[0].querySelector('.dtags__swatch') || !text(rows()[0]).includes('Obsoleto') || !text(rows()[0]).includes('La fecha de creación pasó hace más de 90 días') || text(rows()[0].children[2]) !== 'Múltiples pipelines' || text(rows()[2].children[2]) !== jfc.name) fail(`table rows: ${rows().map(text).join(' | ')}`);
if (!rows()[0].querySelector('[data-dt="edit"]') || !rows()[0].querySelector('[data-dt="remove"]')) fail('row actions');
log('tab: toolbar (filter, counter 3 de 50, usage link, presets menu) and the 3 seeded tags with swatch / description / pipeline assignment');

// ===== 2) «Crear etiqueta › Atrasado»: side panel, 3 steps, preloaded filters, preview, save =====
click(presets[0]);
await wait(5);
const drawer = $('dtag-drawer');
if (!drawer || !drawer.classList.contains('is-open') || !drawer.querySelector('.drawer__panel') || text(q('#dtag-title')) !== 'Agregar etiqueta de negocio') fail('side panel did not open');
if (qa('.dtag__step').map(text).join('|') !== 'Configuración de la etiqueta|Filtros|Revisión' || !qa('.dtag__step')[0].classList.contains('is-active')) fail('progress bar');
if ($('dt-name').value !== 'Atrasado' || !$('dt-desc').value.includes('hace más de 1 día') || !q('.dtag__emojibtn') || !q('.dtag__colorbtn') || qa('.dtag__color').length !== 8 || !q('[name="dt-pipe"][value="all"]').checked || !$('dt-pipelist').hidden) fail('step 1 prefilled from the preset');
click(q('.dtag__emojibtn'));
click(q('[data-dt-emoji="⭐"]'));
click(q('[data-dt-color="#FBEECE"]'));
if (text(q('.dtag__emojibtn')) !== '⭐' || !q('.dtag__colorbtn').getAttribute('style').includes('#FBEECE')) fail('emoji / colour pickers');
input($('dt-name'), '');
click(q('[data-dt-go="next"]'));
if (!$('dt-err') || $('dt-err').hidden || !text($('dt-err')).includes('nombre')) fail('name is required');
input($('dt-name'), 'Atrasado');
click(q('[data-dt-go="next"]'));
if (!qa('.dtag__step')[1].classList.contains('is-active') || !qa('.dtag__step')[0].classList.contains('is-done')) fail('step 2 not reached');
const conds = qa('.dtag__cond').map(text);
if (conds.length !== 2 || conds[0] !== 'Fecha de cierre es de hace más de 1 día' || conds[1] !== 'Está cerrado es igual a No' || !q('.dtag__and') || text(q('.dtag__grouptitle')) !== 'Grupo 1') fail(`preset filters: ${conds.join(' | ')}`);
if (text(q('[data-dt-go="edit-filters"]')) !== 'Editar filtros' || !text(q('[data-dt-go="back"]')).includes('Atrás: Configuración de la etiqueta') || !text(q('[data-dt-go="next"]')).includes('Siguiente: Revisar etiqueta')) fail('step 2 buttons');
click(q('[data-dt-go="edit-filters"]'));
if (!$('dt-filters-editor') || qa('#dt-filters-editor .advc').length !== 2) fail('the filter editor must open with the two conditions');
click(q('[data-dt-go="done-filters"]'));
click(q('[data-dt-go="next"]'));
if (!qa('.dtag__step')[2].classList.contains('is-active') || !q('.dtag__preview .dtag__card')) fail('review step');
const chip = q('.dtag__card .dtag');
if (!chip || text(chip) !== '⭐Atrasado' || text(chip.querySelector('.dtag__emoji')) !== '⭐' || !chip.getAttribute('style').includes('#FBEECE') || text(q('.dtag__cardname')) !== 'Nombre de negocio' || qa('.dtag__cardprop').length !== 2) fail(`preview card: ${chip && text(chip)}`);
const dds = qa('.dtag__summary dd').map(text);
if (dds[0] !== 'Atrasado' || !dds[1].includes('hace más de 1 día') || dds[2] !== 'Todos los pipelines' || qa('.dtag__cond').length !== 2) fail(`review summary: ${dds.join(' | ')}`);
if (!text(q('[data-dt-go="back"]')).includes('Atrás: Agregar filtros') || text(q('[data-dt-go="save"]')) !== 'Guardar') fail('step 3 buttons');
click(q('[data-dt-go="save"]'));
await wait(5);
if (drawer.classList.contains('is-open') || !toastText().includes('«Atrasado» creada')) fail('save should close the panel');
const late = T.dealTags().find((t) => t.name === 'Atrasado');
if (!late || late.emoji !== '⭐' || late.color !== '#FBEECE' || late.filters.length !== 2 || late.filters[0].key !== 'closeDate' || late.filters[0].op !== 'olderdays' || late.filters[0].value !== '1' || late.pipelineIds.length) fail(`saved tag: ${JSON.stringify(late)}`);
if (rows().length !== 4 || text(q('.dtags__count')) !== 'Etiquetas usadas: 4 de 50' || !JSON.parse(mem['crm:deal_tags']).some((t) => t.name === 'Atrasado')) fail('table / counter / storage after save');
log('preset «Atrasado»: side panel with progress bar, step 1 prefilled, emoji + colour, preloaded filters, editor, review preview + summary, saved');

// ===== 3) The engine: a deal with a past close date (still open) earns «Atrasado», a future one does not =====
const open = data.allDeals().filter((d) => !data.isClosedStage(d.stage));
const pastDeal = open[0];
const futureDeal = open[1];
data.setField('deals', pastDeal.id, 'closeDate', new Date(data.TODAY.getTime() - 5 * 86400000).toISOString());
data.setField('deals', futureDeal.id, 'closeDate', new Date(data.TODAY.getTime() + 30 * 86400000).toISOString());
const pastNow = data.findRecord('deals', pastDeal.id);
const futureNow = data.findRecord('deals', futureDeal.id);
if (!T.tagsForDeal(pastNow).some((t) => t.name === 'Atrasado')) fail('a deal with a past close date must earn «Atrasado»');
if (T.tagsForDeal(futureNow).some((t) => t.name === 'Atrasado')) fail('a deal closing in 30 days must not earn «Atrasado»');
const closedDeal = data.allDeals().find((d) => data.isClosedStage(d.stage));
if (closedDeal) { data.setField('deals', closedDeal.id, 'closeDate', new Date(data.TODAY.getTime() - 5 * 86400000).toISOString()); if (T.tagsForDeal(data.findRecord('deals', closedDeal.id)).some((t) => t.name === 'Atrasado')) fail('a closed deal must not be «Atrasado»'); }
const big = data.allDeals().find((d) => Number(d.amount) > 1000000);
if (big && !T.tagsForDeal(big).some((t) => t.name === 'Importante')) fail('amount > 1,000,000 must earn «Importante»');
const jfcDeal = data.allDeals().find((d) => d.pipeline === jfc.name);
if (jfcDeal) { data.setField('deals', jfcDeal.id, 'amount', 250000); if (!T.tagsForDeal(data.findRecord('deals', jfcDeal.id)).some((t) => t.name === 'Negocios importantes')) fail('JFC deal above 100,000 must earn «Negocios importantes»'); }
const other = data.allDeals().find((d) => d.pipeline !== jfc.name && Number(d.amount) > 100000 && Number(d.amount) <= 1000000);
if (other && T.tagsForDeal(other).some((t) => t.name === 'Negocios importantes')) fail('a pipeline-specific tag must not apply to other pipelines');
const use = T.usage();
if (!use.find((u) => u.tag.name === 'Atrasado') || use.find((u) => u.tag.name === 'Atrasado').count < 1) fail('usage counts');
log(`engine: past close date → Atrasado (${use.find((u) => u.tag.name === 'Atrasado').count} deals), future / closed → not; Importante by amount; pipeline-specific tag only in ${jfc.name}`);

// ===== 4) «Ver uso de etiquetas», pipeline filter, edit and delete =====
click(q('[data-dt="usage"]'));
if (!$('dtag-modal').classList.contains('is-open') || qa('#dtag-modal tr[data-usage]').length !== 4 || !text(q('#dtag-modal')).includes('Atrasado')) fail('usage modal');
click(q('#dtag-modal [data-bm="close"]'));
change($('dtags-pipeline'), String(jfc.id));
if (rows().length !== 4 || !rows().some((r) => text(r).includes('Negocios importantes'))) fail(`pipeline filter (JFC): ${rows().map((r) => text(r.children[1])).join(' | ')}`);
const otherPipe = data.dealPipelineDefs().find((p) => p.id !== jfc.id);
change($('dtags-pipeline'), String(otherPipe.id));
if (rows().length !== 3 || rows().some((r) => text(r).includes('Negocios importantes'))) fail('a pipeline-specific tag must not list under another pipeline');
change($('dtags-pipeline'), '');
click(rows().find((r) => text(r).includes('Atrasado')).querySelector('[data-dt="edit"]'));
await wait(5);
if (text(q('#dtag-title')) !== 'Editar etiqueta de negocio' || $('dt-name').value !== 'Atrasado') fail('edit panel');
input($('dt-name'), 'Atrasado 2 días');
click(q('[name="dt-pipe"][value="specific"]'));
change(q('[name="dt-pipe"][value="specific"]'));
if ($('dt-pipelist').hidden) fail('specific pipelines list must show');
const cb = q(`[data-dt-pipe="${jfc.id}"]`); cb.checked = true;
click(q('[data-dt-go="next"]'));
click(q('[data-dt-go="next"]'));
if (!text(qa('.dtag__summary dd')[2]).includes(`Pipelines específicos: ${jfc.name}`)) fail(`review pipelines: ${text(qa('.dtag__summary dd')[2])}`);
click(q('[data-dt-go="save"]'));
await wait(5);
const edited = T.dealTags().find((t) => t.name === 'Atrasado 2 días');
if (!edited || edited.id !== late.id || String(edited.pipelineIds[0]) !== String(jfc.id) || !rows().some((r) => text(r).includes('Atrasado 2 días') && text(r.children[2]) === jfc.name)) fail('edit not saved');
if (T.tagsForDeal(pastNow).some((t) => t.id === late.id) && pastNow.pipeline !== jfc.name) fail('after restricting the pipeline the tag must leave other pipelines');
click(rows().find((r) => text(r).includes('Atrasado 2 días')).querySelector('[data-dt="remove"]'));
click(q('#dtag-modal [data-dtm="confirm-remove"]'));
if (T.dealTags().length !== 3 || rows().length !== 3 || text(q('.dtags__count')) !== 'Etiquetas usadas: 3 de 50') fail('delete');
log('usage modal, pipeline filter, edit (name + specific pipeline) and delete');

// ===== 5) Deals page: chips on the board cards and in the list column =====
T.createTag({ name: 'Atrasado', emoji: '⏰', color: '#FBDDD8', description: 'La fecha de cierre pasó hace más de 1 día', pipelineIds: [], filters: T.presetByKey('late').filters });
mem['crm:deals:prefs'] = JSON.stringify({ columns: ['name', 'stage', 'pipeline', 'amount', 'closeDate', 'deal_tags'], size: 50 });
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', 'http://localhost/deals/');
await import(resolve(here, '../src/deals.js'));
await wait(10);
click(q('button.views__tab[data-view="std:all"]'));
const cell = q(`#table tbody tr[data-id="${pastDeal.id}"] td[data-key="deal_tags"]`);
if (!cell || !cell.querySelector('.dtag') || !text(cell).includes('Atrasado')) fail(`list column: ${cell && text(cell)}`);
const futureCell = q(`#table tbody tr[data-id="${futureDeal.id}"] td[data-key="deal_tags"]`);
if (futureCell && text(futureCell).includes('Atrasado')) fail('future deal must not show the chip in the list');
click(q('[data-action="mode-board"]'));
await wait(10);
const card = q(`.kcard[data-id="${pastDeal.id}"]`);
if (!card) { const sel = q('.pmenu__item[data-pipeline="' + pastDeal.pipeline + '"]'); if (sel) click(sel); await wait(10); }
const card2 = q(`.kcard[data-id="${pastDeal.id}"]`);
if (!card2 || !card2.querySelector('.kcard__tags .dtag') || !text(card2.querySelector('.kcard__tags .dtag')).includes('Atrasado') || !card2.querySelector('.kcard__tags .dtag').getAttribute('style').includes('#FBDDD8')) fail(`board chip: ${card2 && text(card2.querySelector('.kcard__tags'))}`);
const futureCard = q(`.kcard[data-id="${futureDeal.id}"]`);
if (futureCard && futureCard.querySelector('.kcard__tags .dtag') && text(futureCard).includes('Atrasado')) fail('future deal card must not show «Atrasado»');
log('deals page: «Atrasado» chip (colour + emoji + name) on the board card of the past-due deal and in the list column; not on the future deal');
log('OK');
