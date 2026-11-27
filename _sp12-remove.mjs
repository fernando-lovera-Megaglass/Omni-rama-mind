// Temporal (no versionar). Quita de src/app.css las declaraciones muertas que usan --sp-12/--sp-48
// (línea a línea, para que el diff sea mínimo), borra las reglas que queden vacías y verifica el
// resultado con postcss. Las líneas listadas en KEEP_AS se sustituyen en vez de borrarse (paso 2 de
// la tarea: token existente más cercano), y se informan.
import fs from 'node:fs';
import postcss from 'postcss';
const decls = JSON.parse(fs.readFileSync('/tmp/sp12-decls.json', 'utf8'));
const KEEP_AS = JSON.parse(process.env.KEEP_AS || '{}'); // { "19064": "var(--sp-10)" }
const src = fs.readFileSync('src/app.css', 'utf8');
const lines = src.split('\n');
const removed = []; const replaced = []; const drop = new Set();
for (const d of decls) {
  const i = d.line - 1;
  const text = lines[i];
  const declRe = new RegExp(`\\s*${d.prop.replace(/[-]/g, '\\-')}\\s*:\\s*${d.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(!important)?\\s*;`);
  if (!declRe.test(text)) throw new Error(`L${d.line}: no encuentro «${d.prop}: ${d.value}» en «${text}»`);
  if (KEEP_AS[d.line]) {
    // valor completo nuevo (p. ej. «0» o «auto»): la propiedad queda escrita con lo que ya pinta hoy
    lines[i] = text.replace(declRe, (m) => m.replace(d.value, KEEP_AS[d.line]));
    replaced.push(`L${d.line} ${d.selector.replace(/\s+/g, ' ')}: ${d.prop}: ${d.value} → ${d.prop}: ${KEEP_AS[d.line]}`);
    continue;
  }
  const only = text.trim().replace(declRe, '').trim() === '';
  if (only) { drop.add(i); removed.push(`L${d.line} ${d.selector.replace(/\s+/g, ' ')} { ${d.prop}: ${d.value} }`); continue; }
  // regla en una sola línea: quitar solo la declaración
  lines[i] = text.replace(declRe, '').replace(/\{\s+/, '{ ').replace(/;\s*\}/, '; }').replace(/\{\s*\}/, '{ }');
  removed.push(`L${d.line} ${d.selector.replace(/\s+/g, ' ')} { ${d.prop}: ${d.value} } (regla de una línea)`);
  if (/\{\s*\}\s*$/.test(lines[i])) { drop.add(i); removed[removed.length - 1] += ' → regla vacía, se quita'; }
}
// reglas multilínea que quedan vacías: «selector {» seguido solo de «}»
const emptyRules = [];
for (let i = 0; i < lines.length; i++) {
  if (drop.has(i) || !/\{\s*$/.test(lines[i])) continue;
  let j = i + 1;
  while (j < lines.length && (drop.has(j) || lines[j].trim() === '')) j++;
  if (j < lines.length && lines[j].trim() === '}' && j > i + 0 && [...Array(j - i - 1).keys()].every((k) => drop.has(i + 1 + k) || lines[i + 1 + k].trim() === '') && j - i - 1 > 0) {
    drop.add(i); drop.add(j); emptyRules.push(`L${i + 1} ${lines[i].trim()}`);
    // línea en blanco que quedaría duplicada
    if (lines[i - 1] !== undefined && lines[i - 1].trim() === '' && lines[j + 1] !== undefined && lines[j + 1].trim() === '') drop.add(j + 1);
  }
}
const out = lines.filter((_, i) => !drop.has(i)).join('\n');
postcss.parse(out, { from: 'src/app.css' }); // debe seguir siendo CSS válido
const left = (out.match(/var\(--sp-(12|48)\b/g) || []).length;
fs.writeFileSync('src/app.css', out);
console.log(`quitadas ${removed.length} declaraciones, ${emptyRules.length} reglas vacías, ${replaced.length} sustituidas; quedan ${left} referencias; ${lines.length} → ${out.split('\n').length} líneas`);
console.log('--- sustituidas'); replaced.forEach((s) => console.log(' ', s));
console.log('--- reglas vacías quitadas'); emptyRules.forEach((s) => console.log(' ', s));
