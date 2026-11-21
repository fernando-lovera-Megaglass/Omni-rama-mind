// Verifies, with read-only SQL through the Management API (token in app/.supabase-mgmt-token, never printed),
// that the project's pipelines / pipeline_stages hold the account's REAL deal stages (names, probabilities,
// order) and the 4 real ticket pipelines (names, statuses, open/closed) of scripts/hubspot-pipelines.snapshot.json
// — i.e. that supabase/pipeline_stages_real.sql took effect. With --apply it runs the (idempotent) migration
// when something is missing and verifies again; with --record it writes the outcome into
// scripts/applied-migrations.json. Exit code 0 only when everything matches.
// Run: node scripts/verify-pipelines-migration.mjs [--apply] [--record]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, basename } from 'node:path';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = 'supabase/pipeline_stages_real.sql';
export const QUERY = "select p.objeto, p.nombre as pipeline, p.orden as pipeline_orden, s.orden, s.clave, s.nombre, s.probabilidad, s.descripcion from public.pipelines p left join public.pipeline_stages s on s.pipeline_id = p.id order by p.objeto, p.orden, s.orden";

// Compares the rows of the query above with the HubSpot snapshot. Returns { ok, problems, summary }.
export function compareWithSnapshot(rows, snapshot) {
  const problems = [];
  const byObject = { deal: new Map(), ticket: new Map() };
  (rows || []).forEach((r) => {
    const m = byObject[r.objeto];
    if (!m) return;
    if (!m.has(r.pipeline)) m.set(r.pipeline, []);
    if (r.clave !== null && r.clave !== undefined) m.get(r.pipeline).push({ orden: Number(r.orden), clave: r.clave, nombre: r.nombre, probabilidad: Number(r.probabilidad), descripcion: r.descripcion || '' });
  });
  const sorted = (list) => [...list].sort((a, b) => a.orden - b.orden);
  const pct = (p) => (p === null || p === undefined ? null : Math.round(Number(p) * 100));
  // HubSpot's raw labels sometimes end with a space («Cierre de obra »); the seed and the migration store them
  // trimmed, so names are compared trimmed on both sides.
  const name = (s) => String(s ?? '').trim();
  const find = (m, label) => m.get(name(label)) || [...m.entries()].find(([k]) => name(k) === name(label))?.[1];
  // deals: every real pipeline, its stages in order with the real name and probability
  const deals = snapshot.deals || [];
  deals.forEach((p) => {
    const db = find(byObject.deal, p.label);
    if (!db) { problems.push(`negocios: falta el pipeline «${name(p.label)}»`); return; }
    const got = sorted(db);
    const want = [...p.stages].sort((a, b) => a.displayOrder - b.displayOrder);
    if (got.length !== want.length) problems.push(`negocios «${name(p.label)}»: ${got.length} etapas en la base, ${want.length} en HubSpot`);
    want.forEach((s, i) => {
      const g = got[i];
      if (!g) return;
      if (name(g.nombre) !== name(s.label)) problems.push(`negocios «${name(p.label)}» etapa ${i + 1}: «${name(g.nombre)}» en la base, «${name(s.label)}» en HubSpot`);
      if (pct(s.probability) !== null && g.probabilidad !== pct(s.probability)) problems.push(`negocios «${name(p.label)}» «${name(s.label)}»: probabilidad ${g.probabilidad} en la base, ${pct(s.probability)} en HubSpot`);
    });
  });
  [...byObject.deal.keys()].filter((n) => !deals.some((p) => name(p.label) === name(n))).forEach((n) => problems.push(`negocios: el pipeline «${name(n)}» no existe en HubSpot`));
  // tickets: the 4 real pipelines with their statuses in order and open / closed state
  const tickets = snapshot.tickets || [];
  if (byObject.ticket.size !== tickets.length) problems.push(`tickets: ${byObject.ticket.size} pipelines en la base, ${tickets.length} en HubSpot`);
  tickets.forEach((p) => {
    const db = find(byObject.ticket, p.label);
    if (!db) { problems.push(`tickets: falta el pipeline «${name(p.label)}»`); return; }
    const got = sorted(db);
    const want = [...p.stages].sort((a, b) => a.displayOrder - b.displayOrder);
    if (got.length !== want.length) problems.push(`tickets «${name(p.label)}»: ${got.length} estados en la base, ${want.length} en HubSpot`);
    want.forEach((s, i) => {
      const g = got[i];
      if (!g) return;
      if (name(g.nombre) !== name(s.label)) problems.push(`tickets «${name(p.label)}» estado ${i + 1}: «${name(g.nombre)}» en la base, «${name(s.label)}» en HubSpot`);
      const state = s.ticketState === 'CLOSED' || s.isClosed ? 'closed' : 'open';
      if ((g.descripcion || 'open') !== state) problems.push(`tickets «${name(p.label)}» «${name(s.label)}»: ${g.descripcion || 'open'} en la base, ${state} en HubSpot`);
    });
  });
  const summary = {
    deals: { pipelines: byObject.deal.size, stages: [...byObject.deal.values()].reduce((n, l) => n + l.length, 0), expectedPipelines: deals.length, expectedStages: deals.reduce((n, p) => n + p.stages.length, 0) },
    tickets: { pipelines: byObject.ticket.size, stages: [...byObject.ticket.values()].reduce((n, l) => n + l.length, 0), expectedPipelines: tickets.length, expectedStages: tickets.reduce((n, p) => n + p.stages.length, 0) },
  };
  return { ok: problems.length === 0, problems, summary };
}

