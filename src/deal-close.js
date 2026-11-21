// Shared stage gate for record controls, inline edits and board moves.
import { dealPipelineDefs, isClosedStage, setField, findRecord } from './data.js';
import { propertyMap } from './properties.js';
import { toast } from './shell.js';

const reasonKey = (stage) => stage === 'won' ? 'closedWonReason' : 'closedLostReason';
const aliases = { closed_lost_reason: 'closedLostReason', closed_won_reason: 'closedWonReason', 'Motivo de pérdida': 'closedLostReason', 'Motivo de ganancia': 'closedWonReason' };
const definition = (r) => { const defs = dealPipelineDefs(); return defs.find((d) => d.name === r.pipeline) || defs[0]; };
const requiredKeys = (d, to) => {
  const props = propertyMap('deals');
  return ((d.required || {})[to] || []).map((p) => aliases[p] || Object.values(props).find((v) => v.label === p)?.key || p);
};
export function dealMoveRefusal(r, to, { reasonPending = true } = {}) {
  const d = definition(r);
  if (!d) return 'No se encontró el pipeline del negocio';
  const rules = d.rules || {};
  const keys = d.stages.map((s) => s[0]);
  const i = keys.indexOf(r.stage), j = keys.indexOf(to);
  if (j < 0) return 'La etapa no pertenece al pipeline del negocio';
  if (r.stage === to) return null;
  if (rules.lockClosed && isClosedStage(r.stage)) return `"${d.name}" no permite mover negocios cerrados`;
  if (rules.noBack && j < i) return `"${d.name}" no permite retroceder de etapa`;
  if (rules.noSkip && j > i + 1 && !isClosedStage(to)) return `"${d.name}" solo permite avanzar a la etapa siguiente`;
  if (rules.requireAmount && to === 'won' && !(Number(r.amount) > 0)) return 'Añade un importe antes de marcar el negocio como ganado';
  const props = propertyMap('deals');
  const missing = requiredKeys(d, to).filter((key) => {
    if (reasonPending && isClosedStage(to) && key === reasonKey(to)) return false;
    if (key === 'amount') return !(Number(r.amount) > 0);
    if (key === 'Contacto asociado') return !r.contactId && !r.assoc_contacts?.length;
    return !String(r[key] ?? '').trim();
  });
  return missing.length ? `Para entrar en esta etapa hace falta: ${missing.map((k) => props[k]?.label || k).join(', ')}` : null;
}

let active = false;
export async function prepareDealStage(r, to) {
  if (!r || active) return false;
  if (r.stage === to) return true;
  const refusal = dealMoveRefusal(r, to);
  if (refusal) { toast(refusal); return false; }
  if (!isClosedStage(to)) return true; // Historical reasons survive reopening.
  active = true;
  const key = reasonKey(to);
  const required = requiredKeys(definition(r), to).includes(key);
  const previousFocus = document.activeElement;
  const from = r.stage;
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'bmodal is-open';
    modal.id = 'deal-close-modal';
    modal.innerHTML = `<div class="bmodal__scrim" data-cancel></div><form class="bmodal__panel" role="dialog" aria-modal="true" aria-labelledby="deal-close-title"><div class="bmodal__head"><h3 id="deal-close-title">¿Por qué se ${to === 'won' ? 'ganó' : 'perdió'}?</h3><button type="button" class="bmodal__close" data-cancel aria-label="Cerrar">×</button></div><div class="bmodal__body"><label class="field"><span>Motivo (${required ? 'obligatorio' : 'opcional'})</span><textarea name="reason" rows="4" ${required ? 'required' : ''}></textarea></label><p role="alert" data-error></p></div><div class="bmodal__foot"><button type="button" class="btn" data-cancel>Cancelar</button><button type="submit" class="btn btn--primary">Guardar y cerrar negocio</button></div></form>`;
    const input = modal.querySelector('textarea');
    input.value = r[key] || '';
    const finish = (ok) => { modal.remove(); active = false; previousFocus?.focus(); resolve(ok); };
    modal.addEventListener('click', (e) => { if (e.target.closest('[data-cancel]')) finish(false); });
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
      if (e.key === 'Tab') {
        const items = [...modal.querySelectorAll('button, textarea')];
        const first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    modal.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const value = input.value.trim();
      const current = findRecord('deals', r.id) || r;
      const error = current.stage !== from ? 'La etapa cambió. Cancela y vuelve a intentarlo.' : required && !value ? 'Escribe el motivo para cerrar el negocio.' : dealMoveRefusal({ ...current, [key]: value }, to, { reasonPending: false });
      if (error) { modal.querySelector('[data-error]').textContent = error; input.focus(); return; }
      try { setField('deals', r.id, key, value); finish(true); }
      catch (err) { modal.querySelector('[data-error]').textContent = err.message; }
    });
    document.body.append(modal);
    input.focus();
  });
}
