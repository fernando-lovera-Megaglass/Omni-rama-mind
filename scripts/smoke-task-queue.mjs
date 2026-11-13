// DOM smoke test for the task queue: due filters and "Iniciar N tareas" on the tasks list, the queue bar on
// the contact record (complete and move on, skip, finish, exit), completing a task from the Tareas card, and
// the bar on the task's own page. Phases run in separate processes because each page module boots once.
// Run: node scripts/smoke-task-queue.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const phase = process.argv[2] || 'list';
const log = (...a) => console.log(`[task-queue:${phase}]`, ...a);
const fail = (msg) => { console.error(`[task-queue:${phase}] FAIL: ${msg}`); process.exit(1); };
const mem = {};
function setup(url, bodyAttrs = '') {
  const dom = new JSDOM(
    `<!doctype html><body class="app" ${bodyAttrs}><aside id="sidenav"></aside><header id="topbar"></header><main id="${phase === 'list' ? 'list-root' : 'record-root'}"></main><div id="scrim"></div></body>`,
    { url },
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
  globalThis.FormData = dom.window.FormData;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.location = dom.window.location;
  globalThis.URL = dom.window.URL;
  globalThis.Blob = dom.window.Blob;
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
  dom.window.confirm = () => true;
  return dom;
}
const clickIn = (dom, el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const changeIn = (dom, el) => el.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
const run = (nextPhase, env) => {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), nextPhase], { stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status || 1);
};

if (phase === 'list') {
  const dom = setup('http://localhost/tasks/');
  const tq = await import(resolve(here, '../src/task-queue.js'));
  const data = await import(resolve(here, '../src/data.js'));
  const nav = [];
  tq.setNavigator((h) => nav.push(h));
  await import(resolve(here, '../src/tasks.js'));
  const $ = (id) => document.getElementById(id);
  const total = () => Number($('total-pill').textContent.split(' ')[0]);
  const all = data.allTasks();
  const pendingAll = all.filter((t) => t.status !== 'done');
  log('tabs:', [...document.querySelectorAll('button.views__tab')].map((t) => t.textContent.trim()).join(' | '));
  log('start button:', $('start-queue').textContent, '| pending total:', pendingAll.length);
  if ($('start-queue').textContent !== `Iniciar ${pendingAll.length} tareas`) fail('start button should count the pending tasks of the view');
  // due quick filter
  const chip = document.querySelector('.qchip[data-filter="due"]');
  if (!chip) fail('due chip missing');
  for (const [bucket, label] of [['today', 'Hoy'], ['overdue', 'Vencidas'], ['next7', 'Próximos 7 días'], ['none', 'Sin fecha']]) {
    clickIn(dom, document.querySelector(`.menu__item[data-filter="due"][data-value="${bucket}"]`));
    const expect = all.filter((t) => tq.dueMatches(t, bucket)).length;
    log(`due=${label}: rows ${total()} (expected ${expect}) | chip "${chip.textContent.trim()}"`);
    if (total() !== expect) fail(`due filter ${bucket}`);
  }
  clickIn(dom, document.querySelector('.menu__item[data-filter="due"][data-value=""]'));
  if (total() !== all.length) fail('due filter reset');
  // views by due date
  const tab = (label) => [...document.querySelectorAll('button.views__tab')].find((t) => t.textContent.trim() === label);
  for (const [label, test] of [['Vencen hoy', (t) => tq.dayDiff(t.due) === 0], ['Atrasadas', (t) => tq.dayDiff(t.due) < 0], ['Próximas', (t) => tq.dayDiff(t.due) > 0]]) {
    clickIn(dom, tab(label));
    const expect = pendingAll.filter(test).length;
    log(`view ${label}: ${total()} rows (expected ${expect}) | button "${$('start-queue').textContent}"`);
    if (total() !== expect) fail(`view ${label}`);
  }
  // start the queue from "Vencen hoy"
  clickIn(dom, tab('Vencen hoy'));
  const expectIds = pendingAll.filter((t) => tq.dayDiff(t.due) === 0).map((t) => t.id);
  clickIn(dom, $('start-queue'));
  const q = JSON.parse(mem['crm:taskqueue'] || 'null');
  log('queue started:', q && `${q.ids.length} tasks, index ${q.index}, label "${q.label}"`, '| went to:', nav[0]);
  if (!q || q.ids.length !== expectIds.length || q.index !== 0) fail('queue state');
  const first = data.findRecord('tasks', q.ids[0]);
  if (nav[0] !== `../contacts/record/?id=${first.contactId}&task=${first.id}`) fail('first target should be the associated contact');
  // banner on the list when a queue is in progress
  if ($('tq-banner').hidden || !$('tq-banner').textContent.includes('Cola en curso')) fail('banner missing');
  log('banner:', $('tq-banner').textContent.replace(/\s+/g, ' ').trim().slice(0, 90));
  clickIn(dom, document.querySelector('[data-action="queue-continue"]'));
  if (nav[1] !== nav[0]) fail('continue should reopen the current task');
  log('[list] OK');
  run('record', { TQ: JSON.stringify(q), TQ_URL: `http://localhost/contacts/record/?id=${first.contactId}&task=${first.id}` });
  run('taskpage', { TQ: JSON.stringify({ ...q, ids: [q.ids[0]], index: 0 }), TQ_URL: `http://localhost/tasks/record/?id=${first.id}` });
  console.log('[task-queue] OK');
}

