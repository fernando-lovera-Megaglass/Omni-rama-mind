// Shared page bootstrap: mounts the shell and returns helpers.
import { mountShell, setNavBadge } from './shell.js';
import { ready as inboxReady, unreadCount } from './conversations-data.js';

export function boot({ root, active, sub, title }) {
  document.title = title;
  mountShell({ root, active, sub });
  // Unread conversations on the side navigation (the inbox page refreshes it after every change).
  inboxReady.then(() => setNavBadge('inbox', unreadCount())).catch(() => {});
}
