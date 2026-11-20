import { supabase, DB_MODE } from './supabaseClient.js';
import { activityIdForComment } from './data.js';
import { currentUser, userLabel } from './auth.js';
import { ownerHtml } from './owner.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const localKey = (id) => `crm:activity-comments:${id}`;
export async function readComments(id) {
  if (!DB_MODE) return JSON.parse(localStorage.getItem(localKey(id)) || '[]');
  const { data, error } = await supabase.from('activity_comments').select('*').eq('activity_id', id).order('fecha').order('id');
  if (error) throw error;
  return data;
}
export async function saveComment(id, text) {
  const texto = text.trim();
  if (!texto || texto.length > 5000) throw new Error('Escribe un comentario de hasta 5000 caracteres.');
  const user = await currentUser();
  const row = { activity_id: id, texto, autor: userLabel(user) || 'Tú' };
  if (DB_MODE) {
    const { error } = await supabase.from('activity_comments').insert(row);
    if (error) throw error;
  } else {
    const rows = await readComments(id);
    rows.push({ ...row, id: crypto.randomUUID(), fecha: new Date().toISOString() });
    localStorage.setItem(localKey(id), JSON.stringify(rows));
  }
}

export function mountActivityComments(container, ev, recordType, recordId) {
  let activityId = ev.id;
  let opened = false;
  let busy = false;
  container.className = 'activity-comments';
  container.innerHTML = `<button type="button" class="btn btn--link btn--sm" data-comment-toggle aria-expanded="false">Comentar <span data-comment-count>(…)</span></button>
    <div data-comment-thread hidden><ul data-comment-list></ul><form><textarea name="comment" aria-label="Comentario" placeholder="Escribe un comentario…" maxlength="5000" required rows="2"></textarea><button type="submit" class="btn btn--primary btn--sm">Publicar comentario</button></form></div><p data-comment-error role="alert" hidden></p>`;
  const toggle = container.querySelector('[data-comment-toggle]');
  const errorEl = container.querySelector('[data-comment-error]');
  const form = container.querySelector('form');
  async function refresh() {
    // Reading a counter must never create an activity.
    activityId ||= await activityIdForComment(ev, recordType, recordId, false);
    if (!activityId) {
      container.querySelector('[data-comment-count]').textContent = '(0)';
      container.querySelector('[data-comment-list]').innerHTML = '<li class="muted">Sin comentarios todavía.</li>';
      return;
    }
    const rows = await readComments(activityId);
    container.querySelector('[data-comment-count]').textContent = `(${rows.length})`;
    container.querySelector('[data-comment-list]').innerHTML = rows.length ? rows.map((row) => `<li>${ownerHtml(row.autor)} <time datetime="${esc(row.fecha)}">${esc(new Date(row.fecha).toLocaleString('es-MX'))}</time><p>${esc(row.texto)}</p></li>`).join('') : '<li class="muted">Sin comentarios todavía.</li>';
  }
  function showError(error) {
    errorEl.hidden = false;
    errorEl.textContent = `No se pudieron cargar o guardar los comentarios. ${error.message || 'Inténtalo de nuevo.'}`;
  }
  toggle.onclick = async () => {
    opened = !opened;
    toggle.setAttribute('aria-expanded', String(opened));
    container.querySelector('[data-comment-thread]').hidden = !opened;
    if (opened) {
      try { await refresh(); } catch (error) { showError(error); }
      form.elements.comment.focus();
    }
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (busy || !form.elements.comment.value.trim()) return;
    busy = true;
    form.querySelector('button').disabled = true;
    errorEl.hidden = true;
    try {
      activityId ||= await activityIdForComment(ev, recordType, recordId);
      await saveComment(activityId, form.elements.comment.value);
      form.reset();
      await refresh();
    } catch (error) { showError(error); }
    finally { busy = false; form.querySelector('button').disabled = false; }
  };
  refresh().catch(showError);
}
