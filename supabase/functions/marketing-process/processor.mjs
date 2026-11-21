// Runtime-independent orchestration of the scheduled marketing e-mails, shared by the Edge Function and the local
// PGlite smoke test (scripts/smoke-marketing-process.mjs). Same shape as sequence-process/processor.mjs.
//
// For every due campaign (estado 'programado', programado_para in the past) it claims the run, resolves the
// recipients, picks the sender account and sends one message per recipient. Every recipient index is reserved in
// the database BEFORE the external send, so a crash never sends the same message twice (at most one attempt per
// recipient; a lost reply counts as not delivered and is visible in marketing_email_runs.failed/last_error).
// Limits: `perRun` messages per invocation and `daily` per UTC day across campaigns (Gmail caps sending per day),
// plus an optional pause between messages. When a campaign does not fit in the budget the run is left 'partial'
// and the next tick continues from next_index; the campaign only becomes 'enviado' when every recipient was tried.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const DEFAULT_LIMITS = { perRun: 50, daily: 400, pauseMs: 0 };

export function noRecipientsMessage(email) {
  const d = (email && email.destinatarios) || {};
  if (Array.isArray(d.ids)) return 'La instantánea de destinatarios no tiene contactos con correo';
  if (d.kind === 'segment') return 'Segmento activo sin instantánea de destinatarios: vuelve a programar el correo desde la app';
  return 'No hay contactos con correo';
}

export async function processDue(store, send, now = new Date(), limits = {}) {
  const { perRun, daily, pauseMs } = { ...DEFAULT_LIMITS, ...limits };
  const results = [];
  let budget = Math.min(perRun, Math.max(0, daily - (await store.sentToday(now))));
  for (const candidate of await store.due(now.toISOString())) {
    if (budget <= 0) { results.push({ id: candidate.id, status: 'deferred' }); continue; }
    const email = await store.claim(candidate.id);
    if (!email) continue;
    try {
      const run = await store.run(email.id);
      const people = await store.recipients(email.id);
      if (!people.length) throw new Error(noRecipientsMessage(email));
      const sender = await store.sender(email);
      let i = Number(run.next_index) || 0;
      let stopped = false;
      while (i < people.length && budget > 0) {
        // Reserve the index first: a crash between here and `progress` loses at most this one message, never duplicates it.
        if (!(await store.reserve(email, i + 1))) { stopped = true; break; }
        const person = people[i];
        try {
          const receipt = await send(email, sender, person);
          await store.progress(email, i + 1, true, null, person, receipt);
        } catch (error) {
          await store.progress(email, i + 1, false, String(error.message || error), person, null);
        }
        i++;
        budget--;
        if (pauseMs && i < people.length && budget > 0) await sleep(pauseMs);
      }
      const status = await store.finish(email, !stopped && i >= people.length ? 'done' : 'partial');
      results.push({ id: email.id, status, processed: i, total: people.length });
    } catch (error) {
      const message = String(error.message || error);
      results.push({ id: email.id, status: await store.finish(email, 'error', message), error: message });
    }
  }
  return results;
}
