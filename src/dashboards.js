const KEY = 'crm:dashboards';
export function createDashboardStore(storage = localStorage) {
  const seeds = () => ['ventas', 'marketing', 'servicio'].map((id, i) => ({ id, name: `Panel de ${id}`, shared: i !== 2, template: id, hidden: [], pins: [], order: Array.from({ length: i ? 4 : 5 }, (_, n) => `${id}:${n}`) }));
  let rows = JSON.parse(storage.getItem(KEY) || 'null') || seeds();
  const save = next => { storage.setItem(KEY, JSON.stringify(next)); rows = next; };
  if (!rows.length) rows = seeds();
  save(rows);
  return {
    list: () => structuredClone(rows),
    get: id => structuredClone(rows.find(r => r.id === id)),
    update(id, patch) { save(rows.map(r => r.id === id ? { ...r, ...patch } : r)); },
    create(name, shared, source) {
      name = name.trim(); if (!name) throw new Error('Escribe un nombre.');
      const row = { ...(source || { template: 'ventas', showKpis: false, hidden: Array.from({length: 5}, (_, i) => `ventas:${i}`), pins: [], order: Array.from({length: 5}, (_, i) => `ventas:${i}`) }), id: crypto.randomUUID(), name: name.slice(0, 120), shared };
      save([...rows, row]); return structuredClone(row);
    },
    remove(id) { if (rows.length === 1) throw new Error('Conserva al menos un panel.'); save(rows.filter(r => r.id !== id)); },
    migratePins(reports) {
      save(rows.map(r => r.pinsMigrated ? r : { ...r, pinsMigrated: true, pins: r.id === 'ventas' ? [...new Set([...(r.pins || []), ...reports.filter(p => p.pinned).map(p => p.id)])] : r.pins || [] }));
    },
  };
}
