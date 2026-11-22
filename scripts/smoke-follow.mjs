// DOM smoke test for «Seguir» a record (src/follows.js, src/notifications.js notifyFollowers, src/data.js hooks,
// src/record.js, Ajustes › Notificaciones): following a contact as the browser's user (Fernando L.) is kept in
// the per-user store (not a loose key; the old flag migrates); a note logged by someone else (Laura M.) puts
// «Nueva actividad en el contacto «…»» in the bell with a link to the record; the author is never notified;
// the same event never notifies twice; system entries stay silent; an owner or deal-stage change notifies the
// other followers; «Dejar de seguir» stops the notifications; the «Registros que sigues» switch silences
// everything and shows in Ajustes › Notificaciones. Run: node scripts/smoke-follow.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[follow]', ...a);
const fail = (msg) => { console.error(`[follow] FAIL: ${msg}`); process.exit(1); };
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

useDom('<main id="record-root"></main>', 'http://localhost/contacts/record/?id=3', 'contacts');
const data = await import(resolve(here, '../src/data.js'));
const N = await import(resolve(here, '../src/notifications.js'));
const F = await import(resolve(here, '../src/follows.js'));
await import(resolve(here, '../src/record.js'));
await wait(40);
const contact = data.findRecord('contacts', 3);
if (!contact) fail('contact 3');
const ME = 'Fernando L.';
const followNotes = (to) => N.notifications().filter((n) => n.kind === 'follow' && (!to || n.to === to));
const bellCount = () => Number(text(q('#notif-btn .count')) || 0);

// ---- «Seguir» from the record: per-user store, label, toast, state survives a reload ----
if (text($('follow-item')) !== 'Seguir' || F.isFollowing('contacts', 3)) fail('not following at first');
click(q('[data-act="follow"]'));
if (text($('follow-item')) !== 'Dejar de seguir' || !/Ahora sigues a/.test(text($('toast')))) fail(`follow label / toast (${text($('follow-item'))} / ${text($('toast'))})`);
if (!F.isFollowing('contacts', 3) || !JSON.parse(mem[`crm:follows:${ME}`] || '[]').includes('contacts:3') || 'crm:contacts:follow:3' in mem) fail(`per-user store (${mem[`crm:follows:${ME}`]}), no loose key`);
if (F.followersOf('contacts', 3).join() !== ME) fail(`followersOf (${F.followersOf('contacts', 3).join()})`);
useDom('<main id="record-root"></main>', 'http://localhost/contacts/record/?id=3', 'contacts');
await import(resolve(here, '../src/record.js?follow=again'));
await wait(40);
if (text($('follow-item')) !== 'Dejar de seguir') fail('state read from the store after a reload');
// the old loose flag counts as following and is migrated once
mem['crm:companies:follow:2'] = '1';
if (!F.isFollowing('companies', 2) || 'crm:companies:follow:2' in mem || !F.followedBy(ME).includes('companies:2')) fail('legacy flag migrated into the store');
log(`«Seguir» → store crm:follows:${ME} = ${mem[`crm:follows:${ME}`]}; etiqueta «Dejar de seguir» tras recargar; marca antigua migrada`);

// ---- a note by someone else → notification in the bell with a link to the record ----
const unread0 = N.unreadCount();
const when1 = Date.now();
data.addActivity({ type: 'note', recordType: 'contacts', recordId: 3, text: 'Revisión del presupuesto con el cliente', who: 'Laura M.', when: when1 });
const n1 = followNotes(ME);
if (n1.length !== 1) fail(`one follow notification for ${ME} (${n1.length})`);
if (n1[0].title !== `Nueva actividad en el contacto «${contact.name}»` || !/^Laura M\. registró una nota: Revisión del presupuesto/.test(n1[0].text) || n1[0].href !== 'contacts/record/?id=3' || n1[0].read) fail(`notification content (${JSON.stringify(n1[0])})`);
await wait(10);
if (N.unreadCount() !== unread0 + 1 || bellCount() !== N.unreadCount()) fail(`bell count (${bellCount()} / ${N.unreadCount()})`);
const bellLink = qa('#notif-panel .menu__note').find((a) => text(a).includes('Nueva actividad en el contacto'));
if (!bellLink || !bellLink.getAttribute('href').endsWith('contacts/record/?id=3') || !bellLink.classList.contains('notif--unread')) fail(`bell panel entry (${bellLink && bellLink.getAttribute('href')})`);
log(`nota de Laura M. → campana: «${n1[0].title}» · ${n1[0].text} · ${bellLink.getAttribute('href')}`);

