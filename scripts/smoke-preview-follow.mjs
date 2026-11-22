// DOM smoke test for «Seguir» in the lists' preview panel (src/list.js + src/follows.js) on the four objects:
// the «Acciones» menu of «Acerca de» reads its label from the per-user follow store, clicking it follows for
// real (store, toast as on the record page, label «Dejar de seguir»), closing and reopening the panel keeps the
// state, the record page agrees («Dejar de seguir»), a later activity by someone else reaches the bell, and
// unfollowing from the preview switches everything back. Run: node scripts/smoke-preview-follow.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[preview-follow]', ...a);
const fail = (msg) => { console.error(`[preview-follow] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const useDom = (main, url, type = '') => { const dom = new JSDOM(`<!doctype html><body class="app"${type ? ` data-type="${type}"` : ''}><aside id="sidenav"></aside><header id="topbar"></header>${main}<div id="scrim"></div></body>`, { url, pretendToBeVisual: true }); for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = dom.window[k]; dom.window.HTMLElement.prototype.scrollIntoView = function () {}; dom.window.HTMLElement.prototype.scrollBy = function () {}; dom.window.confirm = () => true; dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); return dom; };
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };

const data = await import(resolve(here, '../src/data.js'));
const F = await import(resolve(here, '../src/follows.js'));
const N = await import(resolve(here, '../src/notifications.js'));
const ME = 'Fernando L.';
const followNotes = (type, id) => N.notifications().filter((n) => n.kind === 'follow' && n.to === ME && n.href === `${type}/record/?id=${id}`);
let n = 0;

for (const type of ['contacts', 'companies', 'deals', 'tickets']) {
  // ---- the list: open the preview of the first row ----
  useDom('<main id="list-root"></main>', `http://localhost/${type}/`);
  await import(resolve(here, `../src/${type}.js`));
  await wait(60);
  const pvBtn = q('[data-preview]');
  if (!pvBtn) fail(`${type}: preview button on a row`);
  const id = Number(pvBtn.dataset.preview);
  const rec = data.findRecord(type, id);
  click(pvBtn);
  await wait(10);
  const item = () => $('pv-follow-item');
  if (!$('preview').classList.contains('is-open') || !item() || text(item()) !== 'Seguir' || F.isFollowing(type, id)) fail(`${type}: preview open with «Seguir» (${item() && text(item())})`);
  // ---- follow for real ----
  click(item());
  if (text(item()) !== 'Dejar de seguir' || !F.isFollowing(type, id) || !JSON.parse(mem[`crm:follows:${ME}`] || '[]').includes(`${type}:${id}`)) fail(`${type}: following after the click (${text(item())})`);
  if (!/^Ahora sigues a .*Recibirás notificaciones de su actividad\.$/.test(text($('toast')))) fail(`${type}: toast as on the record (${text($('toast'))})`);
  // ---- close and reopen: the state is kept ----
  click(q('#preview [data-pv="close"]'));
  if ($('preview').classList.contains('is-open')) fail(`${type}: preview closed`);
  click(q(`[data-preview="${id}"]`) || q('[data-preview]'));
  await wait(10);
  if (text(item()) !== 'Dejar de seguir') fail(`${type}: label after reopening (${text(item())})`);
  // ---- the record page agrees ----
  useDom('<main id="record-root"></main>', `http://localhost/${type}/record/?id=${id}`, type);
  await import(resolve(here, `../src/record.js?pf=${n++}`));
  await wait(60);
  if (text($('follow-item')) !== 'Dejar de seguir') fail(`${type}: record page shows «Dejar de seguir» (${text($('follow-item'))})`);
  // ---- an activity by someone else reaches the bell ----
  const before = followNotes(type, id).length;
  data.addActivity({ type: 'note', recordType: type, recordId: id, text: `Nota de prueba en ${type}`, who: 'Laura M.', when: Date.now() + n });
  const notes = followNotes(type, id);
  if (notes.length !== before + 1 || !/Laura M\. registró una nota/.test(notes[0].text)) fail(`${type}: follow notification in the bell (${notes.length})`);
  // ---- unfollow from the preview: everything switches back ----
  useDom('<main id="list-root"></main>', `http://localhost/${type}/`);
  await import(resolve(here, `../src/${type}.js?pf=${n++}`));
  await wait(60);
  click(q(`[data-preview="${id}"]`) || q('[data-preview]'));
  await wait(10);
  if (text(item()) !== 'Dejar de seguir') fail(`${type}: preview reads the store on reload`);
  click(item());
  if (text(item()) !== 'Seguir' || F.isFollowing(type, id) || !/^Has dejado de seguir a /.test(text($('toast')))) fail(`${type}: unfollow from the preview (${text(item())} / ${text($('toast'))})`);
  data.addActivity({ type: 'call', recordType: type, recordId: id, text: 'Llamada posterior', who: 'Laura M.', when: Date.now() + 100 + n });
  if (followNotes(type, id).length !== before + 1) fail(`${type}: no notification after unfollowing`);
  log(`${type}: «${rec.name}» → Seguir desde la vista previa (store, toast, etiqueta, reabrir), la ficha dice «Dejar de seguir», la nota de Laura M. llega a la campana; dejar de seguir corta`);
}
console.log('[preview-follow] OK');
process.exit(0);
