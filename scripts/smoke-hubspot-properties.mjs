// Read-only DOM smoke: node scripts/smoke-hubspot-properties.mjs contacts|deals
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const type = process.argv[2] || 'contacts';
const dom = new JSDOM(`<body data-type="${type}"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>`, { url: `http://localhost/${type}/record/?id=3` });
for (const key of ['window', 'document', 'localStorage', 'FormData', 'HTMLElement', 'location']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const { HUBSPOT_CUSTOM_METADATA, propertyMap, loadCustomProperties } = await import('../src/properties.js');
// Added properties remain available even when the remote custom-properties table is empty.
loadCustomProperties([]);
const catalog = propertyMap(type);
const metadata = HUBSPOT_CUSTOM_METADATA[type];
for (const [key, meta] of Object.entries(metadata)) {
  assert.ok(catalog[key], key);
  assert.deepEqual(catalog[key].options || [], meta.options.map(o => o.value));
}
const data = await import('../src/data.js');
const sample = type === 'contacts'
  ? { satisfaccion_profesionalismo_instalador: '5', producto: 'Laminated Glass;Tempered Glass' }
  : type === 'tickets'
    ? { municipio: 'Monterrey', source_incoming_phone: '+52 81 1234 5678' }
    : { metros_cuadrados: 125, tag: 'Vidrio Templado;Vidrio laminado' };
Object.assign(data.findRecord(type, 3), sample);
await import('../src/record.js');
document.querySelector('[data-act="all-props-panel"]').click();
assert.ok(document.getElementById('allprops-panel').classList.contains('is-open'));
for (const key of Object.keys(metadata)) {
 const row = document.querySelector(`#allprops-groups [data-key="${key}"]`);
 assert.ok(row, `Missing row: ${key}`);
 assert.equal(row.querySelector('dt').textContent, catalog[key].label);
}
const expected = type === 'contacts' ? 'Excelente' : type === 'tickets' ? 'Monterrey' : '125';
assert.ok(document.getElementById('allprops-groups').textContent.includes(expected));
const search = document.getElementById('allprops-q');
search.value = Object.keys(sample)[0];
search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
assert.equal(document.querySelectorAll('#allprops-groups .props__row').length, 1);
console.log(`PASS ${type}: ${Object.keys(metadata).length} new properties visible; real option values/labels, populated display and search.`);
dom.window.close();
