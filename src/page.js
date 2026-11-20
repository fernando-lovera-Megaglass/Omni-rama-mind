// Shared page bootstrap: mounts the shell and returns helpers.
import { mountShell, setNavBadge } from './shell.js';
import { ready as inboxReady, unreadCount } from './conversations-data.js';
import { applyTheme } from './theme.js';

export function boot({ root, active, sub, title }) {
  document.title = title;
  applyTheme();
  mountShell({ root, active, sub });
  // Unread conversations on the side navigation (the inbox page refreshes it after every change).
  inboxReady.then(() => setNavBadge('inbox', unreadCount())).catch(() => {});
  // The checkers, loaded after the page so they never delay it: the workflow engine (src/workflow-engine.js)
  // processes the due runs every minute; the task reminders (src/task-reminders.js) fire every 30 s.
  const t = setTimeout(() => {
    import('./workflow-engine.js').then((m) => m.startWorkflowChecker()).catch((e) => console.error('[workflows] verificador', e));
    import('./task-reminders.js').then((m) => m.startReminderChecker()).catch((e) => console.error('[recordatorios] verificador', e));
  }, 1500);
  if (t && typeof t.unref === 'function') t.unref();
}
