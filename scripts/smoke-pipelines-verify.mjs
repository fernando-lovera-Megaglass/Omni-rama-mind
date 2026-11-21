// Smoke test for scripts/verify-pipelines-migration.mjs: the comparison between the project's pipelines /
// pipeline_stages rows and the HubSpot snapshot passes when the rows carry the real names, probabilities,
// order and ticket states (the rows are built from the snapshot itself, as pipeline_stages_real.sql writes
// them), and reports each kind of drift: a missing ticket pipeline, a sample probability, a renamed stage, a
// wrong open/closed state. Nothing touches the project. Run: node scripts/smoke-pipelines-verify.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[pipelines-verify]', ...a);
const fail = (msg) => { console.error(`[pipelines-verify] FAIL: ${msg}`); process.exit(1); };
const { compareWithSnapshot, QUERY } = await import(resolve(here, 'verify-pipelines-migration.mjs'));
const snapshot = JSON.parse(readFileSync(resolve(here, 'hubspot-pipelines.snapshot.json'), 'utf8'));
if (!/from public\.pipelines p left join public\.pipeline_stages s/.test(QUERY) || /update|insert|delete/i.test(QUERY)) fail('the verification query must be a read-only join');

// rows as the migration leaves them (stage names = HubSpot labels, probabilities in percent, order = displayOrder)
const rowsFrom = (snap) => {
  const out = [];
  snap.deals.forEach((p, pi) => [...p.stages].sort((a, b) => a.displayOrder - b.displayOrder).forEach((s, i) => out.push({ objeto: 'deal', pipeline: p.label, pipeline_orden: pi, orden: i, clave: `k${i}`, nombre: s.label, probabilidad: String(Math.round(Number(s.probability) * 100)), descripcion: '' })));
  snap.tickets.forEach((p, pi) => [...p.stages].sort((a, b) => a.displayOrder - b.displayOrder).forEach((s, i) => out.push({ objeto: 'ticket', pipeline: p.label, pipeline_orden: pi, orden: i, clave: `t${i}`, nombre: s.label, probabilidad: s.ticketState === 'CLOSED' ? '100' : '0', descripcion: s.ticketState === 'CLOSED' ? 'closed' : 'open' })));
  return out;
};
const good = compareWithSnapshot(rowsFrom(snapshot), snapshot);
if (!good.ok || good.problems.length) fail(`rows built from the snapshot must match: ${good.problems.join(' | ')}`);
if (good.summary.deals.pipelines !== 8 || good.summary.deals.stages !== 65 || good.summary.tickets.pipelines !== 4 || good.summary.tickets.stages !== 27) fail(`summary: ${JSON.stringify(good.summary)}`);
log(`matching rows: ${good.summary.deals.pipelines} deal pipelines / ${good.summary.deals.stages} stages, ${good.summary.tickets.pipelines} ticket pipelines / ${good.summary.tickets.stages} statuses → OK`);

// drift 1: the ticket pipelines were never created (only the sample ones exist)
const noTickets = rowsFrom(snapshot).filter((r) => r.objeto !== 'ticket').concat([{ objeto: 'ticket', pipeline: 'Pipeline de soporte', pipeline_orden: 0, orden: 0, clave: 'new', nombre: 'Nuevo', probabilidad: '0', descripcion: 'open' }]);
const r1 = compareWithSnapshot(noTickets, snapshot);
if (r1.ok || !r1.problems.some((p) => p.includes('tickets: 1 pipelines en la base, 4 en HubSpot')) || !r1.problems.some((p) => p.includes('falta el pipeline «Cotizaciones Kafer»'))) fail(`missing ticket pipelines: ${r1.problems.join(' | ')}`);
// drift 2: a sample probability left on a deal stage
const sampleProb = rowsFrom(snapshot).map((r) => (r.pipeline === 'SACA SUMINISTRO' && r.nombre === 'Entrega de presupuesto' ? { ...r, probabilidad: '50' } : r));
const r2 = compareWithSnapshot(sampleProb, snapshot);
if (r2.ok || !r2.problems.some((p) => p.includes('«Entrega de presupuesto»: probabilidad 50 en la base, 20 en HubSpot'))) fail(`probability drift: ${r2.problems.join(' | ')}`);
// drift 3: a stage name not aligned («coreo» is what HubSpot literally says)
const renamed = rowsFrom(snapshot).map((r) => (r.nombre === 'Contacto concretado (llamada, coreo, visita)' ? { ...r, nombre: 'Contacto concretado (llamada, correo, visita)' } : r));
const r3 = compareWithSnapshot(renamed, snapshot);
if (r3.ok || !r3.problems.some((p) => p.includes('«Contacto concretado (llamada, correo, visita)» en la base, «Contacto concretado (llamada, coreo, visita)» en HubSpot'))) fail(`name drift: ${r3.problems.join(' | ')}`);
// drift 4: a closed ticket status stored as open
const wrongState = rowsFrom(snapshot).map((r) => (r.objeto === 'ticket' && r.nombre === 'Modificación de cotización' ? { ...r, descripcion: 'open' } : r));
const r4 = compareWithSnapshot(wrongState, snapshot);
if (r4.ok || !r4.problems.some((p) => p.includes('«Modificación de cotización»: open en la base, closed en HubSpot'))) fail(`state drift: ${r4.problems.join(' | ')}`);
log('drift detected: missing ticket pipelines, sample probability, renamed stage, wrong open/closed state');
console.log('[pipelines-verify] OK');
