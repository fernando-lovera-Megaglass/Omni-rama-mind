// Smoke test: Fragmentos, Ajustes (usuarios, propiedades, vistas de registro) and Etiquetas de negocio paginate
// with the shared component of src/pagination.js (numbers with ellipsis, «N por página» menu with 10/25/50/100),
// keeping their page/size state. Static: no .ppager / .dtags__pager / #snp-size left anywhere.
// Run: node scripts/smoke-pagers-unified.mjs
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[pagers]', ...a);
const fail = (msg) => { console.error(`[pagers] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- static ----
const srcDir = resolve(here, '../src');
const OLD = /ppager|dtags__pager|dtags__pagenum|snp-size|dtags-size|data-upage|data-props-page|data-usize|data-props-size/;
for (const f of readdirSync(srcDir).filter((x) => x.endsWith('.js') || x.endsWith('.css'))) {
  const src = readFileSync(resolve(srcDir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const m = src.match(OLD);
  if (m) fail(`src/${f} still uses the old pager «${m[0]}»`);
}
for (const f of ['snippets.js', 'settings.js', 'deal-tags-ui.js']) {
  const src = readFileSync(resolve(srcDir, f), 'utf8');
  if (!src.includes("from './pagination.js'") || !src.includes('pagination({') || !src.includes('bindPagination(')) fail(`src/${f} must use pagination() + bindPagination()`);
}
const { pagination } = await import(resolve(srcDir, 'pagination.js'));
const html = pagination({ page: 7, pages: 30, size: 10, sizes: [10, 25, 50, 100] });
if ((html.match(/pager__ellipsis/g) || []).length !== 2 || !/data-pagination-size="10"[^>]*>10 por página/.test(html) || !html.includes('aria-current="page"') || html.includes('aria-current="false"')) fail('pagination(): ellipsis, 10 in the size menu and a valid aria-current');
if (pagination({ size: 30 }).match(/data-pagination-size="(\d+)"/g).join() !== 'data-pagination-size="25",data-pagination-size="30",data-pagination-size="50",data-pagination-size="100"') fail('the current size is always offered');
log('static: no old pager markup/CSS; the three modules use the shared component; sizes option works');

// ---- DOM helpers ----
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
function useDom(body, url) {
  const dom = new JSDOM(`<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header>${body}<div id="scrim"></div></body>`, { url, pretendToBeVisual: true });
  for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'FormData', 'URL', 'Blob', 'MutationObserver']) globalThis[k] = dom.window[k];
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.confirm = () => true;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return dom;
}
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const checkPager = (label, scope, { size }) => {
  const pager = scope.querySelector('.pager');
  if (!pager || scope.querySelector('select') || !pager.querySelector('.pager__num.is-active[aria-current="page"]') || !pager.querySelector('.pager__sizemenu .menu__panel')) fail(`${label}: shared pager with numbers and a size menu`);
  const sizes = [...pager.querySelectorAll('[data-pagination-size]')].map((b) => b.dataset.paginationSize).join(',');
  if (sizes !== '10,25,50,100' || !text(pager.querySelector('.pager__sizemenu > button')).startsWith(`${size} por página`)) fail(`${label}: sizes ${sizes}, current «${text(pager.querySelector('.pager__sizemenu > button'))}»`);
  return pager;
};

// ---- Fragmentos ----
useDom('<main id="snp-root"></main>', 'http://localhost/snippets/');
const S = await import(resolve(srcDir, 'snippets-data.js'));
await S.ready;
for (let i = 1; i <= 23; i += 1) S.createSnippet({ name: `Pag ${String(i).padStart(2, '0')}`, body: '<p>x</p>', shortcut: `pag${i}` });
await import(resolve(srcDir, 'snippets.js'));
await wait(40);
// Fragmentos starts at 25 per page (its original initial size); 10 stays available in the menu.
checkPager('snippets', q('#snp-pager'), { size: 25 });
const snpRows = () => qa('#snp-rows tr[data-id]').length;
const snpTotal = S.snippets().length; // 23 created + the seeded ones
if (snpRows() !== 25 || qa('#snp-pager .pager__num').length !== Math.ceil(snpTotal / 25)) fail(`snippets: 25 per page (${snpRows()} rows / ${qa('#snp-pager .pager__num').length} pages for ${snpTotal})`);
click(q('#snp-pager [data-pagination-size="10"]'));
if (snpRows() !== 10 || qa('#snp-pager .pager__num').length !== Math.ceil(snpTotal / 10) || !q('#snp-pager [data-pagination-page="1"].is-active')) fail('snippets: 10 per page from the menu');
click(q('#snp-pager [data-pagination-page="3"]'));
if (!q('#snp-pager [data-pagination-page="3"].is-active') || snpRows() !== Math.min(10, snpTotal - 20)) fail('snippets: page 3 keeps its rows');
click(q('#snp-pager [data-pagination-size="25"]'));
if (snpRows() !== 25 || !q('#snp-pager [data-pagination-page="1"].is-active')) fail('snippets: 25 per page resets to page 1');
log(`snippets: shared pager over ${snpTotal} snippets, 10 per page → page 3 → back to 25`);

// ---- Ajustes: usuarios, propiedades y vistas de registro ----
useDom('<main id="settings-root"></main>', 'http://localhost/settings/');
await import(resolve(srcDir, 'settings.js'));
await wait(60);
location.hash = '#account-users';
window.dispatchEvent(new window.Event('hashchange'));
await wait(40);
const usersPager = q('[data-pager="users"]');
if (!usersPager) fail('settings: users pager slot');
checkPager('settings users', usersPager, { size: 10 });
click(usersPager.querySelector('[data-pagination-size="25"]'));
await wait(20);
if (!text(q('[data-pager="users"] .pager__sizemenu > button')).startsWith('25 por página')) fail('settings users: size kept in state after re-render');
log('settings users: shared pager, 25 per page kept');
location.hash = '#data-properties';
window.dispatchEvent(new window.Event('hashchange'));
await wait(40);
const propsPager = q('[data-pager="props"]');
if (!propsPager) fail('settings: properties pager slot (hash #data-properties)');
checkPager('settings props', propsPager, { size: 10 });
const propPages = qa('[data-pager="props"] .pager__num').length;
if (propPages < 2) fail('settings props: contacts have more than one page of properties');
click(q('[data-pager="props"] [data-pagination-page="2"]'));
await wait(20);
if (!q('[data-pager="props"] [data-pagination-page="2"].is-active')) fail('settings props: page 2 kept');
log(`settings props: ${propPages} pages, page 2 kept`);
location.hash = '#obj-contacts:record';
window.dispatchEvent(new window.Event('hashchange'));
await wait(40);
const rvPager = q('[data-pager="rv"]');
if (!rvPager) fail('settings: record views pager slot');
checkPager('settings record views', rvPager, { size: 10 });
log('settings record views: shared pager (1 page)');

// ---- Etiquetas de negocio ----
location.hash = '#obj-deals:pipelines';
window.dispatchEvent(new window.Event('hashchange'));
await wait(60);
let dtags = q('[data-pager="dtags"]');
if (!dtags) { const tab = qa('button, a').find((x) => /etiquetas/i.test(x.textContent) && !/usuarios/i.test(x.textContent)); if (tab) { click(tab); await wait(60); dtags = q('[data-pager="dtags"]'); } }
if (!dtags) fail('deal tags pane with its pager (hash #obj-deals:pipelines)');
checkPager('deal tags', dtags, { size: 10 });
click(dtags.querySelector('[data-pagination-size="50"]'));
await wait(40);
if (!text(q('[data-pager="dtags"] .pager__sizemenu > button')).startsWith('50 por página')) fail('deal tags: size kept after re-render');
log('deal tags: shared pager, 50 per page kept');
console.log('[pagers] OK');
process.exit(0);
