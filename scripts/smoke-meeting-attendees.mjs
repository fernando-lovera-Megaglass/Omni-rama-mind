// DOM smoke test for meeting attendees (src/log-modal.js «Asistentes» + src/record.js): scheduling a meeting from
// a deal starts with the deal's contact pre-added, more contacts are found by name or e-mail (click or Enter
// picks), the entry carries extra.attendees and shows «con <nombres>» on the timeline, a copy lands on every
// attendee's timeline (marked associatedFrom, never twice), editing the meeting preloads the attendees and
// gives the newly added ones their copy, and a meeting without attendees works as before.
// Run: node scripts/smoke-meeting-attendees.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[meeting-attendees]', ...a);
const fail = (msg) => { console.error(`[meeting-attendees] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const useDom = (main, url, type = '') => { const dom = new JSDOM(`<!doctype html><body class="app"${type ? ` data-type="${type}"` : ''}><aside id="sidenav"></aside><header id="topbar"></header>${main}<div id="scrim"></div></body>`, { url, pretendToBeVisual: true }); for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = dom.window[k]; dom.window.HTMLElement.prototype.scrollIntoView = function () {}; dom.window.HTMLElement.prototype.scrollBy = function () {}; dom.window.confirm = () => true; dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); return dom; };
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const typeInto = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
const keydown = (el, key) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

const data = await import(resolve(here, '../src/data.js'));
const contacts = data.allContacts();
const deal = data.allDeals().find((d) => d.contactId && contacts.some((c) => Number(c.id) === Number(d.contactId)));
if (!deal) fail('a deal with a contact');
const c1 = contacts.find((c) => Number(c.id) === Number(deal.contactId));
const others = contacts.filter((c) => Number(c.id) !== Number(c1.id) && c.email && c.name);
const [c2, c3, c4] = others;
const meetingsOf = (type, id, title) => data.activitiesFor(type, id).filter((a) => a.type === 'meeting' && String(a.text).includes(title));
const attendeeIds = (a) => ((a.extra && a.extra.attendees) || []).map((x) => Number(x.id)).sort((x, y) => x - y);

useDom('<main id="record-root"></main>', `http://localhost/deals/record/?id=${deal.id}`, 'deals');
await import(resolve(here, '../src/record.js'));
await wait(60);

// ---- «Programar una reunión» from the deal: the deal's contact is pre-added; two more are picked ----
click(q('[data-more="schedule"]'));
await wait(10);
if (!$('rec-modal').classList.contains('is-open') || !$('log-attendees') || !$('log-attendees-q')) fail('meeting form with the attendees field');
if (qa('#log-attendees-list [data-attendee]').length !== 1 || !text(q('#log-attendees-list')).includes(c1.name)) fail(`the deal's contact is pre-added (${text(q('#log-attendees-list'))})`);
typeInto($('log-attendees-q'), c2.name.slice(0, 5));
const hits = qa('#log-attendees-results [data-attendee-pick]');
if (!hits.length || hits.length > 6 || !hits.some((b) => Number(b.dataset.attendeePick) === Number(c2.id))) fail(`search by name lists the contact (${hits.map((b) => b.dataset.name).join('|')})`);
click(hits.find((b) => Number(b.dataset.attendeePick) === Number(c2.id)));
if (qa('#log-attendees-list [data-attendee]').length !== 2 || $('log-attendees-q').value !== '' || !$('log-attendees-results').hidden) fail('click adds the contact and clears the search');
typeInto($('log-attendees-q'), c3.email);
if (Number(q('#log-attendees-results [data-attendee-pick]')?.dataset.attendeePick) !== Number(c3.id)) fail('search by e-mail finds the contact first');
keydown($('log-attendees-q'), 'Enter');
if (qa('#log-attendees-list [data-attendee]').length !== 3 || !qa('#log-attendees-results [data-attendee-pick]').length === false) fail('Enter picks the first result');
if (JSON.parse($('log-attendees').dataset.attendees).map((a) => a.id).sort((x, y) => x - y).join() !== [c1.id, c2.id, c3.id].map(Number).sort((x, y) => x - y).join()) fail('attendees kept on the form');
$('log-title').value = 'Kickoff del proyecto';
click(q('[data-confirm="logact"]'));
await wait(30);
if ($('rec-modal').classList.contains('is-open')) fail('modal closes after scheduling');
log(`programar desde el negocio «${deal.name}»: ${c1.name} pre-marcado, ${c2.name} por nombre (clic) y ${c3.name} por correo (Enter)`);

// ---- the entry on the deal and on every attendee, with «con …»; no duplicates ----
const onDeal = meetingsOf('deals', deal.id, 'Kickoff del proyecto');
if (onDeal.length !== 1 || !/^Reunión programada: Kickoff del proyecto/.test(onDeal[0].text) || attendeeIds(onDeal[0]).join() !== [c1.id, c2.id, c3.id].map(Number).sort((x, y) => x - y).join()) fail(`deal entry (${JSON.stringify(onDeal.map((a) => [a.text, a.extra && a.extra.attendees]))})`);
const item = qa('#rec-timeline .timeline__item').find((li) => text(li).includes('Kickoff del proyecto'));
const tag = item && [...item.querySelectorAll('.timeline__tags .tag')].map(text).find((t) => t.startsWith('con '));
if (!tag || tag !== `con ${[c1, c2, c3].map((c) => c.name).join(', ')}`) fail(`timeline tag (${tag})`);
for (const c of [c1, c2, c3]) {
  const copies = meetingsOf('contacts', c.id, 'Kickoff del proyecto');
  if (copies.length !== 1 || !copies[0].extra || !copies[0].extra.associatedFrom || copies[0].extra.associatedFrom.type !== 'deals' || Number(copies[0].extra.associatedFrom.id) !== Number(deal.id) || attendeeIds(copies[0]).length !== 3) fail(`${c.name}: one copy marked associatedFrom the deal (${copies.length})`);
}
if (meetingsOf('contacts', c4.id, 'Kickoff del proyecto').length) fail('a contact who is not an attendee gets nothing');
log(`cronología del negocio con «${tag}»; copia única en ${c1.name}, ${c2.name} y ${c3.name} (associatedFrom: negocio)`);

// ---- editing keeps the attendees; a newly added one gets its copy ----
click(item.querySelector('[data-activity-action="edit"]'));
await wait(10);
if (!$('rec-modal').classList.contains('is-open') || qa('#log-attendees-list [data-attendee]').length !== 3 || $('log-title').value !== 'Kickoff del proyecto') fail('edit preloads the three attendees');
click(q(`[data-attendee-rm="${c3.id}"]`));
typeInto($('log-attendees-q'), c4.email);
keydown($('log-attendees-q'), 'Enter');
if (qa('#log-attendees-list [data-attendee]').length !== 3 || !text(q('#log-attendees-list')).includes(c4.name) || text(q('#log-attendees-list')).includes(c3.name)) fail('attendees edited');
click(q('[data-confirm="logact"]'));
await wait(30);
const edited = meetingsOf('deals', deal.id, 'Kickoff del proyecto');
if (edited.length !== 1 || attendeeIds(edited[0]).join() !== [c1.id, c2.id, c4.id].map(Number).sort((x, y) => x - y).join()) fail(`edited attendees (${JSON.stringify(edited[0] && edited[0].extra.attendees)})`);
if (meetingsOf('contacts', c4.id, 'Kickoff del proyecto').length !== 1 || meetingsOf('contacts', c2.id, 'Kickoff del proyecto').length !== 1 || meetingsOf('contacts', c1.id, 'Kickoff del proyecto').length !== 1) fail('the new attendee gets one copy; the others keep exactly one');
const tag2 = [...qa('#rec-timeline .timeline__item').find((li) => text(li).includes('Kickoff del proyecto')).querySelectorAll('.timeline__tags .tag')].map(text).find((t) => t.startsWith('con '));
if (tag2 !== `con ${[c1, c2, c4].map((c) => c.name).join(', ')}`) fail(`timeline tag after edit (${tag2})`);
log(`editar: precarga los 3, quita a ${c3.name}, añade a ${c4.name} → «${tag2}»; copia nueva solo para ${c4.name}`);

// ---- without attendees the meeting works as before ----
const before1 = data.activitiesFor('contacts', c1.id).length;
click(q('#quick-row [data-action="meeting"]'));
await wait(10);
click(q(`[data-attendee-rm="${c1.id}"]`));
if (qa('#log-attendees-list [data-attendee]').length || !text(q('#log-attendees-list')).includes('Sin asistentes')) fail('empty attendees state');
$('log-title').value = 'Reunión sin asistentes';
click(q('[data-confirm="logact"]'));
await wait(30);
const plain = meetingsOf('deals', deal.id, 'Reunión sin asistentes');
if (plain.length !== 1 || (plain[0].extra.attendees || []).length) fail('plain meeting logged');
const plainItem = qa('#rec-timeline .timeline__item').find((li) => text(li).includes('Reunión sin asistentes'));
if (!plainItem || [...plainItem.querySelectorAll('.timeline__tags .tag')].some((t) => text(t).startsWith('con '))) fail('no «con …» tag without attendees');
// the «Asociado a» checkboxes still work as before (the deal's contact may get the entry through them), but
// nobody is listed as an attendee anywhere
const c1Copies = meetingsOf('contacts', c1.id, 'Reunión sin asistentes');
if (c1Copies.some((a) => (a.extra.attendees || []).length) || data.activitiesFor('contacts', c1.id).length > before1 + 1 || meetingsOf('contacts', c2.id, 'Reunión sin asistentes').length) fail('no attendee copies when nobody attends');
log(`sin asistentes: entrada normal sin «con …»; asociaciones como antes (${c1Copies.length} copia por «Asociado a»)`);
console.log('[meeting-attendees] OK');
process.exit(0);
