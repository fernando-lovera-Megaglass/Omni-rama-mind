// Synchronous memory reads, serialized optimistic writes and identity-isolated offline backup.
export const indexSetting = (key) => /^crm:(contacts|companies|deals|tickets|tasks):(defaultcolumns|quickfilters|boardcard)$/.test(key);
export const settingsScope = (key) => indexSetting(key) || key === 'crm:call_outcomes' || key === 'crm:account' || key === 'crm:integrations' ||
  (key.startsWith('crm:settings:') && !/^crm:settings:(general-|navcollapsed)/.test(key)) ? 'account' : 'user';
export const managedSetting = (key) => indexSetting(key) || ['crm:call_outcomes', 'crm:profile', 'crm:notif', 'crm:account', 'crm:integrations'].includes(key) || key.startsWith('crm:settings:');
export function createSettingsStore({ client, storage, onError = () => {} }) {
  let user, cache = {}, pending = {}, queue = Promise.resolve();
  const clone = (v) => v === undefined ? v : JSON.parse(JSON.stringify(v));
  const backupKey = () => `omni:settings:${user?.id || 'demo'}`;
  const persist = () => { try { storage.setItem(backupKey(), JSON.stringify({ cache, pending })); } catch { /* Storage may be disabled or full. */ } };
  const ready = (async () => {
    if (!client) return;
    let result;
    try { result = await client.auth.getSession(); } catch (error) { onError(error); return; }
    if (result.error) { onError(result.error); return; }
    user = result.data?.session?.user;
    if (!user) return;
    try { const old = JSON.parse(storage.getItem(backupKey())); cache = old?.cache || {}; pending = old?.pending || {}; } catch { /* Empty backup. */ }
    for (const scope of ['user', 'account']) {
      try {
        let query = client.from(scope === 'user' ? 'user_settings' : 'account_settings').select('key,value').eq('scope', scope);
        if (scope === 'user') query = query.eq('user_id', user.id);
        const { data, error } = await query;
        if (error) throw error;
        for (const key of Object.keys(cache)) if (managedSetting(key) && settingsScope(key) === scope && !(key in pending)) delete cache[key];
        for (const row of data || []) if (managedSetting(row.key) && settingsScope(row.key) === scope && !(row.key in pending)) cache[row.key] = row.value;
      } catch (error) { onError(error); }
    }
    persist();
  })();
  function load(key, fallback) {
    if (!client) { try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; } }
    // Legacy index defaults remain a fallback only; never upload them implicitly.
    if (indexSetting(key) && !(key in cache)) {
      try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; }
    }
    return clone(cache[key] ?? fallback);
  }
  function flush() {
    queue = queue.then(async () => {
      await ready;
      if (!user) return;
      let active;
      try { active = await client.auth.getSession(); } catch (error) { onError(error); return; }
      if (active.error || active.data?.session?.user?.id !== user.id) return;
      for (const key of Object.keys(pending)) {
        const value = clone(pending[key]);
        const scope = settingsScope(key);
        try {
          const row = { key, value, scope, ...(scope === 'user' ? { user_id: user.id } : {}) };
          const { error } = await client.from(scope === 'user' ? 'user_settings' : 'account_settings').upsert(row, { onConflict: scope === 'user' ? 'user_id,key' : 'key' });
          if (error) throw error;
          if (JSON.stringify(pending[key]) === JSON.stringify(value)) delete pending[key];
          persist();
        } catch (error) { onError(error); }
      }
    });
    return queue;
  }
  function save(key, value) {
    if (!client) { try { storage.setItem(key, JSON.stringify(value)); } catch { /* Offline demo. */ } return; }
    if (!user) { onError(new Error('Inicia sesión para guardar ajustes.')); return; }
    cache[key] = clone(value); pending[key] = clone(value); persist(); void flush();
  }
  return { ready, load, save, flush };
}
