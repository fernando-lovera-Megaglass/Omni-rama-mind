// Smoke test for shared saved views (src/data.js crm_views store + src/list.js): creating a view «Todos» from the
// Contactos list puts it under «Vistas compartidas» with its author, a private one under «Mis vistas»; the
// visibility rule (private → only the author, all → everyone, team → the author's team) and the row ↔ view
// mapping (author, mine) are checked as pure functions. Live mode (SMOKE_LIVE=1, docs/smoke-live.md): requires
// the crm_views table; user A saves private / team / all views through the app → rows in crm_views owned by A;
// a second SMOKE user B reads the table with his own session and sees the shared ones (author A) but not the
// private one. Run: node scripts/smoke-views-shared.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { liveSmoke, requireTable, startLiveSession, removeLiveUser, lit } from './smoke-live.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[views-shared]', ...a);
const fail = (msg) => { console.error(`[views-shared] FAIL: ${msg}`); process.exit(1); };

// ---- modo live: A shares, B sees (RLS + the app's visibility rule) ----
await liveSmoke('views-shared', async ({ data, sql, one, check, log: llog, stamp, session }) => {
  await requireTable('crm_views'); // crm_views.sql
  check(data.viewsLive(), 'data.js no leyó crm_views (¿tabla o políticas?)');
  const base = { base: 'all', filters: {}, advanced: [], sort: { key: 'created', dir: -1 }, columns: ['name', 'email'], updated: Date.now() };
  const store = data.getViewStore('contacts');
  const mk = (share, name) => ({ id: `vsmoke-${share}-${stamp}`, name: `SMOKE Vista ${name} ${stamp}`, share, owner: 'Fernando L.', ...base });
  store.custom.push(mk('private', 'privada'), mk('team', 'equipo'), mk('all', 'todos'));
  store.open = [`vsmoke-all-${stamp}`]; store.active = `vsmoke-all-${stamp}`;
  data.setViewStore('contacts', store);
  await data.dbIdle();
  const rows = await sql(`select id, share, owner_id, owner_name, object_type from public.crm_views where name like ${lit(`SMOKE Vista % ${stamp}`)} order by share`);
  check(rows.length === 3 && rows.every((r) => r.owner_id === session.uid && r.object_type === 'contacts'), `tres filas en crm_views del usuario A (${JSON.stringify(rows)})`);
  llog(`A guardó 3 vistas: ${rows.map((r) => r.share).join(', ')} (owner ${rows[0].owner_name})`);
  const mine = data.getViewStore('contacts').custom.filter((v) => v.name.startsWith('SMOKE Vista'));
  check(mine.length === 3 && mine.every((v) => v.mine), 'A ve sus tres vistas como propias');
  const tabs = await one(`select value from public.user_settings where user_id = ${lit(session.uid)} and key = 'crm:contacts:views:tabs'`);
  check(tabs && tabs.value && tabs.value.active === `vsmoke-all-${stamp}`, `las pestañas abiertas viven en user_settings (${JSON.stringify(tabs)})`);
  // user B, with his own client and session
  const { createClient } = await import('@supabase/supabase-js');
  const clientB = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const sessionB = await startLiveSession('viewsb', clientB);
  try {
    const { data: seen, error } = await clientB.from('crm_views').select('*').like('name', `SMOKE Vista % ${stamp}`);
    check(!error, `B lee crm_views (${error && error.message})`);
    const shares = (seen || []).map((r) => r.share).sort().join(',');
    check(shares === 'all,team', `B ve las compartidas y no la privada (${shares})`);
    const views = (seen || []).map((r) => data.viewFromRow(r, sessionB.uid));
    check(views.every((v) => v.mine === false && v.owner === 'Fernando L.'), 'para B son de otro autor (Creada por: A)');
    check(views.every((v) => data.viewVisibleTo(v, { userId: sessionB.uid, team: '' })), 'la regla de visibilidad las muestra a B');
    // B cannot touch A's views
    const { error: upd } = await clientB.from('crm_views').update({ name: 'SMOKE hackeada' }).eq('id', `vsmoke-all-${stamp}`).select('id');
    const still = await one(`select name from public.crm_views where id = ${lit(`vsmoke-all-${stamp}`)}`);
    check(still && still.name === `SMOKE Vista todos ${stamp}`, `RLS impide que B edite la vista de A (${upd && upd.message})`);
    llog('B ve «todos» y «equipo» con autor A, no la privada; no puede editarlas');
  } finally {
    await removeLiveUser(sessionB);
    try { await clientB.auth.signOut(); } catch { /* no session */ }
  }
  // A removes one: the row goes away
  const s2 = data.getViewStore('contacts');
  s2.custom = s2.custom.filter((v) => v.id !== `vsmoke-team-${stamp}`);
  data.setViewStore('contacts', s2);
  await data.dbIdle();
  const left = await sql(`select share from public.crm_views where name like ${lit(`SMOKE Vista % ${stamp}`)}`);
  check(left.length === 2 && !left.some((r) => r.share === 'team'), 'borrar una vista propia elimina su fila');
  llog('A borra la de equipo → quedan 2 filas');
});

