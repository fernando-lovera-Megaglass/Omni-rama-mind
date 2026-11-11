// One-off: spread the seeded sample tickets (ids 1..84, all created in "Pipeline de soporte") across the
// default ticket pipelines, exactly as the demo generator does, so the pipeline selector has something to show.
// Tickets created by hand (ids above the seed range) or already moved to another pipeline are left alone.
// Run: node --env-file=.env scripts/migrate-ticket-pipelines.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) { console.error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (usa node --env-file=.env).'); process.exit(1); }
const sb = createClient(url, key);
const PIPELINES = ['Pipeline de soporte', 'Cotizaciones', 'Garantías', 'Instalaciones'];
const SEEDED = 84;
const pipelineFor = (i) => PIPELINES[[0, 0, 1, 2, 0, 1, 3][i % 7]];

const { data, error } = await sb.from('tickets').select('id,pipeline').lte('id', SEEDED).order('id');
if (error) { console.error('No se pudieron leer los tickets:', error.message); process.exit(1); }
const changes = data.filter((r) => (r.pipeline || 'Pipeline de soporte') === 'Pipeline de soporte').map((r) => ({ id: r.id, pipeline: pipelineFor(r.id - 1) })).filter((c) => c.pipeline !== 'Pipeline de soporte');
console.log(`Tickets de muestra: ${data.length} · a mover: ${changes.length}`);
let done = 0;
for (const c of changes) {
  const { error: e } = await sb.from('tickets').update({ pipeline: c.pipeline }).eq('id', c.id);
  if (e) console.error('Error en el ticket', c.id, e.message);
  else done += 1;
}
const { data: after } = await sb.from('tickets').select('pipeline');
const counts = {};
(after || []).forEach((r) => { counts[r.pipeline || '(vacío)'] = (counts[r.pipeline || '(vacío)'] || 0) + 1; });
console.log(`Actualizados: ${done} · tickets por pipeline:`, JSON.stringify(counts));
