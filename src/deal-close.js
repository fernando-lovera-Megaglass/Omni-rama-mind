// Every interactive deal-stage change goes through this gate and commit.
import { dealPipelineDefs, isClosedStage, setField, findRecord, allCompanies, addRecord, validatePropertyValues } from './data.js';
import { propertyMap } from './properties.js';
import { propertyEditor } from './property-editor.js';
import { toast } from './shell.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reasonKey = stage => stage === 'won' ? 'closedWonReason' : 'closedLostReason';
const aliases = { closed_lost_reason: 'closedLostReason', closed_won_reason: 'closedWonReason', 'Motivo de pérdida': 'closedLostReason', 'Motivo de ganancia': 'closedWonReason', 'Importe': 'amount', 'Empresa asociada': 'company', 'Fecha de cierre': 'closeDate', 'Siguiente paso': 'hs_next_step' };
const definition = r => { const defs = dealPipelineDefs(); return defs.find(d => d.name === r.pipeline) || defs[0]; };
const requiredKeys = (d, to) => {
  const props = propertyMap('deals');
  const keys = ((d.required || {})[to] || []).map(p => aliases[p] || Object.values(props).find(v => v.label === p)?.key || p);
  if (d.rules?.requireAmount && to === 'won') keys.push('amount');
  return [...new Set(keys)];
};
const missingKeys = (r, to) => requiredKeys(definition(r), to).filter(key => key === 'amount' ? !(Number(r.amount) > 0) : !String(r[key] ?? '').trim());
// Structural rules only: missing values are collected in the dialog, never a move refusal.
export function dealMoveRefusal(r, to) {
  const d = definition(r);
  if (!d) return 'No se encontró el pipeline del negocio';
  const rules = d.rules || {};
  const keys = d.stages.map(s => s[0]);
  const i = keys.indexOf(r.stage), j = keys.indexOf(to);
  if (j < 0) return 'La etapa no pertenece al pipeline del negocio';
  if (r.stage === to) return null;
  if (rules.lockClosed && isClosedStage(r.stage)) return `"${d.name}" no permite mover negocios cerrados`;
  if (rules.noBack && j < i) return `"${d.name}" no permite retroceder de etapa`;
  if (rules.noSkip && j > i + 1 && !isClosedStage(to)) return `"${d.name}" solo permite avanzar a la etapa siguiente`;
  return null;
}

