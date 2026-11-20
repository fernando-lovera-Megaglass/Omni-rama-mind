import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const dom = new JSDOM('<body></body>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
await import('../src/filter-chip.js');
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
for (const owner of [false, true]) {
  document.body.innerHTML = `<filter-chip id="test" aria-label="Filtro" ${owner ? 'owner' : ''}><template><option value="">Cualquiera</option><option value="0" selected>Hoy</option><optgroup label="Equipo"><option value="Ana &amp; Luis">Ana &amp; Luis</option></optgroup></template></filter-chip>`;
  const chip = document.getElementById('test');
  const events = [];
  document.body.onchange = (e) => events.push([e.target.id, e.target.value]);
  assert.equal(chip.value, '0');
  assert.match(chip.querySelector('.qchip').textContent, /Hoy/);
  assert.equal(chip.querySelector('select'), null);
  click(chip.querySelector('.qchip'));
  assert.equal(chip.querySelector('.qchip').getAttribute('aria-expanded'), 'true');
  if (owner) {
    assert.ok(chip.querySelector('.osel__opt .avatar'));
    const search = chip.querySelector('input');
    search.value = 'Ana';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(chip.querySelector('[data-value="0"]').hidden, true);
  }
  click(chip.querySelector('[data-value="Ana & Luis"]'));
  assert.equal(chip.value, 'Ana & Luis');
  assert.equal(chip.querySelector('[aria-selected="true"]').dataset.value, 'Ana & Luis');
  click(chip.querySelector('.qchip__x'));
  assert.equal(chip.value, '');
  assert.deepEqual(events, [['test', 'Ana & Luis'], ['test', '']]);
  chip.value = '0';
  chip.value = '';
  assert.equal(chip.querySelector('.qchip__x'), null);
  chip.innerHTML = '<template><option value="">Cualquiera</option><option value="new">Nuevo</option></template>';
  chip.value = 'new';
  assert.match(chip.querySelector('.qchip').textContent, /Nuevo/);
  click(chip.querySelector('.qchip'));
  click(document.body);
  assert.equal(chip.classList.contains('is-open'), false);
}
for (const [file, ids] of Object.entries({ inbox: ['inbox-status', 'inbox-channel'], record: ['act-date', 'act-who'], automation: ['wf-status', 'wf-object', 'wf-creator', 'wf-folder', 'wf-created', 'wf-action'], templates: ['tpl-owner'], sequences: ['seq-owner'] })) {
  const source = readFileSync(new URL(`../src/${file}.js`, import.meta.url), 'utf8');
  for (const id of ids) {
    assert.ok(source.includes(`<filter-chip id="${id}"`));
    assert.ok(!source.includes(`<select id="${id}"`));
  }
}
console.log('Filter chips: selection, clearing, avatars, search, dynamic options and all 12 integrations passed.');