// ---- local: the list dialog and the pure rules ----
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/contacts/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = dom.window[k];
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
dom.window.confirm = () => true;
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const data = await import(resolve(here, '../src/data.js'));
await import(resolve(here, '../src/contacts.js'));
await wait(60);
const createView = (name, share) => {
  click(q('[data-action="view-create"]'));
  const form = $('view-form');
  if (!form) fail('view dialog');
  form.querySelector('[name="name"]').value = name;
  form.querySelector(`[name="share"][value="${share}"]`).checked = true;
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
};
createView('Vista para todos', 'all');
createView('Vista solo mía', 'private');
await wait(20);
const store = data.getViewStore('contacts');
const shared = store.custom.find((v) => v.name === 'Vista para todos');
const priv = store.custom.find((v) => v.name === 'Vista solo mía');
if (!shared || shared.share !== 'all' || shared.owner !== 'Fernando L.' || !priv || priv.share !== 'private') fail('views saved with share and author');
const groupOf = (name) => { const g = qa('#picker-groups .picker__group, #picker-groups > *').find((el) => text(el).includes(name)); return g ? text(g) : text($('picker-groups')); };
const groups = text($('picker-groups'));
const posShared = groups.indexOf('Vistas compartidas');
const posMine = groups.indexOf('Mis vistas');
if (posShared < 0 || posMine < 0 || groups.indexOf('Vista para todos') < posShared || groups.indexOf('Vista solo mía') < posMine || groups.indexOf('Vista solo mía') > posShared) fail(`picker groups (${groups.slice(0, 200)})`);
log('lista: «Vista para todos» bajo «Vistas compartidas» y «Vista solo mía» bajo «Mis vistas» (autor Fernando L.)');
// pure rules
const A = 'user-a'; const B = 'user-b';
const v = (share, teams = []) => ({ id: 'x', share, ownerId: A, teams });
if (!data.viewVisibleTo(v('private'), { userId: A }) || data.viewVisibleTo(v('private'), { userId: B })) fail('private: only the author');
if (!data.viewVisibleTo(v('all'), { userId: B })) fail('all: everyone');
if (!data.viewVisibleTo(v('team', ['Ventas']), { userId: B, team: 'Ventas' }) || data.viewVisibleTo(v('team', ['Ventas']), { userId: B, team: 'Soporte' }) || !data.viewVisibleTo(v('team', []), { userId: B, team: 'Soporte' })) fail('team: the author\'s team (or everyone when no team recorded)');
const row = data.viewToRow('contacts', { ...shared, ownerId: A }, { userId: A, team: 'Ventas' });
if (row.object_type !== 'contacts' || row.share !== 'all' || row.owner_name !== 'Fernando L.' || row.payload.base !== shared.base || 'share' in row.payload || !Array.isArray(row.payload.advanced)) fail(`row mapping (${JSON.stringify(row).slice(0, 200)})`);
const teamRow = data.viewToRow('contacts', { ...priv, share: 'team' }, { userId: A, team: 'Ventas' });
if (teamRow.teams.join() !== 'Ventas') fail('a team view records the author\'s team');
const back = data.viewFromRow({ ...row, updated_at: new Date().toISOString() }, B);
if (back.mine !== false || back.owner !== 'Fernando L.' || back.name !== shared.name || back.base !== shared.base) fail('a colleague reads it as not his, with the real author');
if (data.viewFromRow(row, A).mine !== true) fail('the author reads it as his');
log('reglas: privada solo autor, todos para todos, equipo por equipo; filas ↔ vistas con autor y «mine»');
console.log('[views-shared] OK');
process.exit(0);
