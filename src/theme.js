// Dark/light theme for Omni. The choice lives in localStorage ('light' | 'dark' | 'system');
// 'system' follows macOS. applyTheme() sets data-theme on <html> and app.css does the rest.
const KEY = 'omni:theme';

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'dark' || t === 'light' || t === 'system') return t;
  } catch { /* private mode */ }
  return 'system';
}

export function resolvedTheme(t = getTheme()) {
  if (t !== 'system') return t;
  try { return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch { return 'light'; }
}

export function applyTheme(t = getTheme()) {
  if (typeof document === 'undefined' || !document.defaultView) return;
  document.documentElement.dataset.theme = resolvedTheme(t);
  document.dispatchEvent(new document.defaultView.CustomEvent('crm:theme', { detail: { theme: t, resolved: resolvedTheme(t) } }));
}

export function setTheme(t) {
  try { localStorage.setItem(KEY, t); } catch { /* private mode */ }
  applyTheme(t);
}

// Follow the system when the choice is 'system'.
if (typeof window !== 'undefined' && window.matchMedia) {
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (getTheme() === 'system') applyTheme('system'); });
  } catch { /* older Safari */ }
}