if (phase === 'record') {
  const q0 = JSON.parse(process.env.TQ);
  mem['crm:taskqueue'] = JSON.stringify(q0);
  const dom = setup(process.env.TQ_URL, 'data-type="contacts"');
  const tq = await import(resolve(here, '../src/task-queue.js'));
  const data = await import(resolve(here, '../src/data.js'));
  const nav = [];
  tq.setNavigator((h) => nav.push(h));
  await import(resolve(here, '../src/record.js'));
  const $ = (id) => document.getElementById(id);
  const bar = $('task-queue');
  const t0 = data.findRecord('tasks', q0.ids[0]);
  log('record:', $('rec-name').textContent.trim(), '| bar hidden?', bar.hidden, '| pos:', bar.querySelector('.tq__pos strong')?.textContent, '| title:', bar.querySelector('.tq__title a')?.textContent);
  if (bar.hidden || bar.querySelector('.tq__pos strong').textContent !== `Tarea 1 de ${q0.ids.length}`) fail('bar position');
  if (bar.querySelector('.tq__title a').textContent !== t0.name) fail('bar title');
  if (bar.querySelector('.tq__actions a[href*="/record/"]')) fail('should not offer "Ir a la tarea" on the right page');
  log('meta:', [...bar.querySelectorAll('.tq__meta span')].map((s) => s.textContent).join(' · '));
  // the Tareas card lists this task with a checkbox: complete it from the card
  const cb = document.querySelector(`[data-task-done="${t0.id}"]`);
  if (!cb) fail('task checkbox missing in the Tareas card');
  cb.checked = true;
  changeIn(dom, cb);
  const after = data.findRecord('tasks', t0.id);
  log('completed from card: status', after.status, '| completedAt set?', Boolean(after.completedAt), '| bar tag:', bar.querySelector('.tq__title .tag')?.textContent, '| button:', bar.querySelector('[data-tq="complete"]').textContent);
  if (after.status !== 'done' || !bar.querySelector('.tq__title .tag')) fail('complete from card');
  const events = JSON.parse(mem[`crm:contacts:notes:${t0.contactId}`] || '[]');
  if (!events.some((e) => /Tarea completada/.test(e.text))) fail('timeline event missing');
  // reopen from the card
  const cb2 = document.querySelector(`[data-task-done="${t0.id}"]`); // the card was re-rendered
  if (!cb2.checked || !cb2.closest('.assoc-card').classList.contains('is-done')) fail('card should show the task as done');
  cb2.checked = false;
  changeIn(dom, cb2);
  if (data.findRecord('tasks', t0.id).status !== 'todo') fail('reopen from card');
  // complete and move on from the bar
  clickIn(dom, bar.querySelector('[data-tq="complete"]'));
  let q = JSON.parse(mem['crm:taskqueue']);
  const t1 = data.findRecord('tasks', q.ids[1]);
  log('after complete: index', q.index, '| done', q.done, '| task status', data.findRecord('tasks', t0.id).status, '| went to:', nav[0], '| pos:', bar.querySelector('.tq__pos strong')?.textContent);
  if (q.index !== 1 || data.findRecord('tasks', t0.id).status !== 'done') fail('complete and next');
  if (t1 && Number(t1.contactId) !== Number(t0.contactId) && nav[0] !== `../../contacts/record/?id=${t1.contactId}&task=${t1.id}`) fail('should open the next task\'s contact');
  if (t1 && Number(t1.contactId) !== Number(t0.contactId) && !bar.querySelector('.tq__actions a[href*="contacts/record"]')) fail('bar should offer "Ir a la tarea" when the page is another record');
  // skip
  clickIn(dom, bar.querySelector('[data-tq="skip"]'));
  q = JSON.parse(mem['crm:taskqueue']);
  log('after skip: index', q.index, '| skipped', q.skipped);
  if (q.index !== 2 || q.skipped.length !== 1) fail('skip');
  // back one, then forward to the end
  clickIn(dom, bar.querySelector('[data-tq="prev"]'));
  q = JSON.parse(mem['crm:taskqueue']);
  if (q.index !== 1) fail('prev');
  let guard = 0;
  while (!bar.classList.contains('tq--finished') && guard < 50) { clickIn(dom, bar.querySelector('[data-tq="next"]')); guard += 1; }
  q = JSON.parse(mem['crm:taskqueue']);
  log('finished:', bar.classList.contains('tq--finished'), '| text:', bar.querySelector('.tq__title')?.textContent, '| requeue button?', Boolean(bar.querySelector('[data-tq="requeue"]')));
  if (!bar.classList.contains('tq--finished') || q.index !== q.ids.length) fail('finish');
  // work the skipped ones again
  clickIn(dom, bar.querySelector('[data-tq="requeue"]'));
  q = JSON.parse(mem['crm:taskqueue']);
  log('requeued:', q.ids.length, 'task(s), label', q.label, '| pos:', bar.querySelector('.tq__pos strong')?.textContent);
  if (q.ids.length !== 1 || q.index !== 0) fail('requeue skipped');
  // exit
  clickIn(dom, bar.querySelector('[data-tq="exit"]'));
  log('after exit: bar hidden?', bar.hidden, '| state:', mem['crm:taskqueue'] ?? null);
  if (!bar.hidden || mem['crm:taskqueue']) fail('exit');
  log('[record] OK');
}

