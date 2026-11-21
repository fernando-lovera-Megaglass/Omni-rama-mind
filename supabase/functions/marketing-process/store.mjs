// Supabase-backed store for processor.mjs: the RPCs of supabase/marketing-process.sql plus the sender lookup.
const likeEscape = (s) => String(s || '').trim().replace(/[\\%_]/g, '\\$&');

export function createStore(db) {
  const checked = async (query) => {
    const { data, error } = await query;
    if (error) throw error;
    return data;
  };
  return {
    due: (now) => checked(db.rpc('marketing_due', { p_now: now })),
    claim: async (id) => (await checked(db.rpc('marketing_claim', { p_id: id })))[0],
    run: (id) => checked(db.from('marketing_email_runs').select('*').eq('email_id', id).single()),
    recipients: (id) => checked(db.rpc('marketing_recipients', { p_id: id })),
    // Messages already sent today (UTC) across campaigns: approximated by the runs touched today.
    sentToday: async (now) => {
      const day = new Date(now);
      day.setUTCHours(0, 0, 0, 0);
      const rows = await checked(db.from('marketing_email_runs').select('sent').gte('updated_at', day.toISOString()));
      return rows.reduce((sum, r) => sum + (Number(r.sent) || 0), 0);
    },
    // The connected Gmail account the campaign is sent from: the one frozen by the app when scheduling
    // (destinatarios.senderAccountId), else the active account whose address is the campaign's de_email.
    // Never an arbitrary account.
    sender: async (email) => {
      const active = () => db.from('connected_accounts').select('*').eq('provider', 'gmail').eq('status', 'active');
      const wanted = (email.destinatarios || {}).senderAccountId;
      let rows = wanted ? await checked(active().eq('id', wanted).limit(1)) : [];
      if (!rows.length && String(email.de_email || '').trim()) rows = await checked(active().ilike('email', likeEscape(email.de_email)).limit(1));
      if (!rows.length) throw new Error(`No hay una cuenta de Gmail activa para el remitente ${email.de_email || '(sin correo)'}: conéctala en Ajustes › Correo`);
      return rows[0];
    },
    reserve: (email, index) => checked(db.rpc('marketing_progress', { p_id: email.id, p_index: index, p_ok: null, p_error: null, p_contact_id: null, p_receipt: null })),
    progress: (email, index, ok, error, person, receipt) => checked(db.rpc('marketing_progress', { p_id: email.id, p_index: index, p_ok: ok, p_error: error, p_contact_id: person.contact_id, p_receipt: receipt })),
    finish: (email, status, error = null) => checked(db.rpc('marketing_finish', { p_id: email.id, p_status: status, p_error: error })),
  };
}
