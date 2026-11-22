import { getSetting, dbIsLive } from './data.js';

export const OUTCOMES_KEY = 'crm:call_outcomes';
const DEFAULTS = ['Ocupado', 'Conectado', 'Dejó mensaje en directo', 'Dejó mensaje de voz', 'No contesta', 'Número equivocado'];
export function outcomeSettings(read = getSetting) {
  let stored = read(OUTCOMES_KEY);
  if (stored == null && !dbIsLive()) {
    try { stored = JSON.parse(localStorage.getItem(OUTCOMES_KEY)); } catch { /* Defaults. */ }
  }
  const rows = Array.isArray(stored) ? stored : DEFAULTS;
  const seen = new Set();
  return rows.map((row) => typeof row === 'string' ? { name: row, active: true } : row)
    .filter(row => row && typeof row.name === 'string' && row.name.trim())
    .map(row => ({ name: row.name.trim(), active: row.active !== false }))
    .filter(row => { const key = row.name.toLocaleLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
}
// History is appended verbatim: renaming or hiding never rewrites recorded activities.
export function callOutcomes(historical = []) {
  return [...new Set([...outcomeSettings().filter(row => row.active).map(row => row.name), ...historical.filter(value => typeof value === 'string' && value)])];
}
