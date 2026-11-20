// Task reminders: the reminder date-time saved on each task (reminderAt, from Ajustes › General › Tareas
// «Recordatorio predeterminado» or chosen by hand), the checker that runs every 30 s while Omni is open and
// fires the due ones — a browser notification (Notification API, asking for permission), a bubble inside
// the app with a soft chime and a link to the task, the bell entry — and marks them fired (reminderFiredAt)
// so nothing repeats. Started from src/page.js on every page.
import { allTasks, setField, formatDate, REMINDER_OPTIONS, defaultReminderOption, reminderFromDue, dueMoment } from './data.js';
import { addNotification } from './notifications.js';

export { REMINDER_OPTIONS, defaultReminderOption, reminderFromDue, dueMoment };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
// «21 nov 2026 a las 09:00» for lists, fichas and the bubble.
export const reminderText = (iso) => { if (!iso) return ''; const d = new Date(iso); if (Number.isNaN(d.getTime())) return ''; return `${formatDate(d)} a las ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
// Value for an <input type="datetime-local"> in the browser's own time zone.
export const datetimeInput = (iso) => { if (!iso) return ''; const d = new Date(iso); if (Number.isNaN(d.getTime())) return ''; return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const rootPath = () => (typeof document !== 'undefined' && document.body && document.body.dataset.root) || '';
const win = () => (typeof window !== 'undefined' ? window : null);

// ---------- which reminders are due ----------
export const hasPendingReminder = (t) => Boolean(t && t.status !== 'done' && t.reminderAt && !t.reminderFiredAt);
export const dueReminders = (now = Date.now()) => allTasks().filter((t) => hasPendingReminder(t) && new Date(t.reminderAt).getTime() <= now);
export const upcomingReminders = (now = Date.now()) => allTasks().filter((t) => hasPendingReminder(t) && new Date(t.reminderAt).getTime() > now).sort((a, b) => new Date(a.reminderAt) - new Date(b.reminderAt));

// ---------- browser notifications (Notification API) ----------
const Notif = () => { const w = win(); return (w && w.Notification) || null; };
export const notificationPermission = () => { const N = Notif(); return N ? N.permission : 'unsupported'; };
export const needsPermission = () => notificationPermission() === 'default';
// Asks the browser once (Chrome only shows the prompt from a click: the bubble and Ajustes offer a button).
export async function requestNotificationPermission() {
  const N = Notif();
  if (!N || N.permission !== 'default' || typeof N.requestPermission !== 'function') return notificationPermission();
  try { const p = await N.requestPermission(); return p || notificationPermission(); } catch { return notificationPermission(); }
}
let lastBrowserNotification = null;
export const lastNotification = () => lastBrowserNotification;
function browserNotify(task, href, body) {
  const N = Notif();
  if (!N) return false;
  const show = () => {
    try {
      const n = new N(`Recordatorio: ${task.name}`, { body, tag: `omni-task-${task.id}`, icon: `${rootPath()}favicon-32.png` });
      n.onclick = () => { try { const w = win(); if (w && w.focus) w.focus(); location.href = href; } catch { /* ignore */ } };
      lastBrowserNotification = n;
      return true;
    } catch { return false; }
  };
  if (N.permission === 'granted') return show();
  if (N.permission === 'default') { requestNotificationPermission().then((p) => { if (p === 'granted') show(); }); }
  return false;
}

// ---------- the chime (Web Audio, no file needed): two soft notes ----------
let audioCtx = null;
let chimes = 0;
export const chimesPlayed = () => chimes;
export function playChime() {
  try {
    const w = win();
    const AC = w && (w.AudioContext || w.webkitAudioContext);
    if (!AC) return false;
    audioCtx = audioCtx || new AC();
    if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') audioCtx.resume().catch(() => {});
    const t0 = audioCtx.currentTime || 0;
    [[880, 0], [1174.66, 0.18]].forEach(([freq, at]) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.08, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.35);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.4);
    });
    chimes += 1;
    return true;
  } catch { return false; }
}

// ---------- the bubble inside the app ----------
function container() {
  let c = document.getElementById('rbubbles');
  if (c) return c;
  c = document.createElement('div');
  c.id = 'rbubbles';
  c.className = 'rbubbles';
  c.setAttribute('aria-live', 'polite');
  document.body.appendChild(c);
  c.addEventListener('click', (e) => {
    const close = e.target.closest('[data-rb-close]');
    if (close) { const b = close.closest('.rbub'); if (b) b.remove(); return; }
    const perm = e.target.closest('[data-rb-permission]');
    if (perm) { perm.disabled = true; requestNotificationPermission().then((p) => { perm.textContent = p === 'granted' ? 'Avisos del navegador activados' : p === 'denied' ? 'Avisos bloqueados en el navegador' : 'Activar avisos del navegador'; perm.disabled = p !== 'default'; }); }
  });
  return c;
}
export function showBubble(task, { href = `${rootPath()}tasks/record/?id=${task.id}`, body = '' } = {}) {
  if (typeof document === 'undefined' || !document.body) return null;
  const c = container();
  const el = document.createElement('div');
  el.className = 'rbub';
  el.dataset.task = String(task.id);
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="rbub__ico" aria-hidden="true">⏰</span><div class="rbub__body"><strong class="rbub__title">Recordatorio de tarea</strong><a class="rbub__link" href="${esc(href)}">${esc(task.name)}</a>${body ? `<div class="rbub__meta">${esc(body)}</div>` : ''}${needsPermission() ? '<button class="link-btn rbub__perm" type="button" data-rb-permission>Activar avisos del navegador</button>' : ''}</div><button class="rbub__close" type="button" data-rb-close aria-label="Cerrar">×</button>`;
  c.prepend(el);
  while (c.children.length > 3) c.lastElementChild.remove();
  return el;
}

