// Smoke test for the account's 8 real deal pipelines: built-in definitions with their stages in order,
// every deal in a real stage of its pipeline (sample keys mapped), the board selector listing the 8 and
// switching columns, saving definitions (probabilities) and the rows ↔ definitions conversion used by the
// pipelines / pipeline_stages tables. Run: node scripts/smoke-pipelines.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[pipelines]', ...a);
const fail = (msg) => { console.error(`[pipelines] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/deals/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.FormData = dom.window.FormData;
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
dom.window.HTMLElement.prototype.scrollBy = function () {};
const $ = (id) => document.getElementById(id);
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };

const data = await import(resolve(here, '../src/data.js'));

// 1) the 8 real pipelines with their stages in order
const defs = data.dealPipelineDefs();
log('pipelines:', defs.map((p) => `${p.name} (${p.stages.length})`).join(' | '));
const EXPECTED = {
  'FUERZA DE VENTAS': ['OFERTA A+W', 'Proyecto en Cotización por parte del cliente', 'Proyecto Ganado por el cliente', 'Evalua', 'Ganado', 'Perdido', 'Eliminado'],
  'SACA SUMINISTRO': ['Oferta A+W', 'Entrega de presupuesto', 'Negociación con el cliente', 'Re-Cotizacion', 'Generacion de contrato y factura', 'En Producción', 'Ganados', 'Perdidos', 'Eliminación'],
  'SACA Instalaciones': ['Compra de Materiales', 'Toma de Medidas', 'Fabricación Vidrio', 'Fabricación Aluminio (Corte, Armado, Envidriado)', 'Instalacion', 'Limpieza y entrega', 'Generación de factura', 'Cobranza', 'Ganado', 'PERDIDO', 'ELIMINADO', 'Proceso de Cotizacion'],
  'Proyectos Nacionales Desarrolladores': ['Presentación de la empresa', 'Obtener contactos', 'Especificacion de Productos', 'Entrega de la cotización', 'Re-cotizacion', 'Contratos', 'Ganados', 'Perdidos'],
  'Ventas Extranjero': ['Generación de cotización', 'Cotizacion Enviada', 'Proyecto ganado por el cliente', 'Envio de muestra', 'Envio de orden de compra', 'Ganado', 'Perdido', 'Cotizacion Duplicada', 'Muestras'],
  'JFC Cargo Destino': ['Cotización', 'Envio de Cotizacion', 'Ganada', 'Perdida'],
  'Acristala obras': ['Base de Datos', 'Contacto concretado', 'Información recibida', 'Cotización trabajada (Enviada)', 'Contrato-Factura', 'Cierre ganado', 'Cierre perdido', 'Instaladores', 'Cierre de obra'],
  'Acristala Proyectos': ['Cita programada', 'Calificado para comprar', 'Presentación programada', 'Propuesta aceptada', 'Contrato enviado', 'Cierre ganado', 'Cierre perdido'],
};
if (defs.map((p) => p.name).join('|') !== Object.keys(EXPECTED).join('|')) fail('the 8 pipelines in order');
Object.entries(EXPECTED).forEach(([name, labels]) => { const p = defs.find((x) => x.name === name); if (p.stages.map((s) => s[1]).join('|') !== labels.join('|')) fail(`stages of ${name}`); if (!p.stages.some((s) => s[0] === 'won') || !p.stages.some((s) => s[0] === 'lost')) fail(`${name} needs won and lost keys`); });
const fv = defs[0].stages.map((s) => `${s[0]}:${s[2]}`).join(',');
log('FUERZA DE VENTAS probabilities:', fv, '| catalogue follows it:', data.DEAL_STAGES.map((s) => s[0]).join(',') === defs[0].stages.map((s) => s[0]).join(','));
if (fv !== 'oferta:10,cotizacion:30,ganado_cliente:40,evalua:80,won:100,lost:0,deleted:0') fail('FUERZA DE VENTAS probabilities');
if (data.DEAL_STAGES.map((s) => s[0]).join(',') !== defs[0].stages.map((s) => s[0]).join(',')) fail('DEAL_STAGES should mirror the default pipeline');
// 2) sample keys land on the real stage of each pipeline; every sample deal sits in a stage of its pipeline
const n = (pipeline, stage) => data.normalizeDealStage({ pipeline, stage }).stage;
log('mapping:', n('SACA SUMINISTRO', 'quote'), n('SACA Instalaciones', 'install'), n('Acristala Proyectos', 'appointment'), n('Acristala Proyectos', 'decision'), n('FUERZA DE VENTAS', 'contract'), n('JFC Cargo Destino', 'won'));
if (n('SACA SUMINISTRO', 'quote') !== 'presupuesto' || n('SACA Instalaciones', 'install') !== 'instalacion' || n('Acristala Proyectos', 'appointment') !== 'appointment' || n('Acristala Proyectos', 'decision') !== 'propuesta_aceptada' || n('FUERZA DE VENTAS', 'contract') !== 'evalua' || n('JFC Cargo Destino', 'won') !== 'won') fail('legacy stage mapping');
const orphans = data.allDeals().filter((d) => !data.stagesFor(d.pipeline).some((s) => s[0] === d.stage));
log('deals:', data.allDeals().length, '| outside their pipeline stages:', orphans.length, '| per pipeline:', defs.map((p) => `${p.name.split(' ')[0]}=${data.allDeals().filter((d) => d.pipeline === p.name).length}`).join(' '));
if (orphans.length) fail('every deal should sit in a stage of its pipeline');
// 3) the board selector lists the 8 pipelines; switching changes the columns
await import(resolve(here, '../src/deals.js'));
click(document.querySelector('button.views__tab[data-view="std:all"]'));
click(document.querySelector('[data-action="mode-board"]'));
const items = [...document.querySelectorAll('.pmenu__item')].map((b) => b.dataset.pipeline).filter(Boolean);
log('selector:', items.join(' | '));
if (items.join('|') !== Object.keys(EXPECTED).join('|')) fail('the selector should list the 8 pipelines');
const cols = () => [...document.querySelectorAll('.kcol')].map((c) => text(c.querySelector('.kcol__head h2')).replace(/\s\d+$/, ''));
click(document.querySelector('[data-pipeline="Acristala obras"]'));
log('Acristala obras columns:', cols().join(' | '));
if (cols().join('|') !== EXPECTED['Acristala obras'].join('|')) fail('columns should be the pipeline stages in order');
click(document.querySelector('[data-pipeline="JFC Cargo Destino"]'));
log('JFC columns:', cols().join(' | '), '| footer probability:', text(document.querySelector('.kcol[data-group="envio_cotizacion"] .kfoot__prob')));
if (cols().length !== 4 || text(document.querySelector('.kcol[data-group="envio_cotizacion"] .kfoot__prob')) !== '(50%)') fail('JFC Cargo Destino columns and probabilities');
click(document.querySelector('[data-pipeline="SACA Instalaciones"]'));
if (cols().length !== 12 || cols()[11] !== 'Proceso de Cotizacion') fail('SACA Instalaciones keeps its 12 stages in the given order');
// 4) saving definitions (what Configuración › Pipelines does): probabilities persist and the catalogue follows
const edited = data.dealPipelineDefs();
edited[1].stages[0][2] = 15;
edited[0].stages[0][1] = 'OFERTA A+W (editada)';
data.saveDealPipelineDefs(edited);
const after = data.dealPipelineDefs();
log('after save:', after[1].stages[0].join(':'), '|', after[0].stages[0][1], '| catalogue label:', data.DEAL_STAGES[0][1], '| stored locally:', Boolean(mem['crm:pipelines:deals']));
if (after[1].stages[0][2] !== 15 || data.DEAL_STAGES[0][1] !== 'OFERTA A+W (editada)' || !mem['crm:pipelines:deals']) fail('saving should persist probabilities and refresh the catalogue');
// 5) rows ↔ definitions (the pipelines / pipeline_stages tables)
const rows = data.pipelineRowsFromDefs(after);
log('rows:', rows.length, '| first:', JSON.stringify(rows[0].pipeline), '| stage:', JSON.stringify(rows[0].stages[0]));
if (rows.length !== 8 || rows[0].pipeline.objeto !== 'deal' || rows[0].pipeline.orden !== 0 || rows[0].pipeline.extra.publicId !== 102418 || rows[1].stages[0].probabilidad !== 15 || rows[2].stages[11].clave !== 'proceso_cotizacion') fail('rows from definitions');
const pipes = rows.map((r, i) => ({ id: 500 + i, ...r.pipeline }));
const stages = rows.flatMap((r, i) => r.stages.map((s, j) => ({ id: 9000 + i * 100 + j, pipeline_id: 500 + i, ...s })));
const back = data.pipelineDefsFromRows(pipes.slice().reverse(), stages.slice().reverse());
log('back from rows:', back.length, '|', back[0].name, back[0].id, back[0].dbId, '|', back[1].stages[0].join(':'), '| labels kept:', back[0].labels);
if (back.length !== 8 || back[0].name !== 'FUERZA DE VENTAS' || back[0].id !== 102418 || back[0].dbId !== 500 || back[1].stages[0].join(':') !== 'oferta_aw:Oferta A+W:15' || back[0].labels !== 2) fail('definitions from rows');
// 6) a definition saved with the sample keys is upgraded to the real stages (settings follow the mapping)
mem['crm:pipelines:deals'] = JSON.stringify([{ id: 740562, name: 'Ventas Extranjero', desc: '', labels: 2, stages: [['appointment', 'Cita programada', 20], ['quote', 'Cotización enviada', 55], ['won', 'Cerrado ganado', 100], ['lost', 'Cerrado perdido', 0]], required: { quote: ['Importe'] } }]);
const up = data.dealPipelineDefs()[0];
log('upgraded:', up.stages.map((s) => s[0]).join(','), '| required:', JSON.stringify(up.required));
if (up.stages[0][0] !== 'generacion_cotizacion' || !up.required.cotizacion_enviada) fail('legacy definitions should be upgraded');
log('OK');
