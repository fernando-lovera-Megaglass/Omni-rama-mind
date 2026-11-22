// DOM smoke test: the team views of Configuración › Objetos are really used. A member of the team a record view is
// assigned to sees that view on the record page (src/record.js → resolveLayout) and, for a team preview view, on the
// lists' preview panel (src/list.js → resolvePreview); a person without a team, or of another team, sees the default
// view. The person's team comes from data.js (team_members.team when set, else the directory of Configuración ›
// Usuarios y equipos kept in this browser: crm:users). The views are created through the real editor («Crear vista
// de equipo»: move a card, rename, «Asignar equipos», save). Run: node scripts/smoke-team-views.mjs
// Live mode (SMOKE_LIVE=1, docs/smoke-live.md): the SMOKE user's team_members.team is set with SQL, a team view is
// stored in account_settings (what an administrator saves), and a fresh data.js resolves it for the record page; with
// the team cleared the default view comes back. Rows removed at the end (the previous views list is restored).
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { liveSmoke, lit } from './smoke-live.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TAG = 'team-views';
const log = (...a) => console.log(`[${TAG}]`, ...a);
const fail = (msg) => { console.error(`[${TAG}] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const RECORD = (type) => `<!doctype html><body class="app" data-type="${type}"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>`;
const LIST = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>';
const EDITOR = '<!doctype html><body class="app app--editor"><div id="layout-root"></div></body>';
const GLOBALS = ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option'];
const useDom = (html, url) => {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  for (const k of GLOBALS) globalThis[k] = dom.window[k];
  dom.window.confirm = () => true;
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
let n = 0;
const openRecord = async (type, id) => { useDom(RECORD(type), `http://localhost/${type}/record/?id=${id}`); await import(resolve(here, `../src/record.js?tv=${n++}`)); await wait(60); };
const openEditor = async (type, query) => { useDom(EDITOR, `http://localhost/layout/?type=${type}${query}`); await import(resolve(here, `../src/layout.js?tv=${n++}`)); await wait(20); };
const openList = async (type) => { useDom(LIST, `http://localhost/${type}/`); await import(resolve(here, `../src/${type}.js?tv=${n++}`)); await wait(60); };
const rightCards = () => qa('#rec-right [data-lcard]').map((c) => c.dataset.lcard);
const middleCards = () => qa('[data-lcard][data-ltab="overview"]').map((c) => c.dataset.lcard);
const previewOpen = async () => { click(q('[data-preview]')); await wait(30); return { props: qa('#pv-props .props__row').length, cards: qa('#pv-extra .pvcard__title').map(text) }; };
const swapFirstTwo = (arr) => (arr.length > 1 ? [arr[1], arr[0], ...arr.slice(2)] : arr);

// ---- modo live (SMOKE_LIVE=1): team from team_members, team view from account_settings ----
await liveSmoke(TAG, async ({ data, one, sql, check, log, stamp, session }) => {
  const LD = await import(resolve(here, '../src/layout-defaults.js'));
  const team = `SMOKE Equipo ${stamp}`;
  const viewName = `SMOKE Vista ${stamp}`;
  const LIST_KEY = 'crm:contacts:recordviews';
  const VIEW_KEY = `crm:contacts:layout:${viewName}`;
  const prev = await one(`select value from public.account_settings where key = ${lit(LIST_KEY)}`);
  const contact = data.addRecord('contacts', { name: `SMOKE Vista equipo ${stamp}`, first: 'SMOKE Vista', last: `equipo ${stamp}`, email: `smoke.${stamp}.tv@ejemplo.com`, phone: '', owner: 'Fernando L.', lifecycle: 'Lead' });
  await data.dbIdle();
  try {
    await sql(`update public.team_members set team = ${lit(team)} where user_id = ${lit(session.uid)}`);
    check((await data.refreshUserTeam()) === team && data.userTeam() === team, `el equipo viene de team_members (${data.userTeam()})`);
    const layout = { ...LD.teamViewLayout('contacts', viewName), teams: [team] };
    layout.right = swapFirstTwo(layout.right);
    const list = [...((prev && Array.isArray(prev.value)) ? prev.value : []), { name: viewName, teams: [team], updated: new Date().toISOString(), by: 'SMOKE' }];
    // what an administrator's «Guardar» writes (account_settings is admin-only: written here with SQL)
    await sql(`insert into public.account_settings (scope, key, value) values ('account', ${lit(VIEW_KEY)}, ${lit(JSON.stringify(layout))}::jsonb) on conflict (key) do update set value = excluded.value;
      insert into public.account_settings (scope, key, value) values ('account', ${lit(LIST_KEY)}, ${lit(JSON.stringify(list))}::jsonb) on conflict (key) do update set value = excluded.value;`);
    // a fresh start of the app (data.js reads account_settings and the team) resolves the team view
    const fresh = await import(resolve(here, '../src/data.js?team-views-live'));
    check(fresh.userTeam() === team, `el arranque lee el equipo (${fresh.userTeam()})`);
    const resolved = LD.resolveLayout('contacts');
    check(resolved.teamView === viewName && resolved.right.join() === layout.right.join(), `resolveLayout da la vista del equipo desde account_settings (${resolved.teamView})`);
    await openRecord('contacts', contact.id);
    check(rightCards().join() === layout.right.filter((id) => rightCards().includes(id)).join() && rightCards()[0] === layout.right[0], `la ficha muestra la vista del equipo (${rightCards().join()})`);
    log(`miembro de «${team}» → ficha con la vista «${viewName}» (columna derecha ${rightCards().slice(0, 3).join(', ')}…)`);
    await sql(`update public.team_members set team = '' where user_id = ${lit(session.uid)}`);
    check((await fresh.refreshUserTeam()) === '' && !LD.resolveLayout('contacts').teamView, 'sin equipo → la vista predeterminada');
    await openRecord('contacts', contact.id);
    check(rightCards()[0] === LD.loadLayout('contacts').right[0], `sin equipo la ficha vuelve a la predeterminada (${rightCards().join()})`);
    log('sin equipo → ficha con la vista predeterminada');
  } finally {
    await sql(`delete from public.account_settings where key = ${lit(VIEW_KEY)}; ${prev ? `update public.account_settings set value = ${lit(JSON.stringify(prev.value))}::jsonb where key = ${lit(LIST_KEY)}` : `delete from public.account_settings where key = ${lit(LIST_KEY)}`};`);
  }
});

// ---- local mode ----
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear() { Object.keys(mem).forEach((k) => delete mem[k]); } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
useDom(LIST, 'http://localhost/contacts/');
const data = await import(resolve(here, '../src/data.js'));
const LD = await import(resolve(here, '../src/layout-defaults.js'));
// the directory of Configuración › Usuarios y equipos decides the person's team in this browser
const setMyTeam = (team) => { mem['crm:users'] = JSON.stringify([{ name: 'Fernando L.', email: 'fernando.l@megaglass.us', team, role: 'Superadministrador', status: 'Activo' }, { name: 'Sofía R.', email: 'sofia.r@megaglass.us', team: 'Gerentes', role: 'Usuario', status: 'Activo' }]); };
if (data.userTeam() !== LD.TEAMS[0]) fail(`demo directory: the app's user is in the first team by default (${data.userTeam()})`);
setMyTeam('SACA');
if (data.userTeam() !== 'SACA' || LD.currentLayoutTeam() !== 'SACA') fail('team from the directory, bound to layout-defaults');
setMyTeam('');
if (data.userTeam() !== '' || LD.resolveLayout('contacts').teamView) fail('no team → no team view');

// baseline: the default view on the record page and the default preview panel
await openRecord('contacts', 3);
const defaultRight = rightCards();
const defaultMiddle = middleCards();
await openList('contacts');
const defaultPreview = await previewOpen();
log(`predeterminada: derecha ${defaultRight.slice(0, 3).join(', ')}… · vista previa ${defaultPreview.props} propiedades`);

// 1) «Crear vista de equipo» for contacts: move a card, rename, assign SACA, save
await openEditor('contacts', '&new=1');
const before = qa('[data-zone="right"] .lcard').map((c) => c.dataset.card);
click(q(`[data-lc="down"][data-card="${before[0]}"]`));
click(q('[data-lc="rename-view"]')); $('l-prompt').value = 'Vista SACA'; click($('l-ok'));
click(q('[data-lc="teams"]'));
const box = q('[data-team-m="SACA"]');
if (!box) fail('the «Asignar equipos» modal lists SACA');
box.checked = true; click($('l-teams-ok'));
click(q('[data-lc="save"]')); await wait(30); // the editor resolves the author's name before writing
const views = LD.loadViewsList('contacts', 'record');
const tv = LD.loadViewLayout('contacts', 'Vista SACA');
if (views.length !== 1 || views[0].name !== 'Vista SACA' || views[0].teams.join() !== 'SACA') fail(`views list (${JSON.stringify(views)})`);
if (tv.right[1] !== before[0] || tv.right.join() === defaultRight.join()) fail(`team view with the moved card (${tv.right.join()})`);
log(`vista de equipo «Vista SACA» asignada a SACA; tarjeta «${before[0]}» movida`);

// 2) a member of SACA opens a contact → the team view; other team / no team → the default
setMyTeam('SACA');
const resolved = LD.resolveLayout('contacts');
if (resolved.teamView !== 'Vista SACA' || resolved.right.join() !== tv.right.join()) fail('resolveLayout picks the team view');
await openRecord('contacts', 3);
const teamRight = rightCards();
if (teamRight.join() !== tv.right.filter((id) => teamRight.includes(id)).join() || teamRight[0] !== tv.right[0] || teamRight.join() === defaultRight.join()) fail(`record shows the team view (${teamRight.join()})`);
if (!q('#rec-left-extra [data-lcard="collaborators"]') || middleCards().join() === defaultMiddle.join()) fail('left column and middle sections of the team view');
log(`miembro de SACA → ficha con «Vista SACA» (derecha ${teamRight.slice(0, 3).join(', ')}…)`);
setMyTeam('saca ');
if (LD.resolveLayout('contacts').teamView !== 'Vista SACA') fail('team match ignores case and spaces');
setMyTeam('Gerentes');
await openRecord('contacts', 3);
if (rightCards().join() !== defaultRight.join() || middleCards().join() !== defaultMiddle.join()) fail(`another team → the default view (${rightCards().join()})`);
setMyTeam('');
await openRecord('contacts', 3);
if (rightCards().join() !== defaultRight.join()) fail('no team → the default view');
log('otro equipo o sin equipo → la vista predeterminada');
// a view assigned to no team applies to nobody; one with a stored list entry but no saved layout neither
LD.saveViewsList('contacts', 'record', [{ name: 'Vista SACA', teams: [] }]);
setMyTeam('SACA');
if (LD.resolveLayout('contacts').teamView) fail('a view without teams applies to nobody');
LD.saveViewsList('contacts', 'record', [{ name: 'Vista fantasma', teams: ['SACA'] }, { name: 'Vista SACA', teams: ['SACA'] }]);
if (LD.resolveLayout('contacts').teamView) fail('a listed view without a saved layout falls back to the default');
LD.saveViewsList('contacts', 'record', [{ name: 'Vista SACA', teams: ['SACA'] }]);

// 3) the preview panel: a team preview view through the editor (3 properties), seen by SACA members on the list
await openEditor('contacts', '&preview=1&new=1');
click(q('[data-lc="edit"][data-card="about"]'));
const boxes = qa('#l-pp input');
// the picker records ticks on change (as a person's click does)
const tick = (b, on) => { b.checked = on; b.dispatchEvent(new window.Event('change', { bubbles: true })); };
boxes.forEach((b) => tick(b, false));
boxes.slice(0, 3).forEach((b) => tick(b, true));
click($('l-pp-ok'));
click(q('[data-lc="rename-view"]')); $('l-prompt').value = 'Vista previa SACA'; click($('l-ok'));
click(q('[data-lc="teams"]'));
q('[data-team-m="SACA"]').checked = true; click($('l-teams-ok'));
click(q('[data-lc="save"]')); await wait(30); // the editor resolves the author's name before writing
const pviews = LD.loadViewsList('contacts', 'preview');
const pv = LD.loadSavedPreview('contacts', 'Vista previa SACA');
if (pviews.length !== 1 || pviews[0].teams.join() !== 'SACA' || !pv || pv.props.length !== 3) fail(`preview team view saved (${JSON.stringify(pviews)} / ${pv && pv.props.length})`);
setMyTeam('SACA');
if (LD.resolvePreview('contacts')?.teamView !== 'Vista previa SACA') fail('resolvePreview picks the team preview view');
await openList('contacts');
const teamPreview = await previewOpen();
if (teamPreview.props !== 3 || teamPreview.props === defaultPreview.props) fail(`list preview shows the team view (${teamPreview.props} props)`);
log(`miembro de SACA → panel de vista previa con «Vista previa SACA» (${teamPreview.props} propiedades)`);
setMyTeam('');
await openList('contacts');
const noTeamPreview = await previewOpen();
if (noTeamPreview.props !== defaultPreview.props) fail(`no team → the default preview (${noTeamPreview.props} vs ${defaultPreview.props})`);
log('sin equipo → panel de vista previa predeterminado');
console.log(`[${TAG}] OK`);
process.exit(0);
