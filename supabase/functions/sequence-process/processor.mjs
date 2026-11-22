// Runtime-independent orchestration, used by the Edge Function and the local smoke test.
export function nextDate(now, delay) {
  const date = new Date(now);
  const days = Number(delay);
  if (!Number.isInteger(days) || days < 0 || days > 3650) throw new Error('Invalid delay_days');
  for (let left = days; left > 0;) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (![0, 6].includes(date.getUTCDay())) left--;
  }
  // Zero-day steps run on the following scheduler tick, never in a catch-up burst.
  if (!days) date.setTime(date.getTime() + 60_000);
  return date.toISOString();
}

export function render(text, enrollment, contact, company, html = false) {
  const escape = (s) => html ? String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) : String(s);
  const aliases = { nombre: 'first', apellidos: 'last', nombre_completo: 'name', correo: 'email', telefono: 'phone', empresa: 'company', sector: 'industry', dominio: 'domain', cargo: 'job_title', ciudad: 'city', pais: 'country' };
  return String(text || '').replace(/\[\[([^\]]+)\]\]|{{([^}|]+)(?:\|([^}]*))?}}/g, (_, placeholder, token, fallback) => {
    let value;
    if (placeholder) value = enrollment.placeholders?.[placeholder.trim()];
    else {
      const [object, field] = token.trim().split('.');
      const record = object === 'contacto' ? contact : object === 'empresa' ? company : object === 'propietario' ? { first: enrollment.enrolled_by.split(' ')[0], name: enrollment.enrolled_by } : {};
      value = record?.[object === 'empresa' && field === 'nombre' ? 'name' : aliases[field] || field] ?? record?.extra?.[field];
    }
    if (value == null || value === '') {
      if (fallback !== undefined) return escape(fallback.trim());
      throw new Error(`Unresolved personalization: ${placeholder || token}`);
    }
    return escape(value);
  });
}

export async function processDue(store, send, now = new Date()) {
  const results = [];
  for (const candidate of await store.due(now.toISOString())) {
    const enrollment = await store.claim(candidate.id);
    if (!enrollment || enrollment.extra?.waiting_task) continue;
    try {
      const steps = (await store.steps(enrollment.sequence_id)).sort((a, b) => a.position - b.position);
      const original = steps[enrollment.current_step - 1];
      const override = enrollment.extra?.stepOverrides?.[original?.id];
      const step = original && { ...original };
      if (step && ['auto_email', 'manual_email'].includes(step.type) && override) {
        for (const field of ['subject', 'body']) if (typeof override[field] === 'string') step[field] = override[field];
      }
      if (!step) throw new Error('Pending step missing; review sequence edits');
      const next = steps[enrollment.current_step];
      const nextAt = step.type === 'auto_email' && next ? nextDate(now, next.delay_days) : null;
      const { contact, company } = await store.context(enrollment);
      const payload = {
        subject: render(step.subject, enrollment, contact, company),
        html: render(step.body, enrollment, contact, company, true),
        title: render(step.title, enrollment, contact, company),
      };
      // Re-check terminal/paused state immediately before the external side effect.
      if (!await store.active(enrollment)) {
        await store.record(enrollment, 'cancelled', null);
        results.push({ id: enrollment.id, status: 'cancelled' });
        continue;
      }
      let receipt = step.type === 'manual_email' ? { email: payload } : null;
      if (step.type === 'auto_email') {
        // A contact without e-mail (enrolled in bulk with the warning) skips its e-mail steps instead of
        // breaking the enrolment: the step advances with a receipt that says so (counted as processed).
        if (!contact.email) receipt = { skipped: 'no_email' };
        else receipt = await send(enrollment, step, { ...payload, to: contact.email });
      } else if (!['manual_email', 'call', 'task', 'inmail', 'connection'].includes(step.type)) {
        throw new Error(`Unknown step type: ${step.type}`);
      }
      // Manual task creation and waiting state are one database transaction.
      const advanced = await store.finish(enrollment, step, payload, nextAt, receipt);
      results.push({ id: enrollment.id, status: advanced === false ? 'unchanged' : step.type !== 'auto_email' ? 'waiting_task' : next ? 'advanced' : 'finished' });
    } catch (error) {
      await store.record(enrollment, 'error', String(error.message || error));
      results.push({ id: enrollment.id, status: 'error' });
    }
  }
  return results;
}
