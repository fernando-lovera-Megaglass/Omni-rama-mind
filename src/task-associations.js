import { allContacts, allCompanies, allDeals, allTickets, strip, addActivity } from './data.js';

export const TASK_ASSOCIATIONS = { contacts: 'Contactos', companies: 'Empresas', deals: 'Negocios', tickets: 'Tickets' };
// A task links to one record of each kind through a scalar key (+ its name) — the primary association the
// record pages, the queue and «Próxima actividad» read — and to any number of them through assoc_<kind>.
export const TASK_LINK_KEYS = { contacts: ['contactId', 'contact'], companies: ['companyId', 'company'], deals: ['dealId', 'deal'], tickets: ['ticketId', 'ticket'] };
const pools = { contacts: allContacts, companies: allCompanies, deals: allDeals, tickets: allTickets };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const linkedIds = (task, kind) => {
  const [key] = TASK_LINK_KEYS[kind] || [];
  return new Set([...(task[`assoc_${kind}`] || []), ...(key && task[key] ? [task[key]] : [])].map(String));
};
export const taskLinksTo = (task, kind, id) => linkedIds(task, kind).has(String(id));
export function taskAssociatedRecords(task, kind) {
  const ids = linkedIds(task, kind);
  return pools[kind]().filter(r => ids.has(String(r.id)));
}
// The fields that tie a new task to one record (bulk «Crear tareas», tasks created from a record).
export function taskAssociationFields(kind, record) {
  const [key, name] = TASK_LINK_KEYS[kind] || [];
  return key ? { [key]: record.id, [name]: record.name || '', [`assoc_${kind}`]: [record.id] } : {};
}
export function taskAssociationLinks(task, kind, root = '../../') {
  return taskAssociatedRecords(task, kind).map(r => `<a href="${root}${kind}/record/?id=${encodeURIComponent(r.id)}">${esc(r.name)}</a>`).join('<br>') || '—';
}
export function logTaskAssociations(task) {
  for (const kind of Object.keys(TASK_ASSOCIATIONS)) {
    for (const record of taskAssociatedRecords(task, kind)) {
      addActivity({ type: 'task', recordType: kind, recordId: record.id, text: `Tarea creada: ${task.name}`, who: 'Tú', when: Date.now(), extra: { taskId: task.id } });
    }
  }
}

// Extend the existing form, retaining its fields, validation and queue-compatible primary contact.
export function mountTaskAssociations(form) {
  const selected = Object.fromEntries(Object.keys(pools).map(k => [k, []]));
  const host = document.createElement('div');
  host.innerHTML = Object.entries(TASK_ASSOCIATIONS).map(([kind, label]) => `<section class="cd-section"><h3>${label}</h3><ul class="cd-assoc" id="ta-${kind}-list"></ul><div class="cd-search"><label class="field"><span>Buscar ${label.toLowerCase()}${kind === 'contacts' ? ' por nombre o correo' : ''}</span><input type="search" autocomplete="off" data-ta-search="${kind}" aria-controls="ta-${kind}-results"></label><ul class="cd-search__results" id="ta-${kind}-results" hidden></ul></div><p class="muted" id="ta-${kind}-empty" role="status" hidden>Sin resultados</p></section>`).join('');
  form.append(host);
  const input = kind => host.querySelector(`[data-ta-search="${kind}"]`);
  const results = kind => host.querySelector(`#ta-${kind}-results`);
  function search(kind) {
    const q = strip(input(kind).value.trim());
    const hits = q ? pools[kind]().filter(r => !selected[kind].some(s => String(s.id) === String(r.id)) && strip(`${r.name || ''} ${r.email || ''} ${r.domain || ''}`).includes(q)).slice(0, 6) : [];
    results(kind).innerHTML = hits.map(r => `<li><button type="button" data-ta-pick="${kind}" data-id="${esc(r.id)}"><strong>${esc(r.name)}</strong> <span class="muted">${esc(r.email || r.domain || '')}</span></button></li>`).join('');
    results(kind).hidden = !hits.length;
    host.querySelector(`#ta-${kind}-empty`).hidden = !q || !!hits.length;
  }
  function render(kind) {
    host.querySelector(`#ta-${kind}-list`).innerHTML = selected[kind].map(r => `<li class="cd-assoc__row"><div class="cd-assoc__who"><div><strong>${esc(r.name)}</strong><small>${esc(r.email || r.domain || '')}</small></div><button type="button" class="icon-btn" data-ta-remove="${kind}" data-id="${esc(r.id)}" aria-label="Quitar ${esc(r.name)}">×</button></div></li>`).join('');
    search(kind);
  }
  host.addEventListener('input', e => { if (e.target.dataset.taSearch) search(e.target.dataset.taSearch); });
  host.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.dataset.taSearch) { e.preventDefault(); results(e.target.dataset.taSearch).querySelector('button')?.click(); }
  });
  host.addEventListener('click', e => {
    const b = e.target.closest('[data-ta-pick], [data-ta-remove]');
    if (!b) return;
    const kind = b.dataset.taPick || b.dataset.taRemove;
    if (b.dataset.taPick) {
      const record = pools[kind]().find(r => String(r.id) === b.dataset.id);
      if (record && !selected[kind].some(r => String(r.id) === b.dataset.id)) selected[kind].push(record);
      input(kind).value = '';
    } else selected[kind] = selected[kind].filter(r => String(r.id) !== b.dataset.id);
    render(kind);
    input(kind).focus();
  });
  form.addEventListener('reset', () => { for (const kind of Object.keys(pools)) { selected[kind] = []; input(kind).value = ''; render(kind); } });
  return { build: () => ({ contactId: selected.contacts[0]?.id || '', contact: selected.contacts[0]?.name || '', ...Object.fromEntries(Object.keys(pools).map(kind => [`assoc_${kind}`, selected[kind].map(r => r.id)])) }) };
}
