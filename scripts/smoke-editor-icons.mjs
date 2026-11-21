// Static smoke test for the rich-text editor toolbars: no emoji among the formatting buttons; «Insertar enlace»
// and «Insertar imagen» use the shared line icons of src/action-icons.js (same 1.8 px stroke as the rest) in the
// compose window (ficha / bandeja), the template editor, the snippet editor and the signature editor.
// Run: node scripts/smoke-editor-icons.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[editor-icons]', ...a);
const fail = (msg) => { console.error(`[editor-icons] FAIL: ${msg}`); process.exit(1); };
// Emoji = Unicode Extended_Pictographic (🔗 🖼 📎 ⛶ …); typographic glyphs such as the assistant's ✦ spark, × or ⌄ are not.
const EMOJI = /\p{Extended_Pictographic}/u;

const { ACT_ICONS } = await import(resolve(here, '../src/action-icons.js'));
for (const name of ['link', 'image']) {
  const svg = ACT_ICONS[name];
  if (!svg || !/^<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"/.test(svg) || !svg.includes('aria-hidden="true"')) fail(`ACT_ICONS.${name} must be a 24×24 line icon with the shared 1.8 px stroke`);
}
log('ACT_ICONS.link and ACT_ICONS.image: 24×24, stroke 1.8, currentColor');

// toolbar markup of each editor: the slice between the toolbar opening tag and the end of the template literal block
const TOOLBARS = {
  'compose.js': ['compose__toolbar', ['data-cm="link"', 'data-cm="image"', 'class="compose__attach"']],
  'templates.js': ['tpe__toolbar', ['data-te="link"', 'data-te="image"']],
  'snippets.js': ['tpe__toolbar', ['data-se="link"']],
  'connected-emails-ui.js': ['tpe__toolbar', ['data-cemm="sig-link"', 'class="sigm__img"']],
};
for (const [file, [cls, buttons]] of Object.entries(TOOLBARS)) {
  const src = readFileSync(resolve(here, `../src/${file}`), 'utf8');
  const start = src.indexOf(`class="${cls}"`);
  if (start < 0) fail(`${file}: toolbar .${cls} not found`);
  const block = src.slice(start, start + 2600);
  const emoji = block.match(EMOJI);
  if (emoji) fail(`${file}: emoji «${emoji[0]}» left in the .${cls} toolbar`);
  for (const b of buttons) {
    const at = block.indexOf(b);
    if (at < 0) fail(`${file}: ${b} not in the toolbar`);
    const tag = block.slice(at, block.indexOf('</', at));
    if (!/\$\{ACT_ICONS\.(link|image|attach)\}/.test(tag)) fail(`${file}: ${b} must render ACT_ICONS.link / image / attach (got «${tag.slice(0, 80)}»)`);
  }
  if (!src.includes("from './action-icons.js'")) fail(`${file}: must import ACT_ICONS from action-icons.js`);
  log(`${file}: .${cls} without emoji; ${buttons.length} icon button(s) from ACT_ICONS`);
}
const css = readFileSync(resolve(here, '../src/app.css'), 'utf8');
if (!/\.compose__toolbar > button > svg,[\s\S]{0,160}\.tpe__toolbar > button > svg[^{]*\{[^}]*width: 18px/.test(css) || !/\.tpe__toolbar > button,[^{]*\{[^}]*display: inline-flex/.test(css)) fail('app.css must size the toolbar svg icons and center tpe toolbar buttons');
log('app.css: toolbar icons sized 18 px and centred like the letter buttons');
console.log('[editor-icons] OK');
