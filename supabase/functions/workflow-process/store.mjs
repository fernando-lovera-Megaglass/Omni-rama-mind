// The Supabase side of workflow-process: the RPCs of supabase/workflow-process.sql and the CRM tables.
const COLS = {
  contacts: ['first', 'last', 'name', 'email', 'phone', 'mobilephone', 'owner', 'company_id', 'company', 'status', 'last_activity', 'last_activity_type', 'lifecycle', 'city', 'country', 'source', 'job_title', 'customer_type'],
  companies: ['name', 'domain', 'phone', 'owner', 'industry', 'city', 'country', 'employees', 'revenue', 'lifecycle', 'last_activity', 'last_activity_type', 'parent_company_id'],
  deals: ['name', 'amount', 'stage', 'pipeline', 'close_date', 'owner', 'company_id', 'company', 'contact_id', 'last_activity', 'priority', 'type'],
  tickets: ['name', 'status', 'priority', 'pipeline', 'owner', 'contact_id', 'source', 'last_activity', 'description'],
};
// The app's camelCase property keys that are real columns.
const CAMEL = { companyId: 'company_id', contactId: 'contact_id', closeDate: 'close_date', lastActivity: 'last_activity', jobTitle: 'job_title', parentCompanyId: 'parent_company_id' };
const TABLES = new Set(Object.keys(COLS));

export function createStore(db) {
  const checked = async (query) => {
    const { data, error } = await query;
    if (error) throw error;
    return data;
  };
  const table = (type) => { if (!TABLES.has(type)) throw new Error(`Tipo de registro desconocido: ${type}`); return type; };
  return {
    due: (now) => checked(db.rpc('workflow_due', { p_now: now })),
    claim: async (id) => (await checked(db.rpc('workflow_claim', { p_id: id })))[0],
    finish: (run, step, estado, next, log, jumps) => checked(db.rpc('workflow_finish', { p_id: run.id, p_step: step, p_estado: estado, p_next: next, p_log: log, p_jumps: jumps })),
    workflow: async (id) => {
      const w = await checked(db.from('workflows').select('*').eq('id', id).is('deleted_at', null).maybeSingle());
      if (!w) return null;
      const actions = await checked(db.from('workflow_actions').select('*').eq('workflow_id', id).order('position'));
      return { ...w, actions };
    },
    // the record with its extra jsonb unpacked (custom properties are conditions too)
    record: async (type, id) => {
      const row = await checked(db.from(table(type)).select('*').eq('id', id).maybeSingle());
      if (!row || row.deleted_at) return null;
      return { ...(row.extra || {}), ...row };
    },
    assoc: async (type, record, key) => {
      if (key === 'assoc_contacts') {
        if (type === 'companies') return (await checked(db.from('contacts').select('id', { count: 'exact', head: true }).eq('company_id', record.id))) ?? 0;
        return (record.contact_id ? 1 : 0) + (Array.isArray(record.assoc_contacts) ? record.assoc_contacts.length : 0);
      }
      if (key === 'assoc_deals') {
        const col = type === 'contacts' ? 'contact_id' : type === 'companies' ? 'company_id' : null;
        if (!col) return 0;
        const { count, error } = await db.from('deals').select('id', { count: 'exact', head: true }).eq(col, record.id).is('deleted_at', null);
        if (error) throw error;
        return count || 0;
      }
      return 0;
    },
    associated: async (type, record, toObject) => {
      const one = (t, col, val) => (val == null ? null : checked(db.from(t).select('*').eq(col, val).maybeSingle()));
      if (toObject === type) return record;
      if (toObject === 'contacts') return type === 'companies' ? checked(db.from('contacts').select('*').eq('company_id', record.id).order('id').limit(1).maybeSingle()) : one('contacts', 'id', record.contact_id);
      if (toObject === 'companies') return record.company_id ? one('companies', 'id', record.company_id) : record.contact_id ? (async () => { const c = await one('contacts', 'id', record.contact_id); return c && c.company_id ? one('companies', 'id', c.company_id) : null; })() : null;
      if (toObject === 'deals') return checked(db.from('deals').select('*').eq(type === 'companies' ? 'company_id' : 'contact_id', record.id).is('deleted_at', null).order('id').limit(1).maybeSingle());
      if (toObject === 'tickets') return type === 'contacts' ? checked(db.from('tickets').select('*').eq('contact_id', record.id).order('id').limit(1).maybeSingle()) : null;
      return null;
    },
    // a real column is updated as such; anything else lives in the extra jsonb
    updateRecord: async (type, id, key, value) => {
      const col = CAMEL[key] || key;
      if (COLS[table(type)].includes(col)) return checked(db.from(type).update({ [col]: value === '' && /_id$|^employees$|^revenue$|^amount$|^close_date$|^last_activity$/.test(col) ? null : value }).eq('id', id));
      const row = await checked(db.from(type).select('extra').eq('id', id).single());
      return checked(db.from(type).update({ extra: { ...(row.extra || {}), [key]: value } }).eq('id', id));
    },
    createTask: (task) => checked(db.from('tasks').insert(task)),
    createRecord: (type, fields) => checked(db.from(table(type)).insert(fields)),
    note: (run, { type, text, when, extra }) => checked(db.from('activities').insert({ type, record_type: run.record_type, record_id: run.record_id, text, who: 'Workflow', occurred_at: new Date(when).toISOString(), extra })),
    sendEmail: null, // set by index.ts (Gmail through the first active connected account)
  };
}
