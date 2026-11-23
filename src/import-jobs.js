// Durable import history. The monitor's original row and full detail remain lossless.
export function createImportJobs(client, storage) {
  let tail = Promise.resolve();
  let userId;
  const rows = new Map();
  const details = new Map();
  let lastError = null;
  let legacyRows = [];
  let legacyDetail = () => null;
  const read = (key, fallback) => { try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const encode = (row, detail) => ({ id: row.id, user_id: userId, objeto: row.object || 'contacts', nombre: row.name || '', fuente: row.source || '', sistema: row.system || '', estado: row.state, new_count: row.newRecords || 0, updated_count: row.updated || 0, associations_count: row.associations || 0, errors_count: row.errors || 0, undo_ledger: detail?.createdIds || {}, row_data: row, detail: detail || {}, created_at: row.when });
  const pendingKey = () => `crm:imports:pending:${userId}`;
  const writePending = (pending) => storage.setItem(pendingKey(), JSON.stringify(pending));
  const send = async (payload) => {
    const { data, error } = await client.from('import_jobs').upsert(payload, { onConflict: 'id' }).select().single();
    if (error) throw error;
    accept(data);
    const pending = read(pendingKey(), {});
    if (JSON.stringify(pending[payload.id]) === JSON.stringify(payload)) { delete pending[payload.id]; writePending(pending); }
  };
  const accept = (r) => {
    const row = { ...r.row_data, id: Number(r.id), object: r.objeto, name: r.nombre, source: r.fuente, system: r.sistema, state: r.estado, newRecords: r.new_count, updated: r.updated_count, associations: r.associations_count, errors: r.errors_count, when: r.created_at };
    rows.set(Number(r.id), row);
    details.set(Number(r.id), { ...r.detail, createdIds: r.undo_ledger });
  };
  const migrate = async () => {
    if (!legacyRows.length) return;
    const { error } = await client.from('import_jobs').upsert(legacyRows.map(r => encode(r, read(`crm:imports:detail:${r.id}`, null) ?? legacyDetail(r.id))), { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
    legacyRows = [];
  };
  const enqueue = (fn) => {
    tail = tail.then(fn).catch(error => { lastError = error; console.warn('[import_jobs] Se conserva el historial local:', error.message); });
    return tail;
  };
  return {
    rows, details,
    hasPending: id => Boolean(userId && read(pendingKey(), {})[id]),
    get error() { return lastError; },
    async init(legacy = [], getDetail = () => null) {
      legacyDetail = getDetail;
      if (!client) return;
      await enqueue(async () => {
        const { data: auth, error: authError } = await client.auth.getUser();
        if (authError) throw authError;
        userId = auth.user?.id;
        if (!userId) return;
        // Idempotent migration: a stale browser never overwrites a durable import.
        const local = read('crm:imports', []);
        const candidates = new Map([...legacy, ...local].filter(r => r && !r.sample).map(r => [Number(r.id), r]));
        legacyRows = [...candidates.values()];
        try { await migrate(); } catch (error) { lastError = error; console.warn('[import_jobs] Migración pendiente:', error.message); }
        for (const payload of Object.values(read(pendingKey(), {}))) {
          try { await send(payload); } catch (error) { lastError = error; }
        }
        for (let start = 0; ; start += 500) {
          const { data, error } = await client.from('import_jobs').select('*').order('id').range(start, start + 499);
          if (error) throw error;
          data.forEach(accept);
          if (data.length < 500) break;
        }
        if (!legacyRows.length && !Object.keys(read(pendingKey(), {})).length) lastError = null;
      });
    },
    save(row, detail) {
      if (!client || !userId || !row || row.sample) return;
      const payload = structuredClone(encode(row, detail));
      writePending({ ...read(pendingKey(), {}), [payload.id]: payload });
      return enqueue(async () => {
        await send(payload);
        await migrate();
        lastError = null;
      });
    },
    async flush() { let pending; do { pending = tail; await pending; } while (pending !== tail); return { ok: !lastError, error: lastError }; },
  };
}