function fieldFor(key, props) {
  if (key === 'company') return [key, 'Empresa asociada', 'select', [['', 'Seleccionar empresa'], ...allCompanies().map(c => [c.name, c.name])]];
  if (key === 'amount') return [key, 'Importe', 'number'];
  if (key === 'closeDate') return [key, 'Fecha de cierre', 'date'];
  if (key === 'closedWonReason' || key === 'closedLostReason') return [key, props[key]?.label || 'Motivo', 'textarea'];
  const p = props[key];
  const options = p?.hubspot?.options?.length ? p.hubspot.options.map(o => [o.value, o.label]) : p?.options?.map(o => Array.isArray(o) ? o : [o, o]);
  return [key, p?.label || key, options?.length ? 'select' : p?.kind === 'number' ? 'number' : 'text', [['', 'Seleccionar'], ...(options || [])]];
}
const pending = new Set();
export async function changeDealStage(record, to) {
  if (!record || pending.has(String(record.id))) return false;
  const id = record.id;
  const r = findRecord('deals', id) || record;
  const refusal = dealMoveRefusal(r, to);
  if (refusal) { toast(refusal); return false; }
  if (r.stage === to) return true;
  pending.add(String(id));
  const from = r.stage, pipeline = r.pipeline;
  const commit = async patch => {
    const current = findRecord('deals', id) || r;
    if (current.stage !== from || current.pipeline !== pipeline) throw new Error('La etapa o el pipeline cambió. Cancela y vuelve a intentarlo.');
    const error = dealMoveRefusal(current, to);
    if (error) throw new Error(error);
    const missing = missingKeys({ ...current, ...patch }, to);
    if (missing.length) throw new Error(`Completa: ${missing.map(k => propertyMap('deals')[k]?.label || k).join(', ')}`);
    const now = new Date();
    const a = definition(current).automation?.[to];
    const values = { ...patch, stageEnteredAt: now.toISOString(), ...(a?.closeDate ? { closeDate: now.toISOString() } : {}), stage: to };
    await validatePropertyValues('deals', values, { id });
    for (const [key, value] of Object.entries(values)) setField('deals', id, key, value);
    const label = definition(current).stages.find(s => s[0] === to)?.[1] || to;
    if (a?.task) {
      addRecord('tasks', { name: `Seguimiento: ${current.name} (${label})`, type: 'Llamada', priority: 'medium', status: 'todo', owner: current.owner, due: new Date(now.getTime() + 2 * 86400000).toISOString(), contact: '', contactId: current.contactId || '', dealId: id, lastActivity: now.toISOString() });
      toast(`Tarea de seguimiento creada para ${current.owner}`);
    }
    if (a?.notify) toast(`Notificación enviada a ${current.owner}: "${current.name}" ahora está en "${label}"`);
    return true;
  };
  try {
    const keys = missingKeys(r, to);
    if (isClosedStage(to) && !keys.includes(reasonKey(to))) keys.push(reasonKey(to));
    if (!keys.length) return await commit({});
    const props = propertyMap('deals');
    const required = requiredKeys(definition(r), to);
    const title = isClosedStage(to) ? (to === 'won' ? '¿Por qué se ganó?' : '¿Por qué se perdió?') : 'Completar cambio de etapa';
    const previousFocus = document.activeElement;
    return await new Promise(resolve => {
      const modal = document.createElement('div');
      modal.className = 'bmodal is-open';
      modal.id = 'deal-close-modal';
      modal.style.zIndex = '10000';
      modal.innerHTML = `<div class="bmodal__scrim" data-cancel></div><form class="bmodal__panel" role="dialog" aria-modal="true" aria-labelledby="deal-close-title"><div class="bmodal__head"><h3 id="deal-close-title">${title}</h3><button type="button" class="bmodal__close" data-cancel aria-label="Cerrar">×</button></div><div class="bmodal__body"><p>${esc(r.name)} · ${esc(definition(r).stages.find(s => s[0] === to)?.[1])}</p>${keys.map(key => { const f = fieldFor(key, props); return `<label class="field"><span>${esc(f[1])} (${required.includes(key) ? 'obligatorio' : 'opcional'})</span>${propertyEditor(f, r, props)}</label>`; }).join('')}<p role="alert" data-error></p></div><div class="bmodal__foot"><button type="button" class="btn" data-cancel>Cancelar</button><button type="submit" class="btn btn--primary">Guardar y cambiar etapa</button></div></form>`;
      let saving = false;
      const finish = ok => { modal.remove(); previousFocus?.focus(); resolve(ok); };
      modal.addEventListener('click', e => { if (!saving && e.target.closest('[data-cancel]')) finish(false); });
      modal.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!saving) finish(false); }
        if (e.key === 'Tab') {
          const items = [...modal.querySelectorAll('button, input, select, textarea')].filter(el => !el.disabled);
          const first = items[0], last = items.at(-1);
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      });
      modal.querySelector('form').addEventListener('submit', async e => {
        e.preventDefault();
        if (saving) return;
        saving = true;
        const button = modal.querySelector('[type="submit"]');
        button.disabled = true;
        try {
          const patch = {};
          for (const el of modal.querySelectorAll('[data-edit]')) {
            patch[el.dataset.edit] = el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.type === 'date' ? (el.value ? new Date(`${el.value}T12:00:00`).toISOString() : '') : el.value.trim();
          }
          if ('company' in patch) patch.companyId = allCompanies().find(c => c.name === patch.company)?.id || '';
          await commit(patch);
          finish(true);
        } catch (error) { modal.querySelector('[data-error]').textContent = error.message; }
        finally { saving = false; button.disabled = false; }
      });
      document.body.append(modal);
      modal.querySelector('[data-edit]')?.focus();
    });
  } catch (error) { toast(error.message); return false; }
  finally { pending.delete(String(id)); }
}
