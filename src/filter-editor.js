// Shared filter editor and evaluator: groups of conditions (Y inside a group, O between groups) on the
// record's own properties, on linked records (association filters) or on segment membership
// (Afiliaciones). Used by the lists' "Filtros avanzados" (list.js) and by the segment editor.
// Operators and value conversion come from filter-ops.js; associations from assoc-filters.js.
import { propertyGroups, propertyMap } from './properties.js';
import { associationsFor, associationLabelOptions, assocPropertyGroups, assocValueOptions, assocConditionMatches, assocKindGroup, assocText, SINGULAR } from './assoc-filters.js';
import { opsFor, kindGroup, normalizeOp, evalCondition, conditionValues, NO_VALUE_OPS, TWO_VALUE_OPS, MULTI_OPS, DAYS_OPS } from './filter-ops.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
export const SEGMENT_ASSOC = '__segment';
export const LIMITS = { conditions: 250, associated: 60 };
const DATE_KEYS = new Set(['created', 'lastActivity', 'closeDate', 'due', 'closedate']);

export const newCondition = (group = 0) => ({ key: '', op: '', value: '', value2: '', group: Number(group) || 0, assoc: '', label: '' });

// Property kind / operator family / value choices of a record's own property (catalog first).
const MAP_CACHE = new Map();
const cachedMap = (type) => { if (!MAP_CACHE.has(type)) MAP_CACHE.set(type, propertyMap(type)); return MAP_CACHE.get(type); };
export function ownKindOf(type, key, fallbackKind) {
  const p = cachedMap(type)[key];
  if (p) return p.kind;
  if (fallbackKind) { const k = fallbackKind(key); if (k) return k; }
  if (DATE_KEYS.has(key)) return 'datetime';
  if (key === 'amount') return 'currency';
  return 'text';
}
export function ownValueOptionsOf(type, key) {
  const p = cachedMap(type)[key];
  if (p && Array.isArray(p.options) && p.options.length && ['enum', 'user', 'bool'].includes(p.kind)) return p.options.map((o) => (Array.isArray(o) ? [o[1], o[1]] : [o, o]));
  return assocValueOptions(type, key);
}
export const groupConditions = (conditions) => {
  const map = new Map();
  conditions.filter((c) => c.key).forEach((c) => {
    const g = Number(c.group) || 0;
    if (!map.has(g)) map.set(g, []);
    map.get(g).push(c);
  });
  return [...map.values()];
};

// A compiled matcher for a set of conditions (kinds and membership lists resolved once, not per record).
// `segmentMembers(id)` resolves the Afiliaciones filter when given.
export function matcherFor(type, conditions, { fallbackKind, textOf, segmentMembers } = {}) {
  const grps = groupConditions(conditions);
  if (!grps.length) return () => true;
  const memberSets = new Map();
  const compiled = grps.map((g) => g.map((cond) => {
    if (cond.assoc === SEGMENT_ASSOC) {
      const ids = (Array.isArray(cond.value) ? cond.value : String(cond.value || '').split(/[;,]/)).map((v) => String(v).trim()).filter(Boolean);
      ids.forEach((sid) => { if (!memberSets.has(sid)) memberSets.set(sid, new Set((segmentMembers ? segmentMembers(sid) || [] : []).map(Number))); });
      const negate = cond.op === 'noneof' || cond.op === 'nin' || cond.op === 'not';
      return (r) => { const inAny = ids.some((sid) => memberSets.get(sid).has(Number(r.id))); return negate ? !inAny : inAny; };
    }
    if (cond.assoc) return (r) => assocConditionMatches(type, cond, r);
    const group = kindGroup(ownKindOf(type, cond.key, fallbackKind));
    return (r) => {
      const text = textOf ? textOf(cond.key, r) : assocText(type, cond.key, r);
      const raw = r[cond.key];
      const dateMs = group === 'date' && raw ? new Date(raw).getTime() : NaN;
      return evalCondition(cond, conditionValues(raw, text, group, dateMs));
    };
  }));
  return (r) => compiled.some((g) => g.every((fn) => fn(r)));
}
// Does one record satisfy the conditions? (Use matcherFor when checking many records.)
export function recordMatches(type, conditions, r, opts = {}) {
  return matcherFor(type, conditions, opts)(r);
}
export const countConditions = (conditions) => ({ total: conditions.filter((c) => c.key).length, associated: conditions.filter((c) => c.key && c.assoc && c.assoc !== SEGMENT_ASSOC).length });