export function recordResult(result, { applied = false } = {}) {
  const file = resolve(here, 'applied-migrations.json');
  let log = {};
  try { log = JSON.parse(readFileSync(file, 'utf8')); } catch { /* new */ }
  const prev = log[basename(MIGRATION)] || {};
  const now = new Date().toISOString();
  const entry = { ...prev, status: result.ok ? 'aplicada' : prev.status || 'pendiente' };
  if (applied) entry.at = now;
  entry.verificada = result.ok ? now : null;
  entry.verificacion = result.ok
    ? `SQL ${now.slice(0, 10)}: ${result.summary.deals.pipelines} pipelines de negocios / ${result.summary.deals.stages} etapas y ${result.summary.tickets.pipelines} pipelines de tickets / ${result.summary.tickets.stages} estados iguales a scripts/hubspot-pipelines.snapshot.json (nombres, probabilidades, orden, abierto/cerrado).`
    : `SQL ${now.slice(0, 10)}: ${result.problems.length} diferencias con la instantánea (ver node scripts/verify-pipelines-migration.mjs).`;
  log[basename(MIGRATION)] = entry;
  writeFileSync(file, `${JSON.stringify(log, null, 2)}\n`);
  return entry;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { runSql, hasMgmtToken } = await import('./mgmt-sql.mjs');
  const apply = process.argv.includes('--apply');
  const record = process.argv.includes('--record');
  if (!hasMgmtToken()) { console.error('Falta app/.supabase-mgmt-token: no se puede verificar en el proyecto.'); process.exit(2); }
  const snapshot = JSON.parse(readFileSync(resolve(here, 'hubspot-pipelines.snapshot.json'), 'utf8'));
  const verify = async () => compareWithSnapshot(await runSql(QUERY), snapshot);
  let result = await verify();
  let applied = false;
  const show = (r) => {
    const d = r.summary.deals; const t = r.summary.tickets;
    console.log(`[verificación] negocios: ${d.pipelines}/${d.expectedPipelines} pipelines, ${d.stages}/${d.expectedStages} etapas · tickets: ${t.pipelines}/${t.expectedPipelines} pipelines, ${t.stages}/${t.expectedStages} estados`);
    r.problems.forEach((p) => console.log(`  ✗ ${p}`));
    console.log(r.ok ? '[verificación] OK: etapas, probabilidades y pipelines de tickets iguales a HubSpot.' : `[verificación] ${r.problems.length} diferencias.`);
  };
  show(result);
  if (!result.ok && apply) {
    console.log(`[verificación] aplicando ${MIGRATION} (idempotente)…`);
    const r = spawnSync(process.execPath, [resolve(here, 'apply-migration.mjs'), MIGRATION], { stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status || 1);
    applied = true;
    result = await verify();
    show(result);
  }
  if (record) { const entry = recordResult(result, { applied }); console.log(`[verificación] registrado en scripts/applied-migrations.json: ${JSON.stringify(entry)}`); }
  process.exit(result.ok ? 0 : 1);
}
