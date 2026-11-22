import { updateActivity } from './data.js';
import { playRecording } from './call.js';
import { ACT_ICONS } from './action-icons.js';
import { supabase } from './supabaseClient.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const outcomes = ['Conectado', 'Ocupado', 'Dejó mensaje en directo', 'Dejó mensaje de voz', 'No contesta', 'Número equivocado'];

export function openCallDetail(row, { contactName = '', duration = '—', onSaved = () => {} } = {}) {
  const previous = document.activeElement;
  const drawer = document.createElement('div');
  drawer.className = 'drawer is-open';
  drawer.id = 'call-detail';
  const manual = row.source === 'log';
  const direction = row.direction === 'outbound' ? 'Saliente' : row.direction === 'inbound' ? 'Entrante' : '—';
  const recordType = row.activity?.recordType || 'contacts';
  const recordId = row.activity?.recordId || row.contactId;
  const linked = ['contacts', 'companies', 'deals', 'tickets'].includes(recordType) && recordId;
  drawer.innerHTML = `<section class="drawer__panel" role="dialog" aria-modal="true" aria-labelledby="call-detail-title">
    <header class="drawer__head"><h2 id="call-detail-title">${esc(row.title)}</h2><button class="drawer__close" type="button" aria-label="Cerrar">×</button></header>
    <div class="drawer__body">
      <dl class="props">
        <div class="props__row"><dt>Fecha y hora</dt><dd>${esc(new Date(row.when).toLocaleString('es-MX'))}</dd></div>
        <div class="props__row"><dt>Duración</dt><dd>${esc(duration)}</dd></div>
        <div class="props__row"><dt>Dirección</dt><dd><span class="calls__direction">${row.direction === 'outbound' ? ACT_ICONS.outbound : row.direction === 'inbound' ? ACT_ICONS.inbound : ''} ${direction}</span></dd></div>
        <div class="props__row"><dt>Responsable</dt><dd>${esc(row.owner || '—')}</dd></div>
        <div class="props__row"><dt>Registro asociado</dt><dd>${linked ? `<a href="../${recordType}/record/?id=${encodeURIComponent(recordId)}">${esc(contactName || `${recordType} #${recordId}`)}</a>` : 'Sin registros asociados'}</dd></div>
      </dl>
      ${manual ? `<label class="field"><span>Resultado</span><select id="call-detail-outcome">${[...new Set([row.status, ...outcomes])].filter(Boolean).map((o) => `<option${o === row.status ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
      <label class="field"><span>Notas</span><textarea id="call-detail-notes" rows="8">${esc(row.notes)}</textarea></label>` : `<div><strong>Resultado</strong><p>${esc(row.status || '—')}</p></div><div><strong>Notas</strong><p style="white-space:pre-wrap">${esc(row.notes || 'Sin notas')}</p></div>
      <section><h3>Grabación</h3>${row.recording ? '<button type="button" class="btn btn--ghost" data-detail-play>▶ Escuchar grabación</button>' : '<p>Sin grabación</p>'}</section>
      <details><summary>Transcripción</summary><p data-detail-transcript style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(row.transcript || row.transcriptError?.message || 'Sin transcripción')}</p>${row.recording && !row.transcript ? '<button type="button" class="btn btn--ghost" data-detail-transcribe>Transcribir</button>' : ''}</details>`}
      <p role="status" data-detail-status></p>
    </div>
    <footer class="drawer__foot">${manual ? '<button class="btn btn--primary" type="button" data-detail-save>Guardar</button>' : ''}<button class="btn btn--ghost" type="button" data-detail-close>Cerrar</button></footer>
  </section>`;
  document.body.appendChild(drawer);
  let saving = false;
  const status = drawer.querySelector('[data-detail-status]');
  const close = () => {
    if (saving) return;
    drawer.querySelectorAll('audio').forEach((audio) => {
      audio.pause();
      if (audio.dataset.recordingUrl) URL.revokeObjectURL(audio.dataset.recordingUrl);
      audio.removeAttribute('src');
      audio.load();
    });
    drawer.remove();
    document.removeEventListener('keydown', onKey, true);
    if (previous?.isConnected) previous.focus();
    else ([...document.querySelectorAll('[data-callrow]')].find((tr) => tr.dataset.callrow === row.id)
      || document.querySelector('[data-callrow]'))?.focus();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
    if (event.key === 'Tab') {
      const items = [...drawer.querySelectorAll('button:not(:disabled), a, select:not(:disabled), textarea:not(:disabled), summary, audio[controls]')]
        .filter((item) => !item.hidden && (!item.closest('details:not([open])') || item.tagName === 'SUMMARY'));
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', onKey, true);
  drawer.querySelector('.drawer__close').onclick = close;
  drawer.querySelector('[data-detail-close]').onclick = close;
  drawer.onclick = (event) => { if (event.target === drawer) close(); };
  drawer.querySelector('.drawer__close').focus();
  drawer.querySelector('[data-detail-play]')?.addEventListener('click', (event) => playRecording(event.currentTarget, row.callSid));
  drawer.querySelector('[data-detail-transcribe]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    status.textContent = 'Transcribiendo…';
    try {
      const { data, error } = await supabase.functions.invoke('twilio-transcribe', { body: { callSid: row.callSid } });
      if (error || data?.error) throw new Error(data?.error || error.message);
      row.transcript = data?.transcript || '';
      drawer.querySelector('[data-detail-transcript]').textContent = row.transcript || 'Sin transcripción';
      status.textContent = 'Transcripción lista';
      button.hidden = Boolean(row.transcript);
    } catch (error) { status.textContent = `No se pudo transcribir: ${error.message}`; }
    finally { button.disabled = false; }
  });
  drawer.querySelector('[data-detail-save]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    saving = true;
    button.disabled = true;
    status.textContent = 'Guardando…';
    const outcome = drawer.querySelector('select').value;
    const notes = drawer.querySelector('textarea').value;
    drawer.querySelectorAll('select, textarea').forEach((input) => { input.disabled = true; });
    try {
      await updateActivity(row.activity.id, { text: notes || row.title, extra: { outcome, notes } });
      onSaved();
      status.textContent = 'Llamada guardada';
    } catch (error) { status.textContent = `No se pudo guardar: ${error.message}`; }
    finally {
      saving = false;
      button.disabled = false;
      drawer.querySelectorAll('select, textarea').forEach((input) => { input.disabled = false; });
    }
  });
  return drawer;
}
