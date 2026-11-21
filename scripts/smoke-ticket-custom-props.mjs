// DOM smoke test for the account's 4 real custom ticket properties (HubSpot GET /crm/v3/properties/tickets,
// hubspotDefined = false): the catalog matches the API snapshot (name, label, type, group), the ticket's record
// shows «Municipio» and «Vendedor solicitante» on the «Acerca de» card with their real labels and edits them
// (text, dropdown with the sellers), and «Ver todas las propiedades» lists the 4 (the two hidden «Source
// Incoming …» ones included) in «Información del ticket», editable too. Run: node scripts/smoke-ticket-custom-props.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[ticket-custom-props]', ...a);
const fail = (msg) => { console.error(`[ticket-custom-props] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
const dom = new JSDOM('<!doctype html><body class="app" data-type="tickets"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/tickets/record/?id=3' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.FormData = dom.window.FormData;
globalThis.Event = dom.window.Event;
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
dom.window.confirm = () => true;
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const $ = (id) => document.getElementById(id);
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const submit = (form) => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

// ===== 1) The catalog against the API snapshot =====
const snapshot = JSON.parse(readFileSync(resolve(here, 'hubspot-ticket-properties.snapshot.json'), 'utf8'));
const real = snapshot.properties.filter((p) => !p.hubspotDefined);
if (real.length !== 4) fail(`the snapshot must hold the 4 custom ticket properties (${real.length})`);
const CP = await import(resolve(here, '../src/custom-properties.js'));
const P = await import(resolve(here, '../src/properties.js'));
const KIND = { string: 'text', number: 'number', enumeration: 'enum' };
const seeds = CP.SEED_TICKET_PROPERTIES;
if (seeds.length !== 4 || CP.SEED_BY_TYPE.tickets !== seeds) fail('4 seeded ticket properties');
real.forEach((p) => {
  const s = seeds.find((x) => x.key === p.name);
  if (!s || s.label !== p.label || s.kind !== KIND[p.type] || s.group !== 'Información del ticket') fail(`seed for ${p.name}: ${JSON.stringify(s)}`);
});
const catalog = P.propertyMap('tickets');
real.forEach((p) => { if (!catalog[p.name] || catalog[p.name].label !== p.label || !catalog[p.name].custom || catalog[p.name].group !== 'Información del ticket' || catalog[p.name].system) fail(`catalog entry for ${p.name}`); });
if (!catalog.vendedor_solicitante.options || !catalog.vendedor_solicitante.options.includes('Sofía R.')) fail('Vendedor solicitante offers the sellers');
if (!P.HUBSPOT_CUSTOM_METADATA.tickets || !P.HUBSPOT_CUSTOM_METADATA.tickets.source_incoming_phone.hidden || !P.HUBSPOT_CUSTOM_METADATA.tickets.source_incoming_expired.hidden) fail('HubSpot metadata for the hidden ones');
const sql = readFileSync(resolve(here, '../supabase/custom-properties-tickets.sql'), 'utf8');
real.forEach((p) => { if (!sql.includes(`('ticket', '${p.name}',`) || !sql.includes(`'${p.label}'`)) fail(`migration row for ${p.name}`); });
if (!sql.includes('on conflict (objeto, name) do nothing')) fail('migration must be idempotent');
log('catalog: municipio (text), source_incoming_expired (number, hidden), source_incoming_phone (text, hidden), vendedor_solicitante (enum) = API snapshot; migration written (not applied)');

// ===== 2) The ticket's record: «Acerca de» card shows and edits them =====
const data = await import(resolve(here, '../src/data.js'));
await import(resolve(here, '../src/record.js'));
await wait(20);
const row = (key) => q(`#rec-props .props__row[data-key="${key}"]`);
if (!row('municipio') || text(row('municipio').querySelector('dt')) !== 'Municipio' || !row('vendedor_solicitante') || text(row('vendedor_solicitante').querySelector('dt')) !== 'Vendedor solicitante') fail('the card must show Municipio and Vendedor solicitante with their real labels');
if (row('source_incoming_phone') || row('source_incoming_expired')) fail('the hidden HubSpot properties stay out of the default card');
click(row('municipio').querySelector('[data-edit-key="municipio"]'));
const f1 = q('.props__form[data-key="municipio"]');
const i1 = f1 && f1.querySelector('[data-edit="municipio"]');
if (!i1 || i1.tagName !== 'INPUT') fail('Municipio editor');
i1.value = 'Monterrey';
submit(f1);
await wait(40);
if (data.findRecord('tickets', 3).municipio !== 'Monterrey' || !text(row('municipio')).includes('Monterrey')) fail('Municipio saved');
click(row('vendedor_solicitante').querySelector('[data-edit-key="vendedor_solicitante"]'));
const f2 = q('.props__form[data-key="vendedor_solicitante"]');
const s2 = f2 && f2.querySelector('[data-edit="vendedor_solicitante"]');
if (!s2 || s2.tagName !== 'SELECT' || ![...s2.options].some((o) => o.value === 'Sofía R.')) fail('Vendedor solicitante editor must be a dropdown with the sellers');
s2.value = 'Sofía R.';
submit(f2);
await wait(40);
if (data.findRecord('tickets', 3).vendedor_solicitante !== 'Sofía R.' || !text(row('vendedor_solicitante')).includes('Sofía R.')) fail('Vendedor solicitante saved');
log('record card: Municipio → «Monterrey» saved; Vendedor solicitante → «Sofía R.» saved from the dropdown');

// ===== 3) «Ver todas las propiedades»: the 4 with their real names, in their group, editable =====
click(q('[data-act="all-props-panel"]'));
if (!$('allprops-panel').classList.contains('is-open')) fail('all properties panel');
real.forEach((p) => {
  const r = q(`#allprops-groups [data-key="${p.name}"]`);
  if (!r || text(r.querySelector('dt')) !== p.label) fail(`all properties row for ${p.name}: ${r && text(r)}`);
  if (!r.querySelector(`[data-edit-key="${p.name}"]`)) fail(`${p.name} must be editable`);
});
const group = qa('#allprops-groups .propgrp').find((g) => q('[data-key="municipio"]') && g.contains(q('#allprops-groups [data-key="municipio"]')));
if (!group || !text(group).includes('Información del ticket')) fail('the properties sit in «Información del ticket»');
if (!text(q('#allprops-groups [data-key="municipio"]')).includes('Monterrey')) fail('the panel shows the saved value');
click(q('#allprops-groups [data-edit-key="source_incoming_phone"]'));
const f3 = q('#allprops-panel .props__form[data-key="source_incoming_phone"]');
if (!f3) fail('hidden property editor in the panel');
f3.querySelector('[data-edit="source_incoming_phone"]').value = '+52 81 1234 5678';
submit(f3);
await wait(40);
if (data.findRecord('tickets', 3).source_incoming_phone !== '+52 81 1234 5678') fail('Source Incoming Phone saved from the panel');
const search = $('allprops-q');
search.value = 'vendedor';
search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
if (qa('#allprops-groups .props__row').length !== 1 || !q('#allprops-groups [data-key="vendedor_solicitante"]')) fail('search finds the property by its real name');
log('all properties: the 4 appear with their real names in «Información del ticket», Source Incoming Phone edited from the panel, search works');

console.log('[ticket-custom-props] OK');
process.exit(0);
