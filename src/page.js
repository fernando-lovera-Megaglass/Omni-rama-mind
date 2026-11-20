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
  // The workflow checker (src/workflow-engine.js): once the page is up, processes the due runs (delays that
  // ended) and keeps doing it every minute while Omni stays open. Loaded after the page so it never delays it.
  const t = setTimeout(() => { import('./workflow-engine.js').then((m) => m.startWorkflowChecker()).catch((e) => console.error('[workflows] verificador', e)); }, 1500);
  if (t && typeof t.unref === 'function') t.unref();
}
