// Import wizard (Gestión de datos › Integración de datos › Importar datos) for contacts, companies, deals,
// tickets and tasks: upload or paste, map columns to properties (with inline fixes and new properties),
// details and consent, then the review page with the state timeline, counts, error tables and downloads.
// Rules: import-engine.js (from especificacion-importacion-contactos-crm.md).
import { boot } from './page.js';
import { toast } from './shell.js';
import * as E from './import-engine.js';
import { propertyGroups } from './properties.js';
import { refreshTable, dbIsLive } from './data.js';

const params = new URLSearchParams(location.search);
const initialObject = E.OBJECTS[params.get('object')] ? params.get('object') : 'contacts';
boot({ root: '../../', active: 'data', sub: 'Integración de datos', title: `Importar ${E.objectDef(initialObject).label.toLowerCase()}` });

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const root = document.getElementById('imp-root');
const $ = (id) => document.getElementById(id);
const fmtTime = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`; };
const fmtDate = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

const state = {
  step: 1,
  flow: initialObject === 'contacts' ? 'quick' : 'advanced',
  object: initialObject,
  language: 'es',
  table: null,
  fileError: '',
  mapping: [],
  panelColumn: null,
  newProp: null,
  name: '',
  options: { mode: 'create_update', fileDuplicates: 'first', uniqueKey: E.objectDef(initialObject).defaultUnique, dateFormat: 'dmy', numberFormat: 'auto', timezone: 'America/Mexico_City', consent: false, createSegment: false, marketing: false, legalBasis: '' },
  dupCheck: { live: false, at: null, pending: false }, // whether the duplicate check ran against a fresh read of Supabase
  importId: params.get('id') ? Number(params.get('id')) : null,
  progress: null,
  canceled: false,
};
const def = () => E.objectDef(state.object);
const objLabel = () => def().label.toLowerCase();

E.sweepStale();

// ---------- shared pieces ----------
const STEPS = [['Subir archivo', 1], ['Mapear columnas', 2], ['Detalles', 3], ['Revisión', 4]];
const stepper = (current) => `<ol class="imp__steps">${STEPS.map(([l, n]) => `<li class="${n === current ? 'is-current' : n < current ? 'is-done' : ''}"><span class="imp__stepnum">${n < current ? '✓' : n}</span>${l}</li>`).join('')}</ol>`;
const frame = (inner, step, title) => `
  <div class="dint__head"><a class="imp__back" href="../">‹ Integración de datos</a><h1>${esc(title || `Importar ${objLabel()}`)}</h1><span class="imp__flow">${state.flow === 'quick' ? 'Importación rápida' : 'Importación avanzada'}</span></div>
  <div class="imp__body">${stepper(step)}${inner}</div>`;

function downloadBytes(name, bytes, type) {
  const blob = new Blob([bytes], { type });
  if (typeof URL.createObjectURL !== 'function') { toast(`Descarga lista: ${name}`); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- step 1: object and file ----------
function renderStep1() {
  const t = state.table;
  const d = def();
  root.innerHTML = frame(`
    <section class="imp__card">
      <h2>1. Elige cómo importar</h2>
      <div class="imp__flows">
        <label class="radio${state.flow === 'quick' ? ' is-on' : ''}"><input type="radio" name="flow" value="quick" ${state.flow === 'quick' ? 'checked' : ''} /> <span><strong>Importación rápida</strong><small>Solo contactos. Pocos pasos, sin asociaciones ni ajustes avanzados.</small></span></label>
        <label class="radio${state.flow === 'advanced' ? ' is-on' : ''}"><input type="radio" name="flow" value="advanced" ${state.flow === 'advanced' ? 'checked' : ''} /> <span><strong>Importación avanzada</strong><small>Contactos, empresas, negocios, tickets o tareas, con asociación a empresas y opciones avanzadas. Un objeto y un archivo por importación.</small></span></label>
      </div>
      ${state.flow === 'advanced' ? `<label class="field imp__lang"><span>Objeto a importar</span><select id="imp-object">${E.OBJECT_KEYS.map((k) => `<option value="${k}" ${state.object === k ? 'selected' : ''}>${E.OBJECTS[k].label}</option>`).join('')}</select><small class="muted">Propiedades obligatorias para crear ${objLabel()}: ${esc(d.requiredText)}.</small></label>` : `<p class="muted">Propiedades obligatorias para crear contactos: ${esc(d.requiredText)}.</p>`}
      <h2>2. Sube el archivo o pega los datos</h2>
      <div class="imp__upload">
        <label class="dropzone imp__drop"><input type="file" id="imp-file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" /><span><strong>Arrastra un archivo aquí o haz clic para elegirlo</strong><br /><span class="muted">.csv, .xlsx o .xls · una sola hoja · máximo ${E.LIMITS.fileBytes / 1048576} MB</span></span></label>
        <div class="imp__or">o</div>
        <label class="field"><span>Pega los datos desde una hoja de cálculo (con la fila de encabezados)</span><textarea id="imp-paste" rows="4" placeholder="${esc(E.sampleCsv(state.object).split('\n').slice(0, 2).join('\n').replace(/,/g, '\t'))}"></textarea></label>
        <div class="imp__row"><button class="btn btn--ghost btn--sm" type="button" data-act="use-paste">Usar los datos pegados</button><button class="link-btn" type="button" data-act="sample">Descargar archivo de ejemplo de ${objLabel()}</button></div>
      </div>
      <label class="field imp__lang"><span>Idioma de los encabezados</span><select id="imp-lang"><option value="es" ${state.language === 'es' ? 'selected' : ''}>Español</option><option value="en" ${state.language === 'en' ? 'selected' : ''}>English</option></select><small class="muted">Mejora el mapeo automático; si no coincide, se prueba en inglés.</small></label>
      ${state.fileError ? `<p class="imp__error" role="alert">${esc(state.fileError)}</p>` : ''}
      ${t ? `<p class="imp__ok"><strong>${esc(t.fileName)}</strong> · ${t.rows.length.toLocaleString('es-ES')} filas · ${t.headers.length} columnas${t.format === 'xlsx' || t.format === 'xls' ? ' · 1 hoja' : ''}${t.warnings.length ? ` · <span class="imp__warn">${t.warnings.length} columna(s) sin encabezado se omitirán</span>` : ''}</p>` : ''}
      <details class="adv-help imp__rules"><summary>Requisitos del archivo</summary>
        <ul><li>Formatos .csv, .xlsx o .xls, con una sola hoja y codificación UTF-8.</li><li>Fila de encabezados obligatoria: cada encabezado es una propiedad; el orden no importa. Menos de 1.000 columnas.</li><li>Un registro por fila. Identificadores únicos de ${objLabel()}: ${d.unique.map((k) => E.UNIQUE_LABELS[k]).join(', ')}.</li><li>Celdas en blanco: se ignoran, nunca borran valores existentes.</li><li>Límites: ${E.LIMITS.fileBytes / 1048576} MB por archivo, ${E.LIMITS.importsPerDay} importaciones y ${E.LIMITS.rowsPerDay.toLocaleString('es-ES')} filas por día (ventana de 24 horas), ${E.LIMITS.concurrent} importaciones simultáneas (la cuarta queda en cola), 1 MB por celda.</li></ul>
      </details>
      <div class="imp__foot"><a class="btn btn--ghost" href="../">Cancelar</a><button class="btn btn--primary" type="button" data-act="next1" ${t ? '' : 'disabled'}>Siguiente</button></div>
    </section>`, 1);
}
async function loadFile(file) {
  state.fileError = '';
  state.table = null;
  try {
    state.table = await E.parseFile(file);
    state.name = file.name.replace(/\.(csv|xlsx|xls|txt|tsv)$/i, '');
    state.mapping = E.autoMap(state.table.headers, state.language, state.object);
  } catch (e) {
    state.fileError = `${e.code ? `${e.code}: ` : ''}${e.message}`;
  }
  renderStep1();
}
function usePasted(text) {
  state.fileError = '';
  state.table = null;
  try {
    state.table = E.parsePasted(text);
    state.name = `Datos pegados ${fmtDate(new Date().toISOString())}`;
    state.mapping = E.autoMap(state.table.headers, state.language, state.object);
  } catch (e) {
    state.fileError = `${e.code ? `${e.code}: ` : ''}${e.message}`;
  }
  renderStep1();
}

// ---------- step 2: mapping ----------
function propertyOptions(selected) {
  return propertyGroups(state.object).map((g) => `<optgroup label="${esc(g.title)}">${g.items.map(([k, l]) => `<option value="${k}" ${selected === k ? 'selected' : ''}>${esc(l)}${E.isUnique(k, state.object) ? ' 🔑' : ''}</option>`).join('')}</optgroup>`).join('');
}
function renderStep2() {
  const t = state.table;
  const cols = E.validateColumns(t, state.mapping, { ...state.options, object: state.object });
  const previewOf = (i) => t.rows.slice(0, 2).map((r) => r[i]).filter(Boolean).map(esc).join(' · ') || '<span class="muted">—</span>';
  const used = new Set(state.mapping.filter((m) => m.key && !m.skip).map((m) => m.key));
  const unmapped = cols.filter((m) => m.header && (!m.key || m.skip)).length;
  const totalErrors = cols.reduce((s, m) => s + m.errors, 0);
  const d = def();
  root.innerHTML = frame(`
    <section class="imp__card">
      <h2>Mapea las columnas del archivo a propiedades de ${esc(d.singular)}</h2>
      <p class="muted">Cada columna necesita una propiedad; las que no se asignen no se importan. El icono 🔑 marca los identificadores únicos (${d.unique.map((k) => E.UNIQUE_LABELS[k]).join(', ')}). ${t.rows.length > 1000 ? '<strong>Con más de 1.000 filas puede haber errores no resueltos en esta etapa.</strong>' : ''}</p>
      <p class="imp__summary">${used.size} de ${t.headers.filter(Boolean).length} columnas asignadas${unmapped ? ` · ${unmapped} sin importar` : ''}${totalErrors ? ` · <span class="imp__warn">${totalErrors} valores con errores</span>` : ' · sin errores'}</p>
      <div class="table-wrap"><table class="table imp__map">
        <thead><tr><th>Columna del archivo</th><th>Vista previa</th><th>Propiedad de ${esc(d.singular)}</th><th>No sobrescribir</th><th>Asignado</th></tr></thead>
        <tbody>${cols.map((m) => `
          <tr data-i="${m.index}" class="${m.skip && m.header ? 'is-skipped' : ''}">
            <td><strong>${m.header ? esc(m.header) : '<span class="muted">(sin encabezado)</span>'}</strong></td>
            <td class="muted">${previewOf(m.index)}</td>
            <td>${m.header ? `<select data-map="${m.index}" aria-label="Propiedad para ${esc(m.header)}"><option value="">No importar columna</option>${propertyOptions(m.skip ? '' : m.key)}<option value="__new">＋ Crear nueva propiedad…</option></select>${state.newProp === m.index ? `<div class="imp__newprop"><input type="text" id="np-name" placeholder="Nombre de la propiedad" value="${esc(m.header)}" /><select id="np-kind"><option value="text">Texto de una línea</option><option value="number">Número</option><option value="date">Fecha</option><option value="enum">Lista desplegable</option><option value="bool">Casilla</option></select><button class="btn btn--primary btn--sm" type="button" data-act="np-create" data-i="${m.index}">Crear</button><button class="btn btn--ghost btn--sm" type="button" data-act="np-cancel">Cancelar</button></div>` : ''}` : '<span class="muted">INCORRECT_COLUMN_COUNT: no se importa</span>'}</td>
            <td>${m.key && !m.skip ? `<label class="imp__check"><input type="checkbox" data-noover="${m.index}" ${m.noOverwrite ? 'checked' : ''} /> <span class="muted">Solo si nunca tuvo valor</span></label>` : ''}</td>
            <td>${m.key && !m.skip ? (m.errors ? `<button class="imp__errbtn" type="button" data-errors="${m.index}">[${m.errors}] errores</button>` : `<span class="imp__assigned">✓ Asignado${Object.keys(m.replacements || {}).length || (m.dropped || []).length ? ' <em>editado</em>' : ''}${E.isUnique(m.key, state.object) ? ' 🔑' : ''}</span>`) : '<span class="muted">—</span>'}</td>
          </tr>`).join('')}</tbody>
      </table></div>
      <div class="imp__foot"><button class="btn btn--ghost" type="button" data-act="back1">Atrás</button><button class="btn btn--primary" type="button" data-act="next2" ${used.size ? '' : 'disabled'}>Siguiente</button></div>
    </section>
    ${state.panelColumn !== null ? renderPanel(cols.find((m) => m.index === state.panelColumn)) : ''}`, 2);
}
function renderPanel(m) {
  if (!m) return '';
  const p = E.propByKey(state.object, m.key);
  return `
    <aside class="imp__panel" role="dialog" aria-label="Errores de la columna ${esc(m.header)}">
      <div class="imp__panel-head"><h3>${esc(m.header)} → ${esc(p ? p.label : m.key)}</h3><button class="icon-btn" type="button" data-act="panel-close" aria-label="Cerrar">×</button></div>
      <p class="muted">${m.errors} fila(s) con valores que no encajan en esta propiedad (filas ${m.rows.slice(0, 8).join(', ')}${m.rows.length > 8 ? '…' : ''}). Sustituir un valor lo cambia en todas las filas donde aparece.</p>
      <div class="imp__badlist">${m.badValues.map((b, i) => `
        <div class="imp__bad" data-bad="${i}">
          <div><code>${esc(b.value)}</code> <span class="muted">× ${b.count}</span><br /><small class="imp__warn">${b.code}: ${esc(E.errorMeaning(b.code))}</small></div>
          <div class="imp__badactions"><input type="text" placeholder="Sustituir por" aria-label="Sustituir ${esc(b.value)}" data-replace-input="${esc(b.value)}" /><button class="btn btn--primary btn--sm" type="button" data-replace="${esc(b.value)}">Sustituir</button><button class="btn btn--ghost btn--sm" type="button" data-drop="${esc(b.value)}">No importar este valor</button></div>
        </div>`).join('') || '<p class="muted">Sin errores pendientes en las primeras 1.000 filas.</p>'}</div>
      ${Object.keys(m.replacements || {}).length || (m.dropped || []).length ? `<p class="muted">Cambios: ${Object.entries(m.replacements).map(([a, b]) => `${esc(a)} → ${esc(b)}`).concat(m.dropped.map((x) => `${esc(x)} → (no importar)`)).join(' · ')}</p><button class="link-btn" type="button" data-act="panel-reset">Restablecer todos los cambios</button>` : ''}
    </aside>`;
}

// ---------- step 3: details ----------
function renderStep3() {
  const o = state.options;
  const d = def();
  const mapped = new Set(state.mapping.filter((m) => !m.skip).map((m) => m.key));
  const uniqueChoices = d.unique.filter((k) => k === 'hs_object_id' ? mapped.has('hs_object_id') : true);
  if (!uniqueChoices.includes(o.uniqueKey)) o.uniqueKey = uniqueChoices.includes(d.defaultUnique) ? d.defaultUnique : uniqueChoices[0];
  const plan = E.planImport(state.table, state.mapping, { ...o, object: state.object });
  const dup = E.analyzeDuplicates(state.table, state.mapping, { ...o, object: state.object });
  const onlyId = d.unique.length === 1;
  const n = (x) => Number(x || 0).toLocaleString('es-ES');
  const single = d.singular;
  const modeRadio = (value, title, small) => `<label class="radio${o.mode === value ? ' is-on' : ''}"><input type="radio" name="mode" value="${value}" ${o.mode === value ? 'checked' : ''} /> <span><strong>${title}</strong><small>${small}</small></span></label>`;
  const fileRadio = ([value, title, small]) => `<label class="radio${o.fileDuplicates === value ? ' is-on' : ''}"><input type="radio" name="filedups" value="${value}" ${o.fileDuplicates === value ? 'checked' : ''} /> <span><strong>${title}</strong><small>${small}</small></span></label>`;
  const dupsHtml = `
      <section class="imp__dups" id="imp-dups">
        <h3>Duplicados por ${esc(dup.keyLabel.toLowerCase())}</h3>
        <p class="muted">Comprobado contra los ${n(dup.checkedAgainst)} ${objLabel()} de la cuenta${state.dupCheck.live ? ' (lectura reciente de Supabase)' : state.dupCheck.pending ? ' (actualizando desde Supabase…)' : ''} y dentro del archivo. Los correos se comparan sin mayúsculas ni espacios; un correo adicional también identifica al ${esc(single)}.</p>
        <div class="imp__dupstats">
          <div class="imp__dupstat${dup.existingCount ? ' is-hit' : ''}"><strong>${n(dup.existingCount)}</strong> <span>${dup.existingCount === 1 ? 'fila coincide con un' : 'filas coinciden con'} ${dup.existingCount === 1 ? esc(single) : objLabel()} existente${dup.existingCount === 1 ? '' : 's'}</span></div>
          <div class="imp__dupstat${dup.inFileRows ? ' is-hit' : ''}"><strong>${n(dup.inFileRows)}</strong> <span>${dup.inFileRows === 1 ? 'fila repite' : 'filas repiten'} un valor ya usado en el archivo (${n(dup.inFile.length)} ${dup.inFile.length === 1 ? 'valor' : 'valores'})</span></div>
          <div class="imp__dupstat"><strong>${n(dup.newCount)}</strong> <span>${dup.newCount === 1 ? `${esc(single)} nuevo` : `${objLabel()} nuevos`} sin coincidencia</span></div>
          ${dup.withoutKey ? `<div class="imp__dupstat"><strong>${n(dup.withoutKey)}</strong> <span>filas sin ${esc(dup.keyLabel.toLowerCase())}: no se pueden desduplicar</span></div>` : ''}
        </div>
        <div class="imp__dupgrid">
          <fieldset class="field"><span>Qué hacer con los ${objLabel()} que ya existen (modo de importación)</span>
            ${modeRadio('create_update', 'Actualizar los existentes · Crear y actualizar', `Las ${n(dup.existingCount)} filas duplicadas actualizan al ${esc(single)} existente con los valores del archivo; las demás crean ${objLabel()} nuevos.`)}
            ${modeRadio('create', 'Saltar los duplicados · Solo crear', `Las ${n(dup.existingCount)} filas duplicadas no se importan (CREATE_ONLY_IMPORT); solo se crean los ${n(dup.newCount)} ${objLabel()} nuevos.`)}
            ${modeRadio('update', 'Solo actualizar los existentes', `Solo se actualizan los ${n(dup.existingCount)} ${objLabel()} existentes; las ${n(dup.newCount)} filas nuevas no se importan (UPDATE_ONLY_IMPORT).`)}
          </fieldset>
          <fieldset class="field"><span>Valores repetidos dentro del archivo</span>
            ${E.FILE_DUPLICATE_POLICIES.map(fileRadio).join('')}
          </fieldset>
        </div>
        ${dup.existing.length ? `<details class="imp__duplist" ${dup.existing.length <= 5 ? 'open' : ''}><summary>Ver coincidencias con ${objLabel()} existentes (${n(dup.existing.length)})</summary>
          <div class="table-wrap"><table class="table imp__duptable"><thead><tr><th>Fila</th><th>${esc(dup.keyLabel)}</th><th>${esc(single.charAt(0).toUpperCase() + single.slice(1))} existente</th><th>Propiedades que cambian</th><th>Acción</th></tr></thead><tbody>${dup.existing.slice(0, 50).map((x) => `<tr><td>${x.row}</td><td>${esc(x.value)}${x.secondary ? ' <small class="muted">(correo adicional)</small>' : ''}</td><td>${esc(x.matchName)}${x.matchValue && String(x.matchValue).toLowerCase() !== String(x.value).toLowerCase() ? ` <small class="muted">${esc(x.matchValue)}</small>` : ''}</td><td>${x.changes.length ? esc(x.changes.map((k) => (E.propByKey(state.object, k) || { label: k }).label).join(', ')) : '<span class="muted">sin cambios</span>'}</td><td>${o.mode === 'create' ? '<span class="tag tag--none">Se salta</span>' : '<span class="tag tag--open">Actualiza</span>'}</td></tr>`).join('')}</tbody></table></div>${dup.existing.length > 50 ? '<p class="muted">Se muestran las primeras 50 coincidencias.</p>' : ''}</details>` : ''}
        ${dup.inFile.length ? `<details class="imp__duplist"><summary>Ver valores repetidos en el archivo (${n(dup.inFile.length)})</summary><ul class="imp__dupvalues">${dup.inFile.slice(0, 50).map((g) => `<li><code>${esc(g.value)}</code> en las filas ${g.rows.join(', ')} → ${o.fileDuplicates === 'merge' ? 'se combinan en una' : o.fileDuplicates === 'last' ? `se importa la fila ${g.rows[g.rows.length - 1]}` : `se importa la fila ${g.rows[0]}`}</li>`).join('')}</ul></details>` : ''}
      </section>`;
  root.innerHTML = frame(`
    <section class="imp__card">
      <h2>Detalles de la importación</h2>
      <div class="imp__grid">
        <label class="field"><span>Nombre de la importación</span><input type="text" id="imp-name" value="${esc(state.name)}" maxlength="80" /></label>
        <label class="field"><span>Identificador único para buscar ${objLabel()} existentes 🔑</span><select id="imp-unique">${uniqueChoices.map((k) => `<option value="${k}" ${o.uniqueKey === k ? 'selected' : ''}>${E.UNIQUE_LABELS[k]}${k === 'hs_object_id' ? ' (prevalece sobre cualquier otro)' : mapped.has(k) ? '' : ' (no mapeado: solo se crearán registros)'}</option>`).join('')}</select>${onlyId && !mapped.has('hs_object_id') ? `<small class="muted">Los ${objLabel()} solo se actualizan con la columna ID de registro; sin ella, todas las filas crean registros nuevos.</small>` : ''}</label>
        <label class="field"><span>Formato de fecha</span><select id="imp-date"><option value="dmy" ${o.dateFormat === 'dmy' ? 'selected' : ''}>Día-mes-año (31/10/2026)</option><option value="mdy" ${o.dateFormat === 'mdy' ? 'selected' : ''}>Mes-día-año (10/31/2026)</option><option value="ymd" ${o.dateFormat === 'ymd' ? 'selected' : ''}>Año-mes-día (2026-10-31)</option></select></label>
        <label class="field"><span>Zona horaria</span><select id="imp-tz">${['America/Mexico_City', 'America/New_York', 'America/Bogota', 'Europe/Madrid'].map((z) => `<option ${o.timezone === z ? 'selected' : ''}>${z}</option>`).join('')}</select></label>
        <label class="field"><span>Formato de número</span><select id="imp-num"><option value="auto" ${o.numberFormat === 'auto' ? 'selected' : ''}>Detectar automáticamente</option><option value="en" ${o.numberFormat === 'en' ? 'selected' : ''}>1,234.56</option><option value="es" ${o.numberFormat === 'es' ? 'selected' : ''}>1.234,56</option></select></label>
        ${state.object === 'contacts' ? `<label class="field"><span>Base legal del procesamiento (opcional)</span><select id="imp-legal"><option value="">Sin especificar</option><option ${o.legalBasis === 'Consentimiento' ? 'selected' : ''}>Consentimiento</option><option ${o.legalBasis === 'Interés legítimo' ? 'selected' : ''}>Interés legítimo</option><option ${o.legalBasis === 'Contrato' ? 'selected' : ''}>Contrato</option></select></label>` : ''}
      </div>
      ${dupsHtml}
      <label class="imp__check imp__check--big"><input type="checkbox" id="imp-segment" ${o.createSegment ? 'checked' : ''} /> Crear un segmento (vista guardada de ${d.label}) con los registros de esta importación</label>
      ${state.object === 'contacts' ? `<label class="imp__check imp__check--big"><input type="checkbox" id="imp-marketing" ${o.marketing ? 'checked' : ''} /> Marcar como contactos de marketing</label>` : ''}
      <label class="imp__check imp__check--big imp__consent"><input type="checkbox" id="imp-consent" ${o.consent ? 'checked' : ''} /> <span><strong>${state.object === 'contacts' ? 'Confirmo que estos contactos esperan recibir comunicaciones y que no es una lista comprada.' : 'Confirmo que tengo permiso para usar estos datos y que no proceden de una lista comprada.'}</strong> <small class="muted">Obligatorio para finalizar.</small></span></label>
      <div class="imp__plan"><strong>Vista previa del resultado:</strong> ${plan.summary.rows.toLocaleString('es-ES')} filas · ${plan.summary.toCreate} ${objLabel()} nuevos · ${plan.summary.toUpdate} actualizaciones · ${plan.summary.skipped} filas no se importarán${plan.summary.merged ? ` · ${plan.summary.merged} filas combinadas` : ''}${plan.errors.length ? ` · ${plan.errors.length} errores` : ''}</div>
      <div class="imp__foot"><button class="btn btn--ghost" type="button" data-act="back2">Atrás</button><button class="btn btn--primary" type="button" data-act="finish" ${o.consent ? '' : 'disabled'}>Finalizar importación</button></div>
    </section>`, 3);
}

// Before the duplicate check, re-read the object's table from Supabase so records created from another
// browser (or by a previous import) count as existing. Local mode keeps the rows it has.
function refreshExisting() {
  if (!dbIsLive() || state.dupCheck.pending) return;
  state.dupCheck = { live: false, at: null, pending: true };
  refreshTable(state.object)
    .then(() => { state.dupCheck = { live: true, at: Date.now(), pending: false }; })
    .catch(() => { state.dupCheck = { live: false, at: null, pending: false }; })
    .then(() => { if (state.step === 3) renderStep3(); });
}

// ---------- finish: register and run ----------
async function finish() {
  const o = { ...state.options, object: state.object };
  const check = E.canStart(state.table.rows.length);
  if (!check.ok) { toast(`${check.code}: ${check.reason}`); return; }
  const plan = E.planImport(state.table, state.mapping, o);
  const entry = E.registerImport({ name: state.name || `Importación de ${objLabel()}`, table: state.table, plan, options: { ...o, mapping: state.mapping.map(({ index, header, key, skip, noOverwrite }) => ({ index, header, key, skip, noOverwrite })) } });
  state.importId = entry.id;
  state.canceled = false;
  history.replaceState(null, '', `?id=${entry.id}`);
  renderReview();
  if (entry.state === 'DEFERRED') {
    while (E.processingCount() >= E.LIMITS.concurrent && !state.canceled) { await new Promise((r) => setTimeout(r, 2000)); }
    if (state.canceled) { E.setState(entry.id, 'CANCELED', 'Cancelada mientras estaba en cola.'); renderReview(); return; }
    E.setState(entry.id, 'STARTED', 'Salió de la cola.');
  }
  await E.runImport(entry.id, { ...plan, noOverwrite: state.mapping.filter((m) => m.noOverwrite && m.key).map((m) => m.key), marketing: o.marketing, createSegment: o.createSegment, segmentName: `Importación: ${state.name}` }, {
    onProgress: (p) => { state.progress = p; renderReview(); },
    isCanceled: () => state.canceled,
  });
  state.progress = null;
  renderReview();
}

// ---------- review page ----------
function renderReview() {
  const entry = E.importHistory().find((r) => Number(r.id) === Number(state.importId));
  if (!entry) { root.innerHTML = frame('<section class="imp__card"><h2>Importación no encontrada</h2><p class="muted">No hay ninguna importación con ese identificador.</p><a class="btn btn--ghost" href="../">Volver</a></section>', 4, 'Importación'); return; }
  const type = E.OBJECTS[entry.object] ? entry.object : 'contacts';
  const d = E.importDetail(entry.id) || { timeline: [], errors: [], failedRows: [], headers: [] };
  const label = E.objectDef(type).label;
  const singular = E.objectDef(type).singular;
  const running = entry.state === 'PROCESSING' || entry.state === 'STARTED' || entry.state === 'DEFERRED';
  const groups = new Map();
  (d.errors || []).forEach((e) => { const k = `${e.column}|${e.key}|${e.code}`; const g = groups.get(k) || { column: e.column, key: e.key, code: e.code, impact: e.impact, count: 0 }; g.count += 1; groups.set(k, g); });
  const p = state.progress;
  const pct = p && p.total ? Math.round((p.done / p.total) * 100) : entry.state === 'DONE' ? 100 : 0;
  const errCols = new Set((d.errors || []).filter((e) => e.row).map((e) => e.column));
  root.innerHTML = frame(`
    <section class="imp__card">
      <div class="imp__review-head"><div><h2>${esc(entry.name)}</h2><p class="muted">${esc(label)} · ${Number(entry.rows || 0).toLocaleString('es-ES')} filas · ${entry.mode === 'create' ? 'Solo crear' : entry.mode === 'update' ? 'Solo actualizar' : 'Crear y actualizar'} · identificador: ${E.UNIQUE_LABELS[entry.uniqueKey] || entry.uniqueKey} · creada por ${esc(entry.by)} el ${fmtDate(entry.when)}</p></div>
        <span class="imp__state imp__state--${entry.state}">${E.stateLabel(entry.state)}</span></div>
      <div class="imp__timeline">
        ${(d.timeline || []).map((t) => `<div class="imp__tl${t.state === entry.state ? ' is-current' : ''}"><span class="imp__tl-dot"></span><strong>${E.stateLabel(t.state)}</strong><span class="muted">${fmtTime(t.at)}${t.note ? ` · ${esc(t.note)}` : ''}</span></div>`).join('')}
        ${running ? `<div class="imp__tl is-next"><span class="imp__tl-dot"></span><strong>Completada</strong><span class="muted">tiempo estimado: ${E.estimateSeconds(entry.rows || 0)} s</span></div>` : ''}
      </div>
      ${running ? `<div class="imp__progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div><p class="muted">${p ? `${p.done} de ${p.total} registros procesados` : entry.state === 'DEFERRED' ? 'En cola: empezará cuando termine otra importación.' : 'Preparando…'}</p><button class="btn btn--ghost btn--sm" type="button" data-act="cancel">Cancelar importación</button>` : ''}
      <div class="imp__stats">
        <div class="imp__stat"><span>Filas del archivo</span><strong>${Number(entry.rows || 0).toLocaleString('es-ES')}</strong></div>
        <div class="imp__stat"><span>${esc(label)} nuevos</span><strong>${Number(entry.newRecords || 0).toLocaleString('es-ES')}</strong></div>
        <div class="imp__stat"><span>${esc(label)} actualizados</span><strong>${Number(entry.updated || 0).toLocaleString('es-ES')}</strong></div>
        <div class="imp__stat"><span>Asociaciones nuevas</span><strong>${Number(entry.associations || 0).toLocaleString('es-ES')}</strong></div>
        <div class="imp__stat"><span>Duplicados ${entry.mode === 'create' ? 'saltados' : 'actualizados'}</span><strong>${Number(entry.duplicates || 0).toLocaleString('es-ES')}</strong>${entry.fileDuplicates ? `<small class="muted">+ ${Number(entry.fileDuplicates).toLocaleString('es-ES')} repetidos en el archivo (${entry.filePolicy === 'merge' ? 'combinados' : entry.filePolicy === 'last' ? 'gana la última fila' : 'gana la primera fila'})</small>` : ''}</div>
        <div class="imp__stat"><span>Errores</span><strong>${(d.errors || []).length.toLocaleString('es-ES')}</strong></div>
      </div>
      ${entry.state === 'DONE' ? `<p class="muted">Las filas importadas pueden no coincidir con los registros: un identificador secundario que actualiza un ${esc(singular)} no cuenta como nuevo.</p>` : ''}
      <div class="imp__row">${entry.state === 'DONE' ? `<a class="btn btn--primary btn--sm" href="../../${type}/">Ver ${esc(label.toLowerCase())}</a>${entry.options && entry.options.createSegment ? `<a class="btn btn--ghost btn--sm" href="../../${type}/">Ver segmento</a>` : ''}` : ''}<a class="btn btn--ghost btn--sm" href="../">Historial de importaciones</a>${!running ? '<a class="btn btn--ghost btn--sm" href="./">Nueva importación</a>' : ''}</div>
    </section>
    <section class="imp__card">
      <div class="imp__review-head"><h2>Importar errores</h2><div class="imp__row">${(d.errors || []).length ? `<button class="btn btn--ghost btn--sm" type="button" data-act="dl-errors">Descargar errores (zip)</button>` : ''}${(d.failedRows || []).length ? `<button class="btn btn--ghost btn--sm" type="button" data-act="dl-rows">Descargar filas con errores (zip)</button>` : ''}</div></div>
      ${groups.size ? `<div class="table-wrap"><table class="table imp__errors"><thead><tr><th>Columna del archivo</th><th>Tipo de objeto</th><th>Propiedad</th><th>Tipo de error</th><th>Filas</th><th>Impacto</th></tr></thead><tbody>${[...groups.values()].map((g) => `<tr><td>${g.column ? esc(g.column) : '<span class="muted">(fila)</span>'}</td><td>${esc(singular.charAt(0).toUpperCase() + singular.slice(1))}</td><td>${g.key ? esc((E.propByKey(type, g.key) || { label: g.key }).label) : '<span class="muted">—</span>'}</td><td><code>${g.code}</code><br /><small class="muted">${esc(E.errorMeaning(g.code))}</small></td><td>${g.count}</td><td>${esc(g.impact)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sin errores.</p>'}
      ${(d.failedRows || []).length ? `<details class="imp__rows"><summary>Ver filas con errores (${d.failedRows.length})</summary><div class="table-wrap"><table class="table imp__failed"><thead><tr><th>Fila</th><th>Error</th>${(d.headers || []).map((h) => `<th>${errCols.has(h) ? '⚠ ' : ''}${esc(h)}</th>`).join('')}</tr></thead><tbody>${d.failedRows.slice(0, 200).map((r) => `<tr><td>${r.row}</td><td><code>${r.code}</code></td>${r.cells.map((c, i) => { const m = (d.mapping || []).find((x) => x.index === i); return `<td>${m && E.SENSITIVE_KEYS.has(m.key) && c ? 'ELIMINADO' : esc(c)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>${d.failedRows.length > 200 ? '<p class="muted">Se muestran las primeras 200 filas; la descarga incluye todas.</p>' : ''}</details>` : ''}
    </section>`, 4, `Importar ${label.toLowerCase()}`);
}

// ---------- events ----------
root.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'imp-file' && t.files && t.files[0]) { loadFile(t.files[0]); return; }
  if (t.id === 'imp-lang') { state.language = t.value; if (state.table) state.mapping = E.autoMap(state.table.headers, state.language, state.object); return; }
  if (t.name === 'flow') { state.flow = t.value; if (state.flow === 'quick') setObject('contacts'); renderStep1(); return; }
  if (t.id === 'imp-object') { setObject(t.value); renderStep1(); return; }
  if (t.dataset.map !== undefined) {
    const i = Number(t.dataset.map);
    const m = state.mapping.find((x) => x.index === i);
    if (t.value === '__new') { state.newProp = i; renderStep2(); return; }
    state.mapping.forEach((x) => { if (x !== m && x.key === t.value && t.value) { x.key = ''; } });
    m.key = t.value;
    m.skip = !t.value;
    m.replacements = {};
    m.dropped = [];
    renderStep2();
    return;
  }
  if (t.dataset.noover !== undefined) { state.mapping.find((x) => x.index === Number(t.dataset.noover)).noOverwrite = t.checked; return; }
  if (t.name === 'mode') { state.options.mode = t.value; renderStep3(); return; }
  if (t.name === 'filedups') { state.options.fileDuplicates = t.value; renderStep3(); return; }
  if (t.id === 'imp-unique') { state.options.uniqueKey = t.value; renderStep3(); return; }
  if (t.id === 'imp-date') { state.options.dateFormat = t.value; renderStep3(); return; }
  if (t.id === 'imp-num') { state.options.numberFormat = t.value; renderStep3(); return; }
  if (t.id === 'imp-tz') { state.options.timezone = t.value; return; }
  if (t.id === 'imp-legal') { state.options.legalBasis = t.value; return; }
  if (t.id === 'imp-segment') { state.options.createSegment = t.checked; return; }
  if (t.id === 'imp-marketing') { state.options.marketing = t.checked; return; }
  if (t.id === 'imp-consent') { state.options.consent = t.checked; renderStep3(); }
});
function setObject(type) {
  if (!E.OBJECTS[type] || type === state.object) return;
  state.object = type;
  state.options.uniqueKey = E.objectDef(type).defaultUnique;
  if (state.table) state.mapping = E.autoMap(state.table.headers, state.language, type);
  document.title = `Importar ${E.objectDef(type).label.toLowerCase()} | Omni`;
}
root.addEventListener('input', (e) => { if (e.target.id === 'imp-name') state.name = e.target.value; });
root.addEventListener('click', (e) => {
  const rep = e.target.closest('[data-replace]');
  const drop = e.target.closest('[data-drop]');
  const errBtn = e.target.closest('[data-errors]');
  const act = e.target.closest('[data-act]');
  if (rep) {
    const m = state.mapping.find((x) => x.index === state.panelColumn);
    const input = [...root.querySelectorAll('[data-replace-input]')].find((el) => el.dataset.replaceInput === rep.dataset.replace);
    const to = input ? input.value.trim() : '';
    if (!to) { toast('Escribe el valor de sustitución'); return; }
    m.replacements = { ...(m.replacements || {}), [rep.dataset.replace]: to };
    renderStep2();
    toast(`"${rep.dataset.replace}" → "${to}" en todas las filas`);
    return;
  }
  if (drop) {
    const m = state.mapping.find((x) => x.index === state.panelColumn);
    m.dropped = [...new Set([...(m.dropped || []), drop.dataset.drop])];
    renderStep2();
    return;
  }
  if (errBtn) { state.panelColumn = Number(errBtn.dataset.errors); renderStep2(); return; }
  if (!act) return;
  const a = act.dataset.act;
  if (a === 'use-paste') { usePasted($('imp-paste').value); }
  else if (a === 'sample') { downloadBytes(`ejemplo-${state.object}.csv`, '﻿' + E.sampleCsv(state.object), 'text/csv'); toast('Archivo de ejemplo descargado'); }
  else if (a === 'next1') { if (!state.table) return; if (!state.mapping.length) state.mapping = E.autoMap(state.table.headers, state.language, state.object); state.step = 2; renderStep2(); }
  else if (a === 'back1') { state.step = 1; renderStep1(); }
  else if (a === 'next2') { state.step = 3; state.panelColumn = null; refreshExisting(); renderStep3(); }
  else if (a === 'back2') { state.step = 2; renderStep2(); }
  else if (a === 'np-create') {
    const name = $('np-name').value.trim();
    if (!name) { toast('Escribe el nombre de la propiedad'); return; }
    const key = E.createInlineProperty(state.object, name, $('np-kind').value);
    const m = state.mapping.find((x) => x.index === Number(act.dataset.i));
    m.key = key; m.skip = false; state.newProp = null;
    renderStep2();
    toast(`Propiedad "${name}" creada`);
  }
  else if (a === 'np-cancel') { state.newProp = null; renderStep2(); }
  else if (a === 'panel-close') { state.panelColumn = null; renderStep2(); }
  else if (a === 'panel-reset') { const m = state.mapping.find((x) => x.index === state.panelColumn); m.replacements = {}; m.dropped = []; renderStep2(); toast('Cambios restablecidos'); }
  else if (a === 'finish') finish();
  else if (a === 'cancel') { state.canceled = true; toast('Cancelando…'); }
  else if (a === 'dl-errors') { const d = E.importDetail(state.importId); const entry = E.importHistory().find((r) => Number(r.id) === Number(state.importId)); downloadBytes(`errores-importacion-${state.importId}.zip`, E.zipFiles([{ name: `errores-importacion-${state.importId}.csv`, text: E.errorsCsv(d, entry ? entry.object : 'contacts') }]), 'application/zip'); toast('Listado de errores descargado'); }
  else if (a === 'dl-rows') { const d = E.importDetail(state.importId); downloadBytes(`filas-con-errores-${state.importId}.zip`, E.zipFiles([{ name: `filas-con-errores-${state.importId}.csv`, text: E.failedRowsCsv(d) }]), 'application/zip'); toast('Filas con errores descargadas'); }
});
root.addEventListener('dragover', (e) => { if (e.target.closest('.imp__drop')) e.preventDefault(); });
root.addEventListener('drop', (e) => { const z = e.target.closest('.imp__drop'); if (!z) return; e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadFile(f); });

if (state.importId) renderReview();
else renderStep1();

export { state, renderStep1, renderStep2, renderStep3, renderReview, finish, setObject };
