// Shared page bootstrap: mounts the shell and returns helpers.
import { mountShell } from './shell.js';

export function boot({ root, active, sub, title }) {
  document.title = title;
  mountShell({ root, active, sub });
}
