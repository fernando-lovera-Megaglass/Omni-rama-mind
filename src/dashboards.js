const KEY = 'crm:dashboards';
export function createDashboardStore(storage = localStorage) {
  // The sales template has 6 cards (the sixth is «Embudo de ventas»), the other two have 4.
  const SALES_CARDS = 6;
  const seeds = () => ['ventas', 'marketing', 'servicio'].map((id, i) => ({ id, name: `Panel de ${id}`, shared: i !== 2, template: id, hidden: [], pins: [], order: Array.from({ length: i ? 4 : SALES_CARDS }, (_, n) => `${id}:${n}`) }));
  let rows = JSON.parse(storage.getItem(KEY) || 'null') || seeds();
  const save = next => { storage.setItem(KEY, JSON.stringify(next)); rows = next; };
  if (!rows.length) rows = seeds();
  // Dashboards saved before the funnel existed: an empty sales dashboard (every card hidden) stays empty.
  rows = rows.map(r => {
    if (r.funnelAdded || r.template !== 'ventas') return r;
    const earlier = Array.from({ length: SALES_CARDS - 1 }, (_, n) => `ventas:${n}`);
    const allHidden = earlier.every(k => (r.hidden || []).includes(k));
    return { ...r, funnelAdded: true, hidden: allHidden ? [...new Set([...(r.hidden || []), `ventas:${SALES_CARDS - 1}`])] : r.hidden || [] };
  });
  save(rows);
  return {
    list: () => structuredClone(rows),
    get: id => structuredClone(rows.find(r => r.id === id)),
    update(id, patch) { save(rows.map(r => r.id === id ? { ...r, ...patch } : r)); },
    create(name, shared, source) {
      name = name.trim(); if (!name) throw new Error('Escribe un nombre.');
      const row = { ...(source || { template: 'ventas', showKpis: false, hidden: Array.from({length: SALES_CARDS}, (_, i) => `ventas:${i}`), pins: [], order: Array.from({length: SALES_CARDS}, (_, i) => `ventas:${i}`), funnelAdded: true }), id: crypto.randomUUID(), name: name.slice(0, 120), shared };
      save([...rows, row]); return structuredClone(row);
    },
    remove(id) { if (rows.length === 1) throw new Error('Conserva al menos un panel.'); save(rows.filter(r => r.id !== id)); },
    migratePins(reports) {
      save(rows.map(r => r.pinsMigrated ? r : { ...r, pinsMigrated: true, pins: r.id === 'ventas' ? [...new Set([...(r.pins || []), ...reports.filter(p => p.pinned).map(p => p.id)])] : r.pins || [] }));
    },
  };
}
