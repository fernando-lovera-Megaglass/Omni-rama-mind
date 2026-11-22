import { OUTCOMES_KEY, outcomeSettings } from './activity-outcomes.js';
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const outcomesPaneHtml = () => '<section data-outcomes-settings></section>';
export function mountOutcomesSettings(root, { load, save, toast }) {
  const rows = () => outcomeSettings(load);
  const paint = () => {
    const list = rows();
    root.innerHTML = `<h3>Resultados de llamadas y reuniones</h3><p class="muted">Los resultados ocultos siguen disponibles en actividades antiguas y sus filtros. Renombrar conserva el nombre registrado en el historial.</p>
      <table class="mini-table stable"><thead><tr><th>Nombre</th><th>Estado</th><th>Orden y visibilidad</th></tr></thead><tbody>${list.map((row, i) => `<tr data-outcome-row="${i}"><td><form data-outcome-rename="${i}"><input name="name" aria-label="Nombre del resultado" value="${esc(row.name)}" required /><button class="btn btn--secondary" type="submit">Renombrar</button></form></td><td>${row.active ? 'Visible' : 'Oculto'}</td><td><button type="button" data-outcome-action="up" aria-label="Subir ${esc(row.name)}" ${i === 0 ? 'disabled' : ''}>▲</button><button type="button" data-outcome-action="down" aria-label="Bajar ${esc(row.name)}" ${i === list.length - 1 ? 'disabled' : ''}>▼</button><button type="button" data-outcome-action="toggle">${row.active ? 'Ocultar' : 'Mostrar'}</button></td></tr>`).join('')}</tbody></table>
      <form data-outcome-add><label>Nuevo resultado <input name="name" required /></label><button class="btn btn--primary" type="submit">Agregar resultado</button></form>`;
  };
  const commit = list => { save(OUTCOMES_KEY, list); paint(); };
  root.addEventListener('submit', event => {
    const form = event.target.closest('[data-outcome-add], [data-outcome-rename]');
    if (!form) return;
    event.preventDefault();
    const list = rows(), name = form.elements.name.value.trim();
    const index = form.hasAttribute('data-outcome-rename') ? Number(form.dataset.outcomeRename) : -1;
    if (!name || list.some((row, i) => i !== index && row.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { toast('Escribe un nombre único y no vacío'); return; }
    if (index < 0) list.push({ name, active: true }); else list[index].name = name;
    commit(list);
  });
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-outcome-action]');
    if (!button) return;
    const list = rows(), index = Number(button.closest('[data-outcome-row]').dataset.outcomeRow);
    const action = button.dataset.outcomeAction;
    if (action === 'toggle') list[index].active = !list[index].active;
    else { const target = index + (action === 'up' ? -1 : 1); if (target < 0 || target >= list.length) return; [list[index], list[target]] = [list[target], list[index]]; }
    commit(list);
  });
  paint();
}
