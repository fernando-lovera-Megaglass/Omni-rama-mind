// Static smoke test for the dark theme coverage of src/app.css: no surface keeps a hard-coded light background
// without a dark equivalent. Rules: (1) the surface tokens exist in :root and in [data-theme="dark"] with dark
// values; (2) the panels the person listed (Bandeja, Tareas, Negocios, Ajustes › Objetos, ficha, workflows,
// filtros) use tokens, never a light literal; (3) every other rule with a light literal background outside the
// dark scope has a [data-theme="dark"] override for the same selector, except purely decorative art.
// Run: node scripts/smoke-dark-theme.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../src/app.css'), 'utf8');
const log = (...a) => console.log('[dark-theme]', ...a);
const fail = (msg) => { console.error(`[dark-theme] FAIL: ${msg}`); process.exit(1); };

const lum = (hex) => {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const LIGHT = 0.6;
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const DARK = '[data-theme="dark"]';

// ---- parse rules (selector, declarations, line, dark scope) ----
const rules = [];
const re = /([^{}]+)\{([^{}]*)\}/g;
let m;
while ((m = re.exec(css))) {
  const raw = m[1];
  const selector = norm(raw.replace(/\/\*[\s\S]*?\*\//g, ''));
  if (!selector || selector.startsWith('@')) continue;
  const decls = m[2].replace(/\/\*[\s\S]*?\*\//g, '').split(';').map((s) => s.trim()).filter(Boolean);
  rules.push({ selector, decls, line: css.slice(0, m.index + raw.length).split('\n').length, dark: selector.includes(DARK) });
}
const lightBackground = (d) => {
  if (!/^(background|background-color)\s*:/.test(d)) return false;
  const value = d.replace(/var\([^)]*\)/g, '');            // a var() fallback is not a literal background
  const hexes = value.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  return hexes.some((h) => lum(h) > LIGHT) || /:\s*(white|#fff)\b/.test(value);
};

// ---- 1) tokens ----
const block = (sel) => (rules.find((r) => r.selector === sel) || { decls: [] }).decls;
const token = (decls, name) => (decls.find((d) => d.startsWith(`${name}:`)) || '').split(':')[1]?.trim();
for (const name of ['--c-soft', '--c-soft-2', '--c-teal-soft', '--c-paper', '--c-head', '--c-white']) {
  const light = token(block(':root'), name);
  const dark = token(block(DARK), name);
  if (!light || !dark) fail(`token ${name} missing in :root or ${DARK}`);
  if (lum(dark) > 0.3) fail(`token ${name} dark value ${dark} is not dark`);
  if (lum(light) < 0.6) fail(`token ${name} light value ${light} is not light`);
}
log('surface tokens: --c-soft/--c-soft-2/--c-teal-soft/--c-paper (+ --c-head/--c-white) in :root and dark');

// ---- 2) the listed panels only use tokens ----
const CITED = ['.inbox__list', '.inbox__side', '.inbox__itembtn:hover', '.tq-banner', '.tq__bar', '.dupes__group', '.cd-amount__prefix', '.cd-assoc__row', '.opreview', '.opreview__card', '.opreview__grid .opreview__card', '.rvpin', '.logic__right', '.lcond', '.allf__ico'];
for (const sel of CITED) {
  const own = rules.filter((r) => !r.dark && r.selector.split(',').map(norm).includes(sel));
  if (!own.length) fail(`rule ${sel} not found`);
  const bad = own.flatMap((r) => r.decls.filter(lightBackground).map((d) => `${sel} (line ${r.line}): ${d}`));
  if (bad.length) fail(`light literal background left: ${bad.join(' | ')}`);
  const bg = own.flatMap((r) => r.decls.filter((d) => /^background(-color)?\s*:/.test(d)));
  if (!bg.length || !bg.every((d) => /var\(--c-/.test(d))) fail(`${sel} must take its background from a --c-* token (${bg.join(' | ')})`);
}
log(`listed panels use tokens: ${CITED.length} selectors`);

// ---- 3) every other light literal background has a dark override (or is decorative art) ----
const DECORATIVE = [/^\.dint__art/, /^\.recent__art/, /^\.sig__photo/, /^\.imp__tl-dot/, /^\.seg__dot/, /^\.gauge__fill/, /^\.ledit__status\.is-dirty/, /^\.cem__dot/, /^\.ibs__dot/, /\.cem__dot$/, /^\.dtags__swatch/, /^\.dtag__colorbtn/, /^\.dtag(--[a-z]+)?$/, /^\.lidentity__dot$/];
const covered = new Set(rules.filter((r) => r.dark).flatMap((r) => r.selector.split(',').map((s) => norm(s.replace(DARK, '')))));
const uncovered = [];
for (const r of rules) {
  if (r.dark) continue;
  const light = r.decls.filter(lightBackground);
  if (!light.length) continue;
  for (const part of r.selector.split(',').map(norm)) {
    if (DECORATIVE.some((p) => p.test(part))) continue;
    if (!covered.has(part)) uncovered.push(`${part} (line ${r.line}): ${light.join('; ')}`);
  }
}
if (uncovered.length) fail(`light backgrounds without a dark override:\n  ${uncovered.join('\n  ')}`);
const literalCount = rules.filter((r) => !r.dark && r.decls.some(lightBackground)).length;
log(`every remaining light literal background (${literalCount} rules, status tints) has a [data-theme="dark"] override`);
console.log('[dark-theme] OK');