// ---- never the author; the same event only once; system entries are silent ----
data.addActivity({ type: 'note', recordType: 'contacts', recordId: 3, text: 'Revisión del presupuesto con el cliente', who: 'Laura M.', when: when1 });
if (followNotes(ME).length !== 1) fail('the same event (same key) is not notified twice');
data.addActivity({ type: 'call', recordType: 'contacts', recordId: 3, text: 'Llamada propia', who: 'Tú', when: Date.now() });
if (followNotes(ME).length !== 1) fail('the author of the activity is not notified');
F.follow('contacts', 3, 'Laura M.');
data.addActivity({ type: 'call', recordType: 'contacts', recordId: 3, text: 'Llamada de seguimiento', who: 'Tú', when: Date.now() + 1 });
if (followNotes('Laura M.').length !== 1 || !/Fernando L\. registró una llamada/.test(followNotes('Laura M.')[0].text) || followNotes(ME).length !== 1) fail('another follower hears about my call; I do not');
data.logSystem('contacts', 3, 'Entrada del sistema.', {});
data.addHistoryEntry('contacts', 3, 'city', 'A', 'B', 'Ciudad');
if (followNotes(ME).length !== 1 || followNotes('Laura M.').length !== 1) fail('system and property-history entries stay silent');
log('misma clave → una sola vez; el autor no se avisa; Laura M. (también seguidora) recibe mi llamada; sistema e historial callan');

// ---- owner and deal-stage changes notify the other followers ----
data.setField('contacts', 3, 'owner', 'Diego G.');
const owner = followNotes('Laura M.').find((n) => /cambió el propietario/.test(n.text));
if (!owner || !/ahora es Diego G\./.test(owner.text) || followNotes(ME).length !== 1) fail(`owner change notifies the other follower (${owner && owner.text})`);
const deal = data.allDeals().find((d) => !data.isClosedStage(d.stage));
F.follow('deals', deal.id, 'Laura M.');
const nextStage = data.stagesFor(deal.pipeline).map((s) => s[0]).find((k) => k !== deal.stage && !data.isClosedStage(k));
data.setField('deals', deal.id, 'stage', nextStage);
const stage = followNotes('Laura M.').find((n) => /cambió la etapa/.test(n.text));
if (!stage || stage.title !== `Nueva actividad en el negocio «${deal.name}»` || !stage.text.includes(data.dealStageLabel(deal.pipeline, nextStage)) || stage.href !== `deals/record/?id=${deal.id}`) fail(`stage change notifies (${stage && stage.text})`);
log(`propietario → Diego G. y etapa del negocio → «${data.dealStageLabel(deal.pipeline, nextStage)}»: avisos a Laura M. con enlace a la ficha`);

// ---- «Dejar de seguir» stops them ----
click(q('[data-act="follow"]'));
if (text($('follow-item')) !== 'Seguir' || !/Has dejado de seguir/.test(text($('toast'))) || F.isFollowing('contacts', 3)) fail('unfollow');
data.addActivity({ type: 'note', recordType: 'contacts', recordId: 3, text: 'Otra nota', who: 'Laura M.', when: Date.now() + 2 });
if (followNotes(ME).length !== 1) fail('no notification after unfollowing');
log('«Dejar de seguir» → la nota siguiente de Laura M. no avisa');

// ---- the «Registros que sigues» switch off silences everything ----
click(q('[data-act="follow"]'));
mem['crm:notif'] = JSON.stringify({ follow_activity: false });
data.addActivity({ type: 'email', recordType: 'contacts', recordId: 3, text: 'Correo', who: 'Laura M.', when: Date.now() + 3 });
data.setField('contacts', 3, 'owner', 'Sofía R.');
if (followNotes(ME).length !== 1 || followNotes('Laura M.').filter((n) => /Sofía R\./.test(n.text)).length) fail('switch off silences activities and changes');
if (N.notifPrefs().follow_activity !== false) fail('pref read');
// Ajustes › Notificaciones shows the switch and saves it
useDom('<main id="settings-root"></main>', 'http://localhost/settings/#prefs-notif');
await import(resolve(here, '../src/settings.js'));
await wait(60);
const sw = q('[data-notif="follow_activity"]');
if (!sw || sw.checked || !/Registros que sigues/.test(text(sw.closest('label')))) fail(`switch in Ajustes › Notificaciones (${sw && sw.checked})`);
sw.checked = true;
sw.dispatchEvent(new window.Event('change', { bubbles: true }));
if (JSON.parse(mem['crm:notif']).follow_activity !== true || N.notifPrefs().follow_activity !== true) fail('switch saves the preference');
data.addActivity({ type: 'meeting', recordType: 'contacts', recordId: 3, text: 'Reunión', who: 'Laura M.', when: Date.now() + 4 });
if (followNotes(ME).length !== 2) fail('notifications resume once the switch is on again');
log('interruptor «Registros que sigues» apagado → silencio; en Ajustes › Notificaciones se ve y se guarda; encendido → vuelve a avisar');
console.log('[follow] OK');
process.exit(0);
