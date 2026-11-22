// Backfill for the frozen enrolments: every `active` enrolment whose next_step_at is already past gets a new,
// staggered future next_step_at (one every few minutes, weekdays only, UTC) so the processor, once deployed,
// works through them gradually instead of in one burst. Anything else is never touched: terminal statuses
// (replied, meeting, bounced, unsubscribed, finished, unenrolled), paused ones, active ones with a future date and
// active ones waiting for a task (next_step_at null).
//
// Rows come from a JSON file or from the project through the Management API with one read-only SELECT:
//   node scripts/sequence-backfill.mjs --from-json rows.json [--start 2026-11-24T09:00:00Z] [--spacing 5] [--sql | --out file.sql]
//   node scripts/sequence-backfill.mjs --from-db [--out /tmp/sequence-backfill.sql]
// --from-db uses app/.supabase-mgmt-token through scripts/mgmt-sql.mjs (never printed) and only reads.
// The plan goes to stdout; the SQL to --out <file> (or to stdout with --sql). NOTHING is written to the database
// unless --apply AND --yes are both given and scripts/applied-migrations.json marks sequence-process.sql as
// applied. Each UPDATE keeps its own guard (status still active, date still overdue at generation time), so
// running the SQL twice changes nothing the second time.
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const TERMINAL = ['replied', 'meeting', 'bounced', 'unsubscribed', 'finished', 'unenrolled'];
const MIN = 60_000;
const iso = (d) => new Date(d).toISOString();
// Saturdays and Sundays (UTC) move forward to Monday at the same time, like the processor's working days.
export function shiftWeekend(date) {
  const d = new Date(date);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}
