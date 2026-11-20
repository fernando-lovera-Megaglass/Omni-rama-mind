export function createStore(db) {
  const checked = async (query) => {
    const { data, error } = await query;
    if (error) throw error;
    return data;
  };
  return {
    due: (now) => checked(db.rpc('sequence_due', { p_now: now })),
    claim: async (id) => (await checked(db.rpc('sequence_claim', { p_id: id })))[0],
    steps: (id) => checked(db.from('sequence_steps').select('*').eq('sequence_id', id).order('position')),
    context: async (e) => ({
      contact: await checked(db.from('contacts').select('*').eq('id', e.contact_id).single()),
      company: e.company_id ? await checked(db.from('companies').select('*').eq('id', e.company_id).maybeSingle()) : {},
    }),
    active: async (e) => Boolean(await checked(db.from('sequence_enrollments').select('id').eq('id', e.id).eq('status', 'active').eq('current_step', e.current_step).maybeSingle())),
    record: (e, status, error) => checked(db.from('sequence_step_runs').update({ status, last_error: error, updated_at: new Date().toISOString() }).eq('enrollment_id', e.id).eq('step_number', e.current_step)),
    finish: (e, step, payload, next, receipt) => checked(db.rpc('sequence_finish', { p_id: e.id, p_step: e.current_step, p_next: next, p_type: step.type, p_title: payload.title || payload.subject, p_receipt: receipt })),
  };
}