// The editor: renders into `container`, keeps the conditions through get/set, calls onChange after edits.
export function createFilterEditor({ type, container, summary, get, set, onChange, ownValueOptions, fallbackKind, extraProperties, singular, segmentOptions, showCategories }) {
  const groups = propertyGroups(type);
  const assocs = associationsFor(type);
  const valueOptions = (key) => (ownValueOptions ? ownValueOptions(key) : null) || ownValueOptionsOf(type, key);
  const condGroup = (c) => (c.key ? (c.assoc === SEGMENT_ASSOC ? 'enum' : c.assoc ? assocKindGroup(c.assoc, c.key) : kindGroup(ownKindOf(type, c.key, fallbackKind))) : 'text');
  const condChoices = (c) => (c.key ? (c.assoc === SEGMENT_ASSOC ? (segmentOptions ? segmentOptions() : []) : c.assoc ? assocValueOptions(c.assoc, c.key) : valueOptions(c.key)) : null);
  const propertyOptions = (selected) => {
    const grouped = groups.map((grp) => `<optgroup label="${esc(grp.title)}">${grp.items.map(([k, l]) => `<option value="${k}" ${selected === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>`).join('');
    const extra = (extraProperties || []).filter(([k]) => !propertyMap(type)[k]);
    return grouped + (extra.length ? `<optgroup label="Otras">${extra.map(([k, l]) => `<option value="${k}" ${selected === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>` : '');
  };
  const assocPropertyOptions = (kind, selected) => assocPropertyGroups(kind).map((grp) => `<optgroup label="${esc(grp.title)}">${grp.items.map(([k, l]) => `<option value="${k}" ${selected === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>`).join('');
  const summaryText = (conds) => {
    const live = conds.filter((c) => c.key);
    const liveGroups = new Set(live.map((c) => c.group)).size;
    const assocCount = live.filter((c) => c.assoc && c.assoc !== SEGMENT_ASSOC).length;
    return live.length ? `${live.length} ${live.length === 1 ? 'condición' : 'condiciones'} en ${liveGroups} grupo${liveGroups === 1 ? '' : 's'}${assocCount ? ` · ${assocCount} por asociación` : ''}` : 'Sin condiciones todavía. Elige una propiedad del registro o de un registro asociado.';
  };
  const valueHtml = (c) => {
    const grp = condGroup(c);
    const op = c.op;
    const choices = condChoices(c);
    const list = Array.isArray(c.value) ? c.value : String(c.value ?? '').split(/[;,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!c.key) return '<input data-k="value" type="text" placeholder="Valor" aria-label="Valor" disabled />';
    if (NO_VALUE_OPS.has(op)) return '<span class="advc__novalue muted">Sin valor</span>';
    if (DAYS_OPS.has(op)) return `<span class="advc__days"><input data-k="value" type="number" min="0" step="1" value="${esc(c.value)}" placeholder="0" aria-label="Días" /><span>días</span></span>`;
    if (TWO_VALUE_OPS.has(op)) {
      const t = grp === 'date' ? 'date' : 'number';
      return `<span class="advc__range"><input data-k="value" type="${t}" value="${esc(c.value)}" aria-label="Desde" /><span>y</span><input data-k="value2" type="${t}" value="${esc(c.value2)}" aria-label="Hasta" /></span>`;
    }
    if (MULTI_OPS.has(op) && choices) return `<div class="advc__multi" role="group" aria-label="Valores">${choices.map(([v, l]) => `<label class="advc__check"><input type="checkbox" data-multi value="${esc(v)}" ${list.includes(String(v)) ? 'checked' : ''} /> <span>${esc(l)}</span></label>`).join('')}</div>`;
    if (MULTI_OPS.has(op)) return `<input data-k="value" type="text" value="${esc(Array.isArray(c.value) ? c.value.join('; ') : c.value)}" placeholder="Uno o varios valores separados por ; (Boston; Chicago)" aria-label="Valores" />`;
    if (grp === 'number') return `<input data-k="value" type="number" step="any" value="${esc(c.value)}" placeholder="0" aria-label="Valor" />`;
    if (grp === 'date') return `<input data-k="value" type="date" value="${esc(String(c.value).slice(0, 10))}" aria-label="Fecha" />`;
    if (choices) return `<select data-k="value" aria-label="Valor"><option value="">Elige un valor…</option>${choices.map(([v, l]) => `<option value="${esc(v)}" ${String(c.value) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    return `<input data-k="value" type="text" value="${esc(c.value)}" placeholder="Valor" aria-label="Valor" />`;
  };
  const rowHtml = (c, i) => {
    const a = assocs.find((x) => x.key === c.assoc);
    const isSeg = c.assoc === SEGMENT_ASSOC;
    const ops = isSeg ? [['anyof', 'es miembro de'], ['noneof', 'no es miembro de']] : opsFor(condGroup(c));
    const value = valueHtml(c);
    const wide = value.startsWith('<div class="advc__multi"');
    const labels = associationLabelOptions();
    return `
      <div class="advc${a ? ' advc--assoc' : ''}${isSeg ? ' advc--seg' : ''}" data-i="${i}">
        <div class="advc__top">
          <select data-k="assoc" aria-label="Objeto o categoría">
            ${showCategories ? '<optgroup label="Propiedades">' : ''}
            <option value="">${esc(singular || SINGULAR[type] || type)} (este registro)</option>
            ${assocs.map((x) => `<option value="${x.key}" ${c.assoc === x.key ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}
            ${showCategories ? `</optgroup><optgroup label="Afiliaciones"><option value="${SEGMENT_ASSOC}" ${isSeg ? 'selected' : ''}>Afiliación a segmentos</option></optgroup><optgroup label="Eventos"><option value="" disabled>Interacciones con CTA (no disponible en esta versión)</option></optgroup>` : ''}
          </select>
          ${a && a.labels ? `<select data-k="label" aria-label="Etiqueta de asociación"><option value="">Cualquier registro asociado</option>${labels.map((l) => `<option value="${esc(l)}" ${c.label === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}
          <button class="icon-btn advc__remove" type="button" data-remove aria-label="Quitar condición">×</button>
        </div>
        <div class="advc__row${wide ? ' advc__row--wide' : ''}">
          ${isSeg ? '<input type="hidden" data-k="key" value="membership" /><span class="advc__fixed">Pertenencia</span>' : `<select data-k="key" aria-label="Propiedad"><option value="">Propiedad…</option>${a ? assocPropertyOptions(a.key, c.key) : propertyOptions(c.key)}</select>`}
          <select data-k="op" aria-label="Condición" ${c.key ? '' : 'disabled'}>${ops.map(([v, l]) => `<option value="${v}" ${c.op === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          ${value}
        </div>
      </div>`;
  };
  function render() {
    let conds = get();
    if (!conds.length) { conds = [newCondition(0)]; set(conds); }
    conds.forEach((c) => {
      c.group = Number(c.group) || 0;
      c.assoc = c.assoc || '';
      c.label = c.label || '';
      c.value2 = c.value2 || '';
      if (c.assoc === SEGMENT_ASSOC) { c.key = 'membership'; if (!['anyof', 'noneof'].includes(c.op)) c.op = 'anyof'; } else if (c.key) c.op = normalizeOp(c.op, condGroup(c));
    });
    const groupIds = [...new Set(conds.map((c) => c.group))].sort((a, b) => a - b);
    const counts = countConditions(conds);
    const full = counts.total >= LIMITS.conditions;
    container.innerHTML = groupIds.map((g, gi) => {
      const idx = conds.map((c, i) => [c, i]).filter(([c]) => c.group === g);
      return `
        ${gi > 0 ? '<div class="advg__or"><span>O</span></div>' : ''}
        <section class="advg" data-g="${g}">
          <header class="advg__head">
            <strong>Grupo ${gi + 1}</strong>
            <span class="muted">se cumplen todas las condiciones</span>
            <span class="advg__tools"><button class="link-btn" type="button" data-clone-group="${g}" title="Clonar grupo">Clonar</button>${groupIds.length > 1 ? `<button class="icon-btn" type="button" data-remove-group="${g}" aria-label="Quitar grupo">×</button>` : ''}</span>
          </header>
          ${idx.map(([c, i], j) => `${j > 0 ? '<div class="advc__and">Y</div>' : ''}${rowHtml(c, i)}`).join('')}
          <button class="link-btn advg__add" type="button" data-add-cond="${g}" ${full ? 'disabled title="Límite de 250 filtros"' : ''}>+ Añadir condición (Y)</button>
        </section>`;
    }).join('');
    if (summary) summary.textContent = summaryText(conds) + (counts.total ? ` · ${counts.total}/${LIMITS.conditions} filtros${counts.associated ? ` (${counts.associated}/${LIMITS.associated} asociados)` : ''}` : '');
  }
  const changed = () => { if (onChange) onChange(get()); };
  container.addEventListener('change', (e) => {
    if (!e.target.matches('[data-multi]')) return;
    const row = e.target.closest('.advc');
    const c = get()[Number(row.dataset.i)];
    c.value = [...row.querySelectorAll('[data-multi]:checked')].map((b) => b.value);
    if (summary) summary.textContent = summaryText(get());
    changed();
  });
  container.addEventListener('input', (e) => {
    const row = e.target.closest('.advc');
    if (!row || !e.target.dataset.k) return;
    const conds = get();
    const c = conds[Number(row.dataset.i)];
    const k = e.target.dataset.k;
    c[k] = e.target.value;
    if (k === 'assoc') {
      if (c.assoc && c.assoc !== SEGMENT_ASSOC && countConditions(conds).associated > LIMITS.associated) { c.assoc = ''; }
      c.key = c.assoc === SEGMENT_ASSOC ? 'membership' : ''; c.op = c.assoc === SEGMENT_ASSOC ? 'anyof' : ''; c.value = ''; c.value2 = ''; c.label = '';
    }
    if (k === 'key') { c.op = opsFor(condGroup(c))[0][0]; c.value = ''; c.value2 = ''; }
    if (k === 'op') { c.value = Array.isArray(c.value) || TWO_VALUE_OPS.has(c.op) || DAYS_OPS.has(c.op) || NO_VALUE_OPS.has(c.op) ? '' : c.value; c.value2 = ''; }
    if (k === 'assoc' || k === 'key' || k === 'op') render();
    else if (summary) summary.textContent = summaryText(conds);
    changed();
  });
  container.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]');
    const rmGroup = e.target.closest('[data-remove-group]');
    const clone = e.target.closest('[data-clone-group]');
    const add = e.target.closest('[data-add-cond]');
    let conds = get();
    if (rm) conds.splice(Number(rm.closest('.advc').dataset.i), 1);
    else if (rmGroup) conds = conds.filter((c) => c.group !== Number(rmGroup.dataset.removeGroup));
    else if (clone) {
      const g = Number(clone.dataset.cloneGroup);
      const next = conds.reduce((m, c) => Math.max(m, Number(c.group) || 0), -1) + 1;
      conds.filter((c) => c.group === g).forEach((c) => conds.push({ ...c, value: Array.isArray(c.value) ? c.value.slice() : c.value, group: next }));
    } else if (add) { if (countConditions(conds).total >= LIMITS.conditions) return; conds.push(newCondition(Number(add.dataset.addCond))); }
    else return;
    set(conds);
    render();
    changed();
  });
  return {
    render,
    addGroup() { const conds = get(); const next = conds.reduce((m, c) => Math.max(m, Number(c.group) || 0), -1) + 1; conds.push(newCondition(next)); set(conds); render(); changed(); },
    clear() { set([]); render(); changed(); },
    summaryText,
  };
}

// Natural-language helper (optional in the specification): turns a short description into conditions by
// matching property labels and list values. The person can edit the result afterwards.
export function suggestConditions(type, text) {
  const q = String(text || '').toLowerCase();
  if (!q.trim()) return [];
  const props = propertyMap(type);
  const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const out = [];
  const used = new Set();
  Object.values(props).forEach((p) => {
    if (used.size >= 6 || !Array.isArray(p.options) || !p.options.length || used.has(p.key)) return;
    p.options.forEach((o) => {
      const label = Array.isArray(o) ? o[1] : o;
      const value = Array.isArray(o) ? o[0] : o;
      if (used.has(p.key) || !label || norm(label).length < 4) return;
      if (norm(q).includes(norm(label))) { out.push({ ...newCondition(0), key: p.key, op: 'anyof', value: [String(value)] }); used.add(p.key); }
    });
  });
  const words = [['sin propietario', 'owner', 'empty'], ['con correo', 'email', 'filled'], ['sin correo', 'email', 'empty'], ['con telefono', 'phone', 'filled'], ['sin telefono', 'phone', 'empty'], ['con dominio', 'domain', 'filled'], ['sin dominio', 'domain', 'empty']];
  words.forEach(([w, key, op]) => { if (norm(q).includes(w) && props[key] && !used.has(key)) { out.push({ ...newCondition(0), key, op }); used.add(key); } });
  const city = q.match(/\ben (?:la ciudad de )?([a-záéíóúñ]+(?: [a-záéíóúñ]+)*?)(?=\s+(?:y|con|sin|que|cuya|cuyo)\b|,|$)/);
  if (city && props.city && !used.has('city')) out.push({ ...newCondition(0), key: 'city', op: 'contains', value: city[1].trim() });
  return out;
}
