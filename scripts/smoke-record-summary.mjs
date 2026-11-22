import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/record.js', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('function recentActivityLines()'), source.indexOf('\nfunction renderLead()'));
for (const type of ['contacts', 'companies', 'deals', 'tickets']) {
  const nodes = Object.fromEntries(['ai-summary', 'ai-right', 'recent-box'].map(key => [key, {}]));
  const records = {
    1: [{ type: 'note', when: 10, text: 'Nota anterior fijada', extra: { pinned: true } }, { type: 'call', when: 20, text: 'Solicitó cotización', extra: { outcome: 'Conectado' } }],
    2: [{ type: 'email', when: 30, text: '<img src=x onerror=alert(1)> Confirmó entrega' }],
    3: [],
  };
  const context = {
    type, id: 1, rec: { id: 1, name: 'Uno' }, cfg: { title: r => r.name },
    activitiesFor: (kind, id) => { assert.equal(kind, type); return records[id].slice(); },
    allTasks: () => [], taskLinksTo: () => false,
    formatDate: String, fmtTime: String,
    KIND_TITLE: { note: 'Nota', call: 'Llamada', email: 'Correo' },
    ACT_ICONS: {}, $: key => nodes[key],
    esc: s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  };
  runInNewContext(`${functions}\nrenderAi()`, context);
  const first = nodes['recent-box'].innerHTML;
  assert.match(first, /Solicitó cotización · Resultado registrado: Conectado/);
  assert.ok(first.indexOf('Solicitó') < first.indexOf('Nota anterior'));
  context.id = 2; context.rec = { id: 2, name: 'Dos' };
  runInNewContext('renderAi()', context);
  assert.notEqual(nodes['recent-box'].innerHTML, first);
  assert.match(nodes['recent-box'].innerHTML, /Confirmó entrega/);
  assert.doesNotMatch(nodes['recent-box'].innerHTML, /<img|Solicitó/);
  context.id = 3; context.rec = { id: 3, name: 'Tres' };
  runInNewContext('renderAi()', context);
  assert.match(nodes['recent-box'].innerHTML, /Sin datos suficientes todavía/);
  assert.doesNotMatch(nodes['recent-box'].innerHTML, /visitas al sitio|Confirmó|Solicitó/);
}
assert.doesNotMatch(source, /rec\.id\) % [34]|Valora la calidad del vidrio|interacciones con tono positivo/);
assert.doesNotMatch(readFileSync(new URL('../src/list.js', import.meta.url), 'utf8'), /data-kai|Sugerencia: registrar el resultado/);
console.log('Record summaries: four modules, distinct records, chronology, empty state and escaping OK');
