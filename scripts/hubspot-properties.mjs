// Reads the account's real properties of one object (contacts, companies, deals, tickets) from the HubSpot
// API with the private token stored in app/.hubspot-token and prints the custom ones (hubspotDefined = false:
// name, label, group, type / field type, options). Used to keep src/properties.js aligned with the real
// account. The token never prints. Run: node scripts/hubspot-properties.mjs tickets [--all] [--json /tmp/out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const object = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'tickets';
const all = process.argv.includes('--all');
const jsonAt = process.argv.indexOf('--json');
const jsonOut = jsonAt > 0 ? process.argv[jsonAt + 1] : '';
let token = '';
try { token = readFileSync(resolve(here, '..', '.hubspot-token'), 'utf8').trim(); } catch { /* missing */ }
if (!token) { console.error('Falta app/.hubspot-token (token privado de HubSpot).'); process.exit(2); }

const results = [];
let after = '';
for (;;) {
  const url = `https://api.hubapi.com/crm/v3/properties/${object}?limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`HubSpot ${object}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const body = await r.json();
  results.push(...(body.results || []));
  after = body.paging && body.paging.next && body.paging.next.after;
  if (!after) break;
}
const pick = (p) => ({ name: p.name, label: p.label, groupName: p.groupName, type: p.type, fieldType: p.fieldType, description: p.description || '', hubspotDefined: Boolean(p.hubspotDefined), hidden: Boolean(p.hidden), archived: Boolean(p.archived), createdAt: p.createdAt || null, options: (p.options || []).map((o) => ({ label: o.label, value: o.value, displayOrder: o.displayOrder, hidden: Boolean(o.hidden) })) });
const list = results.map(pick).filter((p) => all || !p.hubspotDefined);
console.log(`== ${object}: ${results.length} propiedades, ${results.filter((p) => !p.hubspotDefined).length} personalizadas ==`);
list.forEach((p) => {
  console.log(`- ${p.name} · «${p.label}» · grupo ${p.groupName} · ${p.type}/${p.fieldType}${p.hidden ? ' · oculta' : ''}${p.archived ? ' · archivada' : ''}`);
  if (p.options.length) console.log(`    opciones: ${p.options.map((o) => `${o.label}${o.value !== o.label ? ` (${o.value})` : ''}`).join(' | ')}`);
});
if (jsonOut) { writeFileSync(jsonOut, `${JSON.stringify({ object, fetchedAt: new Date().toISOString(), total: results.length, properties: list }, null, 2)}\n`); console.log(`\nJSON escrito en ${jsonOut}`); }
