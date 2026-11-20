// Reads the account's real pipelines (tickets and deals) from the HubSpot API with the private token stored in
// app/.hubspot-token and prints them (pipeline → stages in order with their probability / state). Used to keep
// Omni's seed (src/data.js) and the Supabase migrations aligned with the real account. The token never prints.
// Run: node scripts/hubspot-pipelines.mjs [tickets|deals|all] [--json /tmp/out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const what = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'all';
const jsonAt = process.argv.indexOf('--json');
const jsonOut = jsonAt > 0 ? process.argv[jsonAt + 1] : '';
let token = '';
try { token = readFileSync(resolve(here, '..', '.hubspot-token'), 'utf8').trim(); } catch { /* missing */ }
if (!token) { console.error('Falta app/.hubspot-token (token privado de HubSpot).'); process.exit(2); }

async function fetchPipelines(object) {
  const r = await fetch(`https://api.hubapi.com/crm/v3/pipelines/${object}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`HubSpot ${object}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const body = await r.json();
  return (body.results || []).sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)).map((p) => ({
    id: p.id,
    label: p.label,
    displayOrder: p.displayOrder,
    stages: (p.stages || []).sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)).map((s) => ({
      id: s.id,
      label: s.label,
      displayOrder: s.displayOrder,
      probability: s.metadata && s.metadata.probability !== undefined ? Number(s.metadata.probability) : null,
      isClosed: s.metadata ? s.metadata.isClosed === 'true' || s.metadata.isClosed === true : null,
      ticketState: s.metadata ? s.metadata.ticketState || null : null,
    })),
  }));
}

const out = {};
for (const object of what === 'all' ? ['tickets', 'deals'] : [what]) {
  out[object] = await fetchPipelines(object);
  console.log(`\n== ${object}: ${out[object].length} pipelines ==`);
  out[object].forEach((p) => {
    console.log(`\n${p.label} (id ${p.id}, orden ${p.displayOrder}) · ${p.stages.length} etapas`);
    p.stages.forEach((s, i) => console.log(`  ${i + 1}. ${s.label} [${s.id}] ${object === 'deals' ? `prob ${s.probability}` : `estado ${s.ticketState}`}${s.isClosed ? ' · cerrada' : ''}`));
  });
}
if (jsonOut) { writeFileSync(jsonOut, JSON.stringify(out, null, 2)); console.log(`\nGuardado en ${jsonOut}`); }
