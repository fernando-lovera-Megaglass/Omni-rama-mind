// Local regression; no credentials or network required.
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
delete process.env.VITE_SUPABASE_URL;
delete process.env.VITE_SUPABASE_ANON_KEY;
const dom = new JSDOM('', { url: 'http://localhost/contacts/' });
for (const key of ['window', 'document', 'localStorage', 'location']) globalThis[key] = dom.window[key];
const data = await import('../src/data.js');
const { propertyMap } = await import('../src/properties.js');
const { evalCondition } = await import('../src/filter-ops.js');
const RealDate = Date;
let now = new RealDate('2026-11-21T15:00:00Z').getTime();
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
};
try {
  const id = data.allContacts()[0].id;
  const key = 'hs_lifecyclestage_customer_date';
  const read = () => data.findRecord('contacts', id);
  data.setField('contacts', id, 'lifecycle', 'Otro');
  const historyBefore = data.activitiesFor('contacts', id).length;
  for (const [stageId, label] of data.defaultLifecycleDef().stages.filter(s => s[0] !== 'other')) {
    now += 1000;
    data.setField('contacts', id, 'lifecycle', label);
    const prop = `hs_lifecyclestage_${stageId}_date`;
    assert.equal(read()[prop], new Date().toISOString());
    assert.equal(propertyMap('contacts')[prop].kind, 'datetime');
    assert.deepEqual(data.dbColumnFor('contacts', prop), { column: `extra->>${prop}`, json: true });
  }
  data.setField('contacts', id, 'lifecycle', 'Cliente');
  const first = read()[key];
  now += 60000;
  data.setField('contacts', id, 'lifecycle', 'Cliente');
  assert.equal(read()[key], first, 'saving the same stage is not a new entry');
  data.setField('contacts', id, 'lifecycle', 'Lead');
  assert.equal(read()[key], first, 'leaving preserves the previous conversion');
  data.setField('contacts', id, 'lifecycle', 'Cliente');
  assert.equal(read()[key], new Date().toISOString());
  assert.notEqual(read()[key], first, 'same-day re-entry updates the timestamp');
  assert.equal(evalCondition({ op: 'on', value: '2026-11-21' }, { date: new Date(read()[key]).getTime() }), true);
  const last = read()[key];
  data.setField('contacts', id, 'lifecycle', 'Otro');
  assert.equal(read()[key], last);
  assert.equal(read().hs_lifecyclestage_other_date, undefined);
  assert.equal(data.activitiesFor('contacts', id).length, historyBefore, 'derived updates add no duplicate events');
  const reloaded = await import('../src/data.js?lifecycle-reload');
  assert.equal(reloaded.findRecord('contacts', id)[key], last, 'conversion survives reload');
  const company = data.allCompanies()[0];
  const before = company[key];
  data.setField('companies', company.id, 'lifecycle', 'Cliente');
  assert.equal(data.findRecord('companies', company.id)[key], before);
  console.log('PASS: seven conversions, latest re-entry, unchanged stage, Otro, contact-only, reload, date filter and extra mapping; no duplicate history.');
} finally {
  globalThis.Date = RealDate;
  dom.window.close();
}
