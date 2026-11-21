const esc = (s) => String(s ?? "").replace(/[&<>"\']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "\'":"&#39;"}[c]));
const dateInput = v => v ? new Date(v).toISOString().slice(0, 10) : "";
import { datetimeInput } from './task-reminders.js';
export function propertyEditor(f, r, props = {}) {
  const [key, , kind, options] = f;
  const v = r[key] ?? '';
  // Owner / user properties get the avatar dropdown (src/owner-select.js) on top of the native select.
  if (kind === 'select') return `<select data-edit="${key}"${key === 'owner' || (props[key] && props[key].kind === 'user') ? ' data-owner-select' : ''}>${options.map((o) => `<option value="${esc(o[0])}" ${String(o[0]) === String(v) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
  if (kind === 'textarea') return `<textarea data-edit="${key}" rows="3">${esc(v)}</textarea>`;
  if (kind === 'date') return `<input data-edit="${key}" type="date" value="${dateInput(v)}" />`;
  if (kind === 'datetime') return `<input data-edit="${key}" type="datetime-local" value="${datetimeInput(v)}" />`;
  return `<input data-edit="${key}" type="${kind || 'text'}" value="${esc(v)}" />`;
}
