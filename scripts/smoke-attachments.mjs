// Smoke test for the «Archivos adjuntos» card (record page of the four modules) and its count on the lists' preview
// panel: the file really goes to Storage and public.attachments (src/attachments.js), reopening the record lists it,
// the name opens a signed URL to the real content, «Eliminar» removes the object and the row, and the preview panel
// shows the same count. Without a session, or while supabase/attachments.sql is pending, the card says so and offers
// no «+ Subir». Local mode uses a fake client (an in-memory bucket and table). Run: node scripts/smoke-attachments.mjs
// Live mode (SMOKE_LIVE=1, docs/smoke-live.md): needs the migration (table + bucket); uploads a PDF to a «SMOKE»
// deal with the real client, checks the row and the object with SQL, fetches the signed URL (real bytes back) and
// removes it (object and row gone). Rows and objects cleaned up at the end.
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { liveSmoke, requireTable, lit } from './smoke-live.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TAG = 'attachments';
const log = (...a) => console.log(`[${TAG}]`, ...a);
const fail = (msg) => { console.error(`[${TAG}] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const RECORD = (type) => `<!doctype html><body class="app" data-type="${type}"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>`;
const LIST = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>';
const GLOBALS = ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option'];
const opened = [];
const useDom = (html, url) => {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  for (const k of GLOBALS) globalThis[k] = dom.window[k];
  dom.window.confirm = () => true;
  dom.window.open = (u) => { opened.push(u); return null; };
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return dom;
};
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
const pdfFile = (name) => new File([PDF], name, { type: 'application/pdf' });
let n = 0;
const openRecord = async (type, id) => { useDom(RECORD(type), `http://localhost/${type}/record/?id=${id}`); await import(resolve(here, `../src/record.js?at=${n++}`)); await wait(80); };
const card = () => q('[data-lcard="attachments"]');
const cardCount = () => Number((text(card() && card().querySelector('.card__toggle')).match(/\((\d+)\)/) || [])[1]);
const pickFile = async (file) => { const input = $('file-add'); if (!input) fail('«+ Subir» input'); Object.defineProperty(input, 'files', { value: [file], configurable: true }); input.dispatchEvent(new window.Event('change', { bubbles: true })); await wait(60); };

// ---- modo live (SMOKE_LIVE=1): the real bucket and table ----
await liveSmoke(TAG, async ({ data, one, sql, check, log, stamp, supabase }) => {
  await requireTable('attachments'); // supabase/attachments.sql
  const bucket = await one(`select id, public from storage.buckets where id = 'attachments'`);
  check(bucket && bucket.public === false, 'el bucket privado «attachments» existe (migración supabase/attachments.sql)');
  const A = await import(resolve(here, '../src/attachments.js'));
  const def = data.dealPipelineDefs()[0];
  const stage = def.stages.find((s) => !data.isClosedStage(s[0]))[0];
  const deal = data.addRecord('deals', { name: `SMOKE Negocio adjuntos ${stamp}`, amount: 10, deal_currency_code: 'MXN', stage, pipeline: def.name, closeDate: new Date(data.TODAY.getTime() + 30 * 86400000).toISOString(), owner: 'Fernando L.', priority: 'medium', type: 'Nuevo negocio', description: 'Prueba live', lastActivity: data.TODAY.toISOString() }, { origin: 'Creación manual' });
  await data.dbIdle();
  let att = null;
  try {
    await A.ensureAttachments();
    check(A.attachmentsEnabled(), `los adjuntos están activos con la sesión (${A.attachmentsStatus()})`);
    att = await A.uploadAttachment('deals', deal.id, pdfFile(`SMOKE cotizacion ${stamp}.pdf`));
    const row = await one(`select name, path, size, content_type from public.attachments where object_type = 'deals' and record_id = ${Number(deal.id)}`);
    check(row && row.path === att.path && Number(row.size) === PDF.length && row.content_type === 'application/pdf', `fila en public.attachments (${JSON.stringify(row)})`);
    const obj = await one(`select name, bucket_id from storage.objects where bucket_id = 'attachments' and name = ${lit(att.path)}`);
    check(obj && obj.name === att.path, `objeto en Storage (${JSON.stringify(obj)})`);
    log(`subido «${att.name}» → ${att.path} (${row.size} B) en el bucket y en la tabla`);
    const url = await A.attachmentUrl(att);
    const res = await fetch(url);
    const bytes = new Uint8Array(await res.arrayBuffer());
    check(res.ok && bytes.length === PDF.length && String.fromCharCode(...bytes.slice(0, 4)) === '%PDF', `la URL firmada devuelve el contenido real (${res.status}, ${bytes.length} B)`);
    log(`URL firmada → ${res.status}, ${bytes.length} B, empieza por %PDF`);
    await A.removeAttachment(att);
    const gone = await one(`select (select count(*) from public.attachments where path = ${lit(att.path)})::int as rows, (select count(*) from storage.objects where bucket_id = 'attachments' and name = ${lit(att.path)})::int as objects`);
    check(gone && gone.rows === 0 && gone.objects === 0, `eliminar borra la fila y el objeto (${JSON.stringify(gone)})`);
    log('eliminado → 0 filas, 0 objetos en Storage');
    att = null;
  } finally {
    if (att) { try { await supabase.storage.from('attachments').remove([att.path]); } catch { /* best effort */ } }
    await sql(`delete from public.attachments where name like 'SMOKE %'`);
  }
});

// ---- static ----
const sqlSrc = readFileSync(resolve(here, '../supabase/attachments.sql'), 'utf8');
if (!/create table if not exists public\.attachments/.test(sqlSrc) || !/insert into storage\.buckets[\s\S]*'attachments', 'attachments', false/.test(sqlSrc) || !/public\.is_team_member\(\)/.test(sqlSrc)) fail('supabase/attachments.sql: table, private bucket and team policies');
const register = JSON.parse(readFileSync(resolve(here, 'applied-migrations.json'), 'utf8'));
if (!register['attachments.sql'] || !register['attachments.sql'].status) fail('register: attachments.sql recorded');
const recSrc = readFileSync(resolve(here, '../src/record.js'), 'utf8');
if (/crm:\$\{type\}:files:/.test(recSrc) || /loadFiles\(/.test(recSrc)) fail('record.js still keeps phantom files in localStorage');
log(`estático: migración con tabla + bucket privado + políticas de equipo (${register['attachments.sql'].status}); record.js sin adjuntos fantasma`);

// ---- local mode with a fake client: an in-memory bucket and table ----
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear() { Object.keys(mem).forEach((k) => delete mem[k]); } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
useDom(RECORD('deals'), 'http://localhost/deals/');
const data = await import(resolve(here, '../src/data.js'));
const A = await import(resolve(here, '../src/attachments.js'));
const LD = await import(resolve(here, '../src/layout-defaults.js'));
const bucket = new Map(); // path → { bytes, type }
const table = [];
const fake = {
  storage: { from: (b) => ({
    upload: async (path, file, opts) => { bucket.set(path, { bytes: new Uint8Array(await file.arrayBuffer()), type: opts && opts.contentType, bucket: b }); return { data: { path }, error: null }; },
    remove: async (paths) => { paths.forEach((p) => bucket.delete(p)); return { data: paths, error: null }; },
    createSignedUrl: async (path, seconds, opts) => (bucket.has(path) ? { data: { signedUrl: `https://fake.storage/${b}/${path}?token=t&download=${encodeURIComponent((opts && opts.download) || '')}` }, error: null } : { data: null, error: { message: 'Object not found' } }),
  }) },
  from: () => ({
    select: () => ({ order: async () => ({ data: table.slice(), error: null }) }),
    insert: (row) => ({ select: () => ({ single: async () => { const r = { id: `a${table.length + 1}`, created_at: new Date().toISOString(), ...row }; table.push(r); return { data: r, error: null }; } }) }),
    delete: () => ({ eq: async (k, v) => { const i = table.findIndex((r) => r[k] === v); if (i >= 0) table.splice(i, 1); return { error: null }; } }),
  }),
};
const user = { id: 'u-smoke', email: 'fernando@ejemplo.com', user_metadata: { name: 'Fernando L.' } };
const deal = data.allDeals()[0];

// 1) signed in: «+ Subir» offered; a PDF goes to the bucket and the table, the card lists it with its size
A.setAttachmentsClient(fake, user);
await openRecord('deals', deal.id);
if (!card() || cardCount() !== 0 || !$('file-add')) fail(`attachments card with «+ Subir» (${card() && text(card())})`);
await pickFile(pdfFile('Cotización vidrio templado.pdf'));
if (cardCount() !== 1 || qa('.files li').length !== 1 || !/Cotización vidrio templado\.pdf/.test(text(q('.files')))) fail(`the card lists the uploaded file (${text(card())})`);
if (bucket.size !== 1 || table.length !== 1) fail(`bucket (${bucket.size}) and table (${table.length}) got the file`);
const [path, stored] = [...bucket.entries()][0];
if (!path.startsWith(`deals/${deal.id}/`) || stored.bytes.length !== PDF.length || stored.type !== 'application/pdf') fail(`the real bytes are stored under the record's folder (${path}, ${stored.bytes.length} B)`);
if (table[0].path !== path || table[0].object_type !== 'deals' || Number(table[0].record_id) !== Number(deal.id) || table[0].uploaded_by !== 'u-smoke') fail(`the row points at the object (${JSON.stringify(table[0])})`);
if (!data.activitiesFor('deals', deal.id).some((a) => /1 archivo\(s\) adjuntado\(s\): Cotización vidrio templado\.pdf/.test(a.text))) fail('timeline entry names the file');
log(`subido «Cotización vidrio templado.pdf» → ${path} (${stored.bytes.length} B); fila en attachments; tarjeta (1)`);

// 2) reload: the card reads it back; the name opens the real content (signed URL of the stored object)
A.setAttachmentsClient(fake, user);
await openRecord('deals', deal.id);
if (cardCount() !== 1 || !q('[data-file-open]')) fail('after a reload the file is listed');
click(q('[data-file-open]'));
await wait(30);
if (opened.length !== 1 || !opened[0].includes(`/attachments/${path}`) || !bucket.has(path)) fail(`the name opens the signed URL of the object (${opened[0]})`);
log(`recarga: listado; pulsar el nombre abre ${opened[0].slice(0, 60)}…`);

// 3) the preview panel of the list shows the same count
LD.savePreview('deals', null, { ...LD.defaultPreview('deals'), right: [...LD.defaultPreview('deals').right, 'attachments'] });
useDom(LIST, 'http://localhost/deals/');
await import(resolve(here, `../src/deals.js?at=${n++}`));
await wait(80);
await A.ensureAttachments();
click(q(`[data-preview="${deal.id}"]`));
await wait(30);
const pv = qa('#pv-extra .pvcard').find((s) => /Archivos adjuntos/.test(text(s)));
if (!pv || !/\(1\)/.test(text(pv.querySelector('.pvcard__title'))) || !/Cotización vidrio templado\.pdf/.test(text(pv))) fail(`preview panel shows the attachment (${pv && text(pv)})`);
log('panel de vista previa: «Archivos adjuntos (1)» con el nombre');

// 4) «Eliminar» removes the object and the row; the card and the preview show 0
await openRecord('deals', deal.id);
click(q('[data-file-rm]'));
await wait(40);
if (cardCount() !== 0 || bucket.size !== 0 || table.length !== 0) fail(`delete clears the bucket (${bucket.size}) and the table (${table.length})`);
if (!data.activitiesFor('deals', deal.id).some((a) => /Archivo eliminado: Cotización vidrio templado\.pdf/.test(a.text))) fail('timeline entry for the deletion');
useDom(LIST, 'http://localhost/deals/');
await import(resolve(here, `../src/deals.js?at=${n++}`));
await wait(80);
click(q(`[data-preview="${deal.id}"]`));
await wait(30);
const pv2 = qa('#pv-extra .pvcard').find((s) => /Archivos adjuntos/.test(text(s)));
if (!pv2 || !/\(0\)/.test(text(pv2.querySelector('.pvcard__title')))) fail('preview panel back to 0');
log('eliminar → bucket y tabla vacíos; tarjeta (0); panel de vista previa (0)');

// 5) without a session: no «+ Subir», an honest note; with the migration pending: the note names it
A.setAttachmentsClient(fake, null);
await openRecord('contacts', data.allContacts()[0].id);
if ($('file-add') || !/Inicia sesión para subir archivos/.test(text(card()))) fail(`signed out: no upload, honest note (${text(card())})`);
const broken = { ...fake, from: () => ({ select: () => ({ order: async () => ({ data: null, error: { code: '42P01', message: 'relation "public.attachments" does not exist' } }) }) }) };
A.setAttachmentsClient(broken, user);
await openRecord('tickets', data.allTickets()[0].id);
if ($('file-add') || !/supabase\/attachments\.sql/.test(text(card()))) fail(`migration pending: no upload, the note names the migration (${text(card())})`);
log('sin sesión: sin «+ Subir» y nota honesta; migración pendiente: la nota la nombra');
// the other modules render the same card
A.setAttachmentsClient(fake, user);
for (const type of ['contacts', 'companies', 'tickets']) {
  await openRecord(type, data.ALL[type]()[0].id);
  if (!card() || !$('file-add')) fail(`${type}: attachments card with «+ Subir»`);
}
log('contactos, empresas y tickets: misma tarjeta con «+ Subir»');
console.log(`[${TAG}] OK`);
process.exit(0);
