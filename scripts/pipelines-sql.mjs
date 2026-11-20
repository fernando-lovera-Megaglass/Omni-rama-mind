// Generates supabase/pipeline_stages_real.sql from src/pipelines-seed.js: the real deal-stage names and
// probabilities (GET /crm/v3/pipelines/deals), the 4 real ticket pipelines with their 27 statuses and the
// remap of the tickets still saved with the sample pipelines / statuses. Idempotent SQL; apply it with
// `node scripts/apply-migration.mjs supabase/pipeline_stages_real.sql` (or paste it in the SQL Editor).
// Run: node scripts/pipelines-sql.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { REAL_DEAL_PIPELINES, REAL_TICKET_PIPELINES, LEGACY_TICKET_MAP } from '../src/pipelines-seed.js';

const here = dirname(fileURLToPath(import.meta.url));
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const lines = [];
lines.push('-- Omni CRM · etapas de negocios y pipelines de tickets alineados con el HubSpot real de la cuenta');
lines.push('-- Generado por scripts/pipelines-sql.mjs a partir de src/pipelines-seed.js (fuente: GET /crm/v3/pipelines/{deals,tickets},');
lines.push('-- instantánea en scripts/hubspot-pipelines.snapshot.json). Aplicar con: node scripts/apply-migration.mjs supabase/pipeline_stages_real.sql');
lines.push('-- Idempotente: actualiza nombres y probabilidades de las etapas de negocios existentes, crea los pipelines de tickets');
lines.push('-- que falten con sus estados, y mueve los tickets guardados con los pipelines / estados de muestra a los reales.');
lines.push('');
lines.push('-- ===== Negocios: nombre y probabilidad real de cada etapa (por pipeline + clave) =====');
lines.push('with s(pipeline, orden, clave, nombre, probabilidad) as (values');
const dealRows = [];
REAL_DEAL_PIPELINES.forEach((p) => p.stages.forEach((s, i) => dealRows.push(`  (${q(p.name)}, ${i}, ${q(s[0])}, ${q(s[1])}, ${Number(s[2]) || 0})`)));
lines.push(dealRows.join(',\n'));
lines.push(')');
lines.push('update public.pipeline_stages st set nombre = s.nombre, probabilidad = s.probabilidad, orden = s.orden');
lines.push("  from s join public.pipelines p on p.objeto = 'deal' and p.nombre = s.pipeline");
lines.push('  where st.pipeline_id = p.id and st.clave = s.clave');
lines.push('    and (st.nombre is distinct from s.nombre or st.probabilidad is distinct from s.probabilidad or st.orden is distinct from s.orden);');
lines.push('');
lines.push('-- ===== Tickets: los 4 pipelines reales (id público de HubSpot en extra.publicId) =====');
lines.push('insert into public.pipelines (objeto, nombre, orden, extra) values');
lines.push(REAL_TICKET_PIPELINES.map((p, i) => `  ('ticket', ${q(p.name)}, ${i}, '{"publicId": ${p.id}}')`).join(',\n'));
lines.push('on conflict (objeto, nombre) do nothing;');
lines.push('');
lines.push("-- Estados en orden (clave, nombre, 'open' | 'closed' en descripcion). Solo se insertan los que falten.");
lines.push('with s(pipeline, orden, clave, nombre, tipo) as (values');
const ticketRows = [];
REAL_TICKET_PIPELINES.forEach((p) => p.stages.forEach((s, i) => ticketRows.push(`  (${q(p.name)}, ${i}, ${q(s[0])}, ${q(s[1])}, ${q(s[2])})`)));
lines.push(ticketRows.join(',\n'));
lines.push(')');
lines.push('insert into public.pipeline_stages (pipeline_id, clave, nombre, probabilidad, orden, descripcion)');
lines.push("  select p.id, s.clave, s.nombre, case when s.tipo = 'closed' then 100 else 0 end, s.orden, s.tipo");
lines.push("  from s join public.pipelines p on p.objeto = 'ticket' and p.nombre = s.pipeline");
lines.push('on conflict (pipeline_id, clave) do update set nombre = excluded.nombre, orden = excluded.orden, descripcion = excluded.descripcion;');
lines.push('');
lines.push('-- ===== Tickets guardados con los pipelines / estados de muestra → los reales =====');
Object.entries(LEGACY_TICKET_MAP.pipelines).forEach(([oldName, newName]) => {
  const def = REAL_TICKET_PIPELINES.find((p) => p.name === newName);
  const open = def.stages.filter((s) => s[2] !== 'closed');
  const closed = def.stages.filter((s) => s[2] === 'closed');
  const pick = (i) => open[Math.min(i, open.length - 1)][0];
  lines.push(`update public.tickets set pipeline = ${q(newName)}, status = case status`);
  Object.entries(LEGACY_TICKET_MAP.statuses).forEach(([legacy, i]) => lines.push(`    when ${q(legacy)} then ${q(pick(i))}`));
  lines.push(`    when 'closed' then ${q((closed[0] || def.stages[def.stages.length - 1])[0])}`);
  lines.push(`    when ${def.stages.map((s) => q(s[0])).join(', ')} then status`);
  lines.push(`    else ${q(open[0][0])} end`);
  lines.push(`  where pipeline = ${q(oldName)};`);
});
lines.push('');
const out = resolve(here, '..', 'supabase', 'pipeline_stages_real.sql');
writeFileSync(out, `${lines.join('\n')}\n`);
console.log(`Escrito ${out}: ${dealRows.length} etapas de negocios, ${REAL_TICKET_PIPELINES.length} pipelines de tickets con ${ticketRows.length} estados.`);
