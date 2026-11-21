// Shared empty state, as the original's: a centred illustration, a title, a line of help and the primary
// action of the module («Crear contacto», «Nueva plantilla», «Crear secuencia», «Crear workflow»…). Used by
// the lists, Llamadas, the Bandeja de entrada (list and thread pane), Plantillas, Secuencias and Workflows.
// The illustration is an inline SVG drawn with currentColor (so the dark theme tints it) plus the brand
// accent; its badge carries the module's own line icon (src/action-icons.js), so every module looks related.
import { ACT_ICONS, OBJECT_ICONS } from './action-icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const inner = (svg) => String(svg || '').replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
// Which line icon sits in the badge of each illustration.
const GLYPHS = {
  contacts: OBJECT_ICONS.contacts, companies: OBJECT_ICONS.companies, deals: OBJECT_ICONS.deals, tickets: OBJECT_ICONS.tickets, tasks: OBJECT_ICONS.tasks,
  records: ACT_ICONS.list, calls: ACT_ICONS.call, inbox: ACT_ICONS.chat, templates: ACT_ICONS.form, sequences: ACT_ICONS.sequence, workflows: ACT_ICONS.workflow,
};
export const EMPTY_ARTS = Object.keys(GLYPHS);
// Two stacked cards with text lines and the accent badge; 120×96.
export function emptyArtSvg(kind = 'records') {
  const glyph = inner(GLYPHS[kind] || GLYPHS.records);
  return `<svg class="estate__svg" viewBox="0 0 120 96" width="120" height="96" aria-hidden="true" focusable="false">
    <rect x="24" y="10" width="74" height="58" rx="8" class="estate__card estate__card--back" />
    <rect x="12" y="24" width="74" height="60" rx="8" class="estate__card" />
    <path d="M26 42h30M26 54h46M26 66h38" class="estate__lines" />
    <circle cx="92" cy="30" r="17" class="estate__badge" />
    <g transform="translate(80 18)" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
  </svg>`;
}
// action: { label, attrs } renders a primary button with those attributes (e.g. 'data-action="create"');
// { label, href } renders a link styled as the primary button.
export function emptyStateHtml({ art = 'records', title, text = '', action = null, secondary = null, compact = false, className = '', id = '' } = {}) {
  const button = (a, cls) => (!a ? '' : a.href ? `<a class="btn ${cls}" href="${esc(a.href)}" ${a.attrs || ''}>${esc(a.label)}</a>` : `<button class="btn ${cls}" type="button" ${a.attrs || ''}>${esc(a.label)}</button>`);
  return `<div class="estate${compact ? ' estate--compact' : ''}${className ? ` ${className}` : ''}"${id ? ` id="${esc(id)}"` : ''} role="status">
    <span class="estate__art" aria-hidden="true">${emptyArtSvg(art)}</span>
    <h3 class="estate__title">${esc(title)}</h3>
    ${text ? `<p class="estate__text">${esc(text)}</p>` : ''}
    ${action || secondary ? `<div class="estate__actions">${button(action, 'btn--primary')}${button(secondary, 'btn--secondary')}</div>` : ''}
  </div>`;
}