// Default start: at least 15 minutes ahead, on a 5-minute boundary, on a weekday.
export function defaultStart(now) {
  const t = new Date(now).getTime() + 15 * MIN;
  return shiftWeekend(new Date(Math.ceil(t / (5 * MIN)) * 5 * MIN));
}
// rows: [{ id, status, current_step, next_step_at, contact_name?, sequence_id? }] (as selected from sequence_enrollments).
export function planBackfill(rows, { now = new Date(), start = null, spacingMinutes = 5 } = {}) {
  const at = new Date(now);
  const first = start ? shiftWeekend(new Date(start)) : defaultStart(at);
  if (Number.isNaN(first.getTime())) throw new Error('Invalid --start');
  const spacing = Math.max(1, Number(spacingMinutes) || 5) * MIN;
  const untouched = { terminal: {}, paused: 0, activeFuture: 0, activeWaiting: 0, other: {} };
  const frozen = [];
  for (const r of rows) {
    const status = String(r.status || '');
    if (TERMINAL.includes(status)) { untouched.terminal[status] = (untouched.terminal[status] || 0) + 1; continue; }
    if (status === 'paused') { untouched.paused += 1; continue; }
    if (status !== 'active') { untouched.other[status] = (untouched.other[status] || 0) + 1; continue; }
    if (r.next_step_at === null || r.next_step_at === undefined || r.next_step_at === '') { untouched.activeWaiting += 1; continue; }
    const due = new Date(r.next_step_at);
    if (Number.isNaN(due.getTime())) throw new Error(`Bad next_step_at on ${r.id}`);
    if (due.getTime() > at.getTime()) { untouched.activeFuture += 1; continue; }
    frozen.push({ ...r, oldAt: iso(due) });
  }
  untouched.terminal = Object.fromEntries(TERMINAL.filter((s) => untouched.terminal[s]).map((s) => [s, untouched.terminal[s]])); // stable order in the plan
  frozen.sort((a, b) => new Date(a.oldAt) - new Date(b.oldAt) || String(a.id).localeCompare(String(b.id)));
  const reschedule = frozen.map((r, i) => ({ id: r.id, sequence_id: r.sequence_id, contact_name: r.contact_name || '', current_step: r.current_step, oldAt: r.oldAt, newAt: iso(shiftWeekend(new Date(first.getTime() + i * spacing))) }));
  return { generatedAt: iso(at), start: iso(first), spacingMinutes: spacing / MIN, reschedule, untouched, total: rows.length };
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
// The SQL: one guarded UPDATE per enrolment inside a transaction, plus the verification query.
export function renderSql(plan) {
  const lines = [
    `-- Backfill de inscripciones congeladas de secuencias · generado ${plan.generatedAt} · ${plan.reschedule.length} filas`,
    `-- Reprograma solo inscripciones 'active' cuyo next_step_at seguía vencido al generar este archivo; las demás no se tocan.`,
    `-- Inicio ${plan.start}, una cada ${plan.spacingMinutes} min, solo días laborables (UTC). Repetirlo no cambia nada.`,
    'begin;',
  ];
  for (const r of plan.reschedule) {
    lines.push(`update public.sequence_enrollments set next_step_at = ${q(r.newAt)}, updated_at = now()`);
    lines.push(`  where id = ${q(r.id)} and status = 'active' and next_step_at <= ${q(plan.generatedAt)};  -- paso ${r.current_step} · antes ${r.oldAt}${r.contact_name ? ` · ${r.contact_name.replace(/[\r\n]+/g, ' ')}` : ''}`);
  }
  lines.push('commit;');
  lines.push('-- Verificación: select status, count(*), min(next_step_at), max(next_step_at) from public.sequence_enrollments group by 1 order by 1;');
  return `${lines.join('\n')}\n`;
}
export function renderPlan(plan) {
  const out = [`[backfill] ${plan.total} inscripciones leídas · ${plan.reschedule.length} activas congeladas a reprogramar desde ${plan.start} cada ${plan.spacingMinutes} min (días laborables UTC)`];
  const t = Object.entries(plan.untouched.terminal).map(([k, v]) => `${k} ${v}`).join(', ');
  out.push(`[backfill] sin tocar: terminales (${t || 'ninguna'}) · en pausa ${plan.untouched.paused} · activas con fecha futura ${plan.untouched.activeFuture} · activas esperando tarea ${plan.untouched.activeWaiting}${Object.keys(plan.untouched.other).length ? ` · otros estados ${JSON.stringify(plan.untouched.other)}` : ''}`);
  plan.reschedule.forEach((r, i) => out.push(`  ${String(i + 1).padStart(3)}. ${r.id}  paso ${r.current_step}  ${r.oldAt} → ${r.newAt}  ${r.contact_name}`.trimEnd()));
  return out.join('\n');
}
export const SELECT_ROWS = 'select id, sequence_id, contact_name, status, current_step, next_step_at from public.sequence_enrollments order by next_step_at nulls last, id';

export async function main(argv = process.argv.slice(2), { log = console.log, now = new Date() } = {}) {
  const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? String(argv[i + 1] || '') : ''; };
  let rows;
  if (flag('--from-json')) rows = JSON.parse(readFileSync(resolve(flag('--from-json')), 'utf8'));
  else if (argv.includes('--from-db')) {
    const { runSql } = await import('./mgmt-sql.mjs');
    rows = await runSql(SELECT_ROWS);
  } else throw new Error('Indica --from-json <archivo> o --from-db');
  if (!Array.isArray(rows)) throw new Error('Las filas deben ser una lista');
  const plan = planBackfill(rows, { now, start: flag('--start') || null, spacingMinutes: flag('--spacing') || 5 });
  const sql = renderSql(plan);
  log(renderPlan(plan));
  if (flag('--out')) { writeFileSync(resolve(flag('--out')), sql); log(`[backfill] SQL escrito en ${resolve(flag('--out'))}`); }
  if (argv.includes('--sql')) log(sql);
  if (argv.includes('--apply')) {
    if (!plan.reschedule.length) { log('[backfill] nada que aplicar.'); return { plan, applied: false }; }
    if (!argv.includes('--yes')) throw new Error('--apply requiere también --yes (revisa antes el plan o el SQL de --out)');
    let registry = {};
    try { registry = JSON.parse(readFileSync(resolve(here, 'applied-migrations.json'), 'utf8')); } catch { /* no registry */ }
    if (registry['sequence-process.sql']?.status !== 'aplicada') throw new Error('sequence-process.sql no figura como aplicada en scripts/applied-migrations.json: aplica primero la migración (runbook en docs/sequence-process.md)');
    const { runSql } = await import('./mgmt-sql.mjs');
    await runSql(sql);
    log(`[backfill] aplicado: ${plan.reschedule.length} inscripciones reprogramadas.`);
    return { plan, applied: true };
  }
  return { plan, applied: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  try { await main(); } catch (e) { console.error(`[backfill] ${e.message}`); process.exitCode = 1; }
}
