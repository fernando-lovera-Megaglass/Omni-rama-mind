import assert from 'node:assert/strict';
import { recordAccessHtml } from '../src/record-access.js';
const values = {
  'crm:users': [
    { name: 'Ana', email: 'ana@example.test', team: 'Acristala', role: 'Usuario', status: 'Activo' },
    { name: 'Luis', email: 'luis@example.test', team: 'Sistemas', role: 'Superadministrador', status: 'Activo' },
    { name: 'Baja', role: 'Administrador', status: 'Desactivado' },
    { name: 'Pendiente', role: 'Administrador', status: 'Invitación pendiente' },
  ],
};
const storage = { getItem: (k) => JSON.stringify(values[k] ?? null) };
for (const type of ['contacts', 'companies', 'deals', 'tickets']) {
  const a = recordAccessHtml({ type, owner: 'Ana' }, storage);
  const b = recordAccessHtml({ type, owner: 'Luis' }, storage);
  assert.notEqual(a, b);
  assert.match(a, /Ana<\/span><\/span><\/td><td>Acristala/);
  assert.match(b, /Luis<\/span><\/span><\/td><td>Sistemas<\/td><td>Propietario/);
  assert.equal((b.match(/class="owner__name">Luis<\/span>/g) || []).length, 1);
  assert.doesNotMatch(a, /Sofía|Ventas Norte|Ventas Sur|Baja|Pendiente/);
}
values['crm:teams'] = [];
assert.doesNotMatch(recordAccessHtml({ owner: 'Ana' }, storage), /Acristala/);
values['crm:users'] = [];
assert.match(recordAccessHtml({ owner: 'Persona real' }, storage), /Persona real/);
assert.doesNotMatch(recordAccessHtml({ owner: 'Sin asignar' }, storage), /<tr>/);
assert.match(recordAccessHtml({ owner: '<img>' }, storage), /&lt;img&gt;/);
assert.doesNotMatch(recordAccessHtml({}, { getItem: () => '{' }), /<tr>/);
console.log('PASS: owners, administrators, teams, missing data and escaping across all four record types');