// ---------- firing ----------
const describe = (task) => `${task.type || 'Tarea'} · vence ${formatDate(task.due)}${task.contact ? ` · ${task.contact}` : ''}${task.owner && task.owner !== 'Sin asignar' ? ` · ${task.owner}` : ''}`;
export function fireReminder(task, { now = Date.now() } = {}) {
  // Marked first so a second checker pass (or another tab a minute later) never repeats it.
  setField('tasks', task.id, 'reminderFiredAt', new Date(now).toISOString());
  const href = `${rootPath()}tasks/record/?id=${task.id}`;
  const body = describe(task);
  addNotification({ kind: 'task', title: `Recordatorio: ${task.name}`, text: body, href: `tasks/record/?id=${task.id}` });
  showBubble(task, { href, body });
  playChime();
  const browser = browserNotify(task, href, body);
  if (typeof document !== 'undefined' && document.defaultView) document.dispatchEvent(new document.defaultView.CustomEvent('crm:reminder', { detail: { taskId: task.id, name: task.name, browser } }));
  return { task, href, browser };
}
export function processDueReminders(now = Date.now()) {
  const due = dueReminders(now);
  const fired = due.map((t) => fireReminder(t, { now }));
  return { fired: fired.length, tasks: fired.map((f) => f.task) };
}

// ---------- the checker: every 30 s while the app is open ----------
let timer = null;
let lastCheck = null;
export const lastCheckAt = () => lastCheck;
export function startReminderChecker({ intervalMs = 30000 } = {}) {
  if (timer) return timer;
  const tick = () => { lastCheck = new Date().toISOString(); try { processDueReminders(); } catch (e) { console.error('[recordatorios]', e); } };
  tick();
  timer = setInterval(tick, intervalMs);
  if (timer && typeof timer.unref === 'function') timer.unref();
  return timer;
}
export function stopReminderChecker() { if (timer) clearInterval(timer); timer = null; }
export const checkerRunning = () => Boolean(timer);
