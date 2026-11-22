// Smoke test for the lifecycle stage rules and automations (Ajustes › Objetos › Contactos / Empresas › Etapa del
// ciclo de vida, enforced in src/data.js): with the three automations on, a new deal for a «Lead» contact moves
// it (and its company) to «Oportunidad», winning the deal moves both to «Cliente», each move leaves its system
// entry; a manual change backwards is refused with the configured rule (noBack), as are skips (noSkip) and
// leaving Lead without an owner (requireOwner); «lockCustomer» keeps customers out of automations; the contact ↔
// company sync pulls the other one forward, never back; with the boxes off nothing happens. The record page
// shows the refusal as a toast. Run: node scripts/smoke-lifecycle-rules.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[lifecycle-rules]', ...a);
const fail = (msg) => { console.error(`[lifecycle-rules] FAIL: ${msg}`); process.exit(1); };
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const useDom = (html, url) => { const dom = new JSDOM(html, { url, pretendToBeVisual: true }); for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = dom.window[k]; dom.window.HTMLElement.prototype.scrollIntoView = function () {}; dom.window.confirm = () => true; dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); return dom; };
useDom('<!doctype html><body class="app"></body>', 'http://localhost/contacts/');
const data = await import(resolve(here, '../src/data.js'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const lc = (type, id) => data.findRecord(type, id).lifecycle;
const lcNotes = (type, id) => data.activitiesFor(type, id).filter((a) => a.type === 'system' && /^Etapa del ciclo de vida cambiada a/.test(a.text)).map((a) => a.text);
const setDef = (patch) => data.saveLifecycleDef({ ...data.defaultLifecycleDef(), ...patch });
const dealFor = (name, contact, companyId) => data.addRecord('deals', { name, amount: 100, stage: 'appointment', pipeline: 'Pipeline de ventas', closeDate: new Date(data.TODAY.getTime() + 30 * 86400000).toISOString(), owner: 'Fernando L.', companyId: companyId || '', company: '', contactId: contact ? contact.id : '', priority: 'medium', type: 'Nuevo negocio', lastActivity: data.TODAY.toISOString() });
const tryStage = (type, id, stage) => { try { data.setField(type, id, 'lifecycle', stage); return null; } catch (e) { return e.message; } };

// ---- all rules and automations on ----
setDef({ rules: { noBack: true, noSkip: true, lockCustomer: true, requireOwner: true }, sync: { onDeal: true, onWon: true, company: true } });
const co = data.addRecord('companies', { name: 'Vidriería Regla', domain: 'vidrieria-regla.com', owner: 'Fernando L.', lifecycle: 'Lead' });
const ana = data.addRecord('contacts', { name: 'Ana Regla', first: 'Ana', last: 'Regla', email: 'ana@vidrieria-regla.com', owner: 'Fernando L.', lifecycle: 'Lead', companyId: co.id, company: co.name, created: '2026-01-01T10:00:00.000Z' });
const beto = data.addRecord('contacts', { name: 'Beto Sin Dueño', first: 'Beto', last: 'Sin Dueño', email: 'beto@vidrieria-regla.com', owner: 'Sin asignar', lifecycle: 'Suscriptor', companyId: co.id, company: co.name });
if (lc('contacts', ana.id) !== 'Lead' || lc('companies', co.id) !== 'Lead') fail('fixtures start as Lead');
// a new deal for Ana → Ana and her company move to Oportunidad, with the reason on both timelines
const deal = dealFor('Fachada Regla', ana, co.id);
if (lc('contacts', ana.id) !== 'Oportunidad' || lc('companies', co.id) !== 'Oportunidad') fail(`new deal → Oportunidad (${lc('contacts', ana.id)} / ${lc('companies', co.id)})`);
if (lcNotes('contacts', ana.id)[0] !== 'Etapa del ciclo de vida cambiada a «Oportunidad» por el negocio «Fachada Regla».' || lcNotes('companies', co.id)[0] !== 'Etapa del ciclo de vida cambiada a «Oportunidad» por el negocio «Fachada Regla».') fail(`timeline entries (${lcNotes('contacts', ana.id)[0]} / ${lcNotes('companies', co.id)[0]})`);
if (data.activitiesFor('contacts', ana.id)[0].extra.deal !== deal.id || data.activitiesFor('contacts', ana.id)[0].extra.lifecycleFrom !== 'Lead') fail('entry carries the deal and the previous stage');
if (lc('contacts', beto.id) !== 'Suscriptor') fail('a contact not on the deal is untouched by the deal itself');
if (!data.findRecord('contacts', ana.id).hs_lifecyclestage_opportunity_date) fail('the stage date is stamped by the automation too');
log(`negocio creado → Ana y «${co.name}» en Oportunidad, cronología con el motivo; Beto (sin negocio) sigue en Suscriptor`);

// the deal is won → both move to Cliente (via changeDealStage's write: setField on stage)
data.setField('deals', deal.id, 'stage', 'won');
if (lc('contacts', ana.id) !== 'Cliente' || lc('companies', co.id) !== 'Cliente') fail(`won → Cliente (${lc('contacts', ana.id)} / ${lc('companies', co.id)})`);
if (lcNotes('contacts', ana.id)[0] !== 'Etapa del ciclo de vida cambiada a «Cliente» al ganarse el negocio «Fachada Regla».' || lcNotes('companies', co.id)[0] !== 'Etapa del ciclo de vida cambiada a «Cliente» al ganarse el negocio «Fachada Regla».') fail('won timeline entries');
// won again / another closed stage: nothing more
data.setField('deals', deal.id, 'stage', 'won');
if (lcNotes('contacts', ana.id).length !== 2) fail('setting the same stage again logs nothing');
log('negocio ganado → Ana y empresa en Cliente, cronología con el motivo');

// ---- manual rules ----
let why = tryStage('contacts', ana.id, 'Lead');
if (!why || !/Solo permitir avanzar de etapa/.test(why) || lc('contacts', ana.id) !== 'Cliente') fail(`noBack blocks a manual move back (${why})`);
why = tryStage('contacts', beto.id, 'Lead calificado por marketing');
if (!why || !/Limitar los saltos de etapa/.test(why) || !/«Lead»/.test(why) || lc('contacts', beto.id) !== 'Suscriptor') fail(`noSkip blocks a jump (${why})`);
if (tryStage('contacts', beto.id, 'Lead') !== null || lc('contacts', beto.id) !== 'Lead') fail('the next stage is allowed');
why = tryStage('contacts', beto.id, 'Lead calificado por marketing');
if (!why || !/Exigir propietario para avanzar de Lead/.test(why) || lc('contacts', beto.id) !== 'Lead') fail(`requireOwner blocks a contact without owner (${why})`);
data.setField('contacts', beto.id, 'owner', 'Sofía R.');
if (tryStage('contacts', beto.id, 'Lead calificado por marketing') !== null || lc('contacts', beto.id) !== 'Lead calificado por marketing') fail('with an owner the move is allowed');
if (tryStage('contacts', beto.id, 'Otro') !== null || tryStage('contacts', beto.id, 'Lead calificado por marketing') !== null) fail('«Otro» is outside the ladder: free to enter and leave');
// the company (Cliente) is ahead of Beto: the sync from the company never pulls him beyond what the rules allow, and Beto's own move does not pull the company back
if (lc('companies', co.id) !== 'Cliente') fail('company stays Cliente');
log('reglas manuales: retroceso bloqueado (noBack), salto bloqueado (noSkip), sin propietario bloqueado (requireOwner), «Otro» libre');

// ---- lockCustomer: a customer is never moved by an automation; requireOwner also stops automations ----
const eva = data.addRecord('contacts', { name: 'Eva Evangelista', first: 'Eva', last: 'Evangelista', email: 'eva@otra.com', owner: 'Fernando L.', lifecycle: 'Evangelista' });
dealFor('Negocio de Eva', eva, '');
if (lc('contacts', eva.id) !== 'Evangelista' || lcNotes('contacts', eva.id).length) fail('lockCustomer keeps an Evangelista where she is');
const nilo = data.addRecord('contacts', { name: 'Nilo Sin Dueño', first: 'Nilo', last: 'Sin Dueño', email: 'nilo@otra.com', owner: 'Sin asignar', lifecycle: 'Lead' });
dealFor('Negocio de Nilo', nilo, '');
if (lc('contacts', nilo.id) !== 'Lead' || lcNotes('contacts', nilo.id).length) fail('requireOwner stops the automation for a contact without owner');
log('lockCustomer: Evangelista intacta tras un negocio; requireOwner: contacto sin propietario no avanza por automatización');

// ---- contact ↔ company sync: forward only, one hop ----
setDef({ rules: {}, sync: { onDeal: true, onWon: true, company: true } });
const g = data.addRecord('companies', { name: 'Grupo Sinc', domain: 'grupo-sinc.com', owner: 'Fernando L.', lifecycle: 'Lead' });
const fer = data.addRecord('contacts', { name: 'Fer Sinc', first: 'Fer', last: 'Sinc', email: 'fer@grupo-sinc.com', owner: 'Fernando L.', lifecycle: 'Lead', companyId: g.id, company: g.name });
const gil = data.addRecord('contacts', { name: 'Gil Sinc', first: 'Gil', last: 'Sinc', email: 'gil@grupo-sinc.com', owner: 'Fernando L.', lifecycle: 'Cliente', companyId: g.id, company: g.name });
data.setField('contacts', fer.id, 'lifecycle', 'Oportunidad');
if (lc('companies', g.id) !== 'Oportunidad' || lcNotes('companies', g.id)[0] !== 'Etapa del ciclo de vida cambiada a «Oportunidad» para sincronizarla con el contacto «Fer Sinc».') fail(`contact → company sync (${lc('companies', g.id)})`);
if (lc('contacts', gil.id) !== 'Cliente') fail('a contact ahead of the company is untouched (one hop, never back)');
data.setField('companies', g.id, 'lifecycle', 'Cliente');
if (lc('contacts', fer.id) !== 'Cliente' || lcNotes('contacts', fer.id)[0] !== 'Etapa del ciclo de vida cambiada a «Cliente» para sincronizarla con la empresa «Grupo Sinc».') fail(`company → contacts sync (${lc('contacts', fer.id)})`);
if (lcNotes('contacts', gil.id).length) fail('the contact already at Cliente logs nothing');
// no rules: a manual move back on the company is allowed, and the sync never pulls the contacts back
data.setField('companies', g.id, 'lifecycle', 'Lead');
if (lc('companies', g.id) !== 'Lead' || lc('contacts', fer.id) !== 'Cliente' || lc('contacts', gil.id) !== 'Cliente') fail('sync never moves a record backwards');
// a deal with only a contact pulls the contact's company through the sync setting
const h = data.addRecord('companies', { name: 'Holding Sinc', domain: 'holding-sinc.com', owner: 'Fernando L.', lifecycle: 'Suscriptor' });
const ivo = data.addRecord('contacts', { name: 'Ivo Sinc', first: 'Ivo', last: 'Sinc', email: 'ivo@holding-sinc.com', owner: 'Fernando L.', lifecycle: 'Suscriptor', companyId: h.id, company: h.name });
dealFor('Negocio de Ivo', ivo, '');
if (lc('contacts', ivo.id) !== 'Oportunidad' || lc('companies', h.id) !== 'Oportunidad') fail('a deal with only a contact also lifts the contact\'s company');
log('sincronización contacto ↔ empresa: avanza al otro si está por detrás, nunca retrocede; negocio solo con contacto eleva también a su empresa');

// ---- the boxes off: nothing happens ----
setDef({ rules: {}, sync: { onDeal: false, onWon: false, company: false } });
const off = data.addRecord('companies', { name: 'Empresa Apagada', domain: 'apagada.com', owner: 'Fernando L.', lifecycle: 'Lead' });
const leo = data.addRecord('contacts', { name: 'Leo Apagado', first: 'Leo', last: 'Apagado', email: 'leo@apagada.com', owner: 'Fernando L.', lifecycle: 'Lead', companyId: off.id, company: off.name });
const dOff = dealFor('Negocio apagado', leo, off.id);
data.setField('deals', dOff.id, 'stage', 'won');
data.setField('contacts', leo.id, 'lifecycle', 'Oportunidad');
if (lc('contacts', leo.id) !== 'Oportunidad' || lc('companies', off.id) !== 'Lead' || lcNotes('contacts', leo.id).length || lcNotes('companies', off.id).length) fail('with the automations off nothing moves automatically');
if (tryStage('contacts', leo.id, 'Suscriptor') !== null) fail('with no rules a manual move back is allowed');
log('casillas desactivadas: ni el negocio, ni ganarlo, ni la sincronización mueven nada; sin reglas el retroceso manual se permite');

// ---- the record page shows the refusal as a toast and keeps the value ----
setDef({ rules: { noBack: true }, sync: { onDeal: true, onWon: true, company: true } });
useDom(`<!doctype html><body class="app" data-type="contacts"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>`, `http://localhost/contacts/record/?id=${ana.id}`);
await import(resolve(here, '../src/record.js'));
await wait(60);
const editBtn = document.querySelector('[data-edit-key="lifecycle"]');
if (!editBtn) fail('lifecycle editable in «Acerca de»');
editBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
await wait(10);
const form = document.querySelector('form.props__form[data-key="lifecycle"]') || document.querySelector('.props__form');
const sel = form && form.querySelector('[data-edit]');
if (!sel) fail('inline editor for the lifecycle');
sel.value = 'Lead';
sel.dispatchEvent(new window.Event('change', { bubbles: true }));
form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(20);
const toastText = text(document.getElementById('toast'));
if (!/Solo permitir avanzar de etapa/.test(toastText) || lc('contacts', ana.id) !== 'Cliente') fail(`record page toast with the rule (${toastText} / ${lc('contacts', ana.id)})`);
if (!document.body.textContent.includes('Cliente')) fail('the page still shows Cliente');
log(`ficha: intento de retroceder → toast «${toastText.slice(0, 90)}…», etapa intacta`);
console.log('[lifecycle-rules] OK');
process.exit(0);