if (phase === 'taskpage') {
  const q0 = JSON.parse(process.env.TQ);
  mem['crm:taskqueue'] = JSON.stringify(q0);
  const dom = setup(process.env.TQ_URL, 'data-type="tasks"');
  const tq = await import(resolve(here, '../src/task-queue.js'));
  const data = await import(resolve(here, '../src/data.js'));
  tq.setNavigator(() => {});
  await import(resolve(here, '../src/record.js'));
  const $ = (id) => document.getElementById(id);
  const bar = $('task-queue');
  log('task page:', $('rec-name').textContent.trim(), '| bar hidden?', bar.hidden, '| "Ir a la tarea" offered?', Boolean(bar.querySelector('.tq__actions a')));
  if (bar.hidden || bar.querySelector('.tq__actions a')) fail('bar on the task page');
  clickIn(dom, document.querySelector('#rec-stages [data-status="done"]'));
  log('after "Marcar como completada": status', data.findRecord('tasks', q0.ids[0]).status, '| bar tag:', bar.querySelector('.tq__title .tag')?.textContent, '| button:', bar.querySelector('[data-tq="complete"]').textContent);
  if (!bar.querySelector('.tq__title .tag') || bar.querySelector('[data-tq="complete"]').textContent !== 'Terminar') fail('bar should reflect the completed task');
  clickIn(dom, bar.querySelector('[data-tq="complete"]'));
  if (!bar.classList.contains('tq--finished')) fail('finish from the task page');
  log('[taskpage] OK');
}
