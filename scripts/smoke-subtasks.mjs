import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// No credentials or remote writes: exercise the real record page in demo mode.
delete process.env.VITE_SUPABASE_URL;
delete process.env.VITE_SUPABASE_ANON_KEY;
const dom = new JSDOM('<body class="app" data-type="tasks"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/tasks/record/?id=1001' });
for (const key of ['window', 'document', 'localStorage', 'FormData', 'HTMLElement', 'location', 'URL', 'Blob']) globalThis[key] = key === 'window' ? dom.window : dom.window[key];
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const data = await import('../src/data.js');
const parent = data.addRecord('tasks', { name: 'Smoke madre', status: 'todo', type: 'Tarea', priority: 'medium', owner: 'Sin asignar' });
assert.equal(parent.id, 1001);
await import('../src/record.js');
const panel = () => document.getElementById('task-subtasks');
const count = () => panel().querySelector('.subtasks__count').textContent;
for (const name of ['Primera', 'Segunda', '<tercera>']) {
  const form = panel().querySelector('form');
  form.elements.subtask.value = name;
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
}
assert.equal(count(), '0/3');
assert.equal(data.subtasksOf(parent.id).length, 3);
assert.equal(panel().querySelector('tercera'), null);
const ids = data.subtasksOf(parent.id).map((t) => t.id);
function toggle(id, checked) {
  const checkbox = panel().querySelector(`[data-subtask="${id}"]`);
  checkbox.checked = checked;
  checkbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}
toggle(ids[0], true);
toggle(ids[1], true);
assert.equal(count(), '2/3');
assert.equal(panel().querySelector('progress').value, 2);
assert.equal(panel().querySelector('progress').max, 3);
assert.equal(data.findRecord('tasks', parent.id).status, 'todo');
assert.ok(!data.allTasks().some((t) => ids.includes(t.id)));
assert.equal(panel().querySelector('[data-complete-parent]'), null);
console.log('PASS: crear 3 subtareas, completar 2, progreso 2/3; ocultas de listas.');
toggle(ids[2], true);
assert.ok(panel().querySelector('[data-complete-parent]'));
assert.equal(data.findRecord('tasks', parent.id).status, 'todo');
toggle(ids[1], false);
assert.equal(count(), '2/3');
assert.equal(panel().querySelector('[data-complete-parent]'), null);
toggle(ids[1], true);
panel().querySelector('[data-complete-parent]').click();
assert.equal(data.findRecord('tasks', parent.id).status, 'done');
assert.equal(panel().querySelector('[data-complete-parent]'), null);
assert.equal(data.dbColumnFor('tasks', 'parentId').column, 'parent_id');
assert.equal(data.rowFromDb('tasks', { id: 9999, parent_id: parent.id }).parentId, parent.id);
data.deleteRecords('tasks', [parent.id]);
assert.equal(data.subtasksOf(parent.id).length, 0);
assert.equal(data.findRecord('tasks', ids[0]), undefined);
console.log('PASS: sugerencia explícita, reapertura, mapeo SQL y borrado en cascada.');
dom.window.close();
process.exit(0);
