// Temporal (no versionar). Compara /tmp/sp12-medidas/antes con /tmp/sp12-medidas/despues:
// por pantalla/estado y ancho, cada elemento alcanzado por una regla con --sp-12/--sp-48 cuyo estilo
// computado (o caja) cambió. Resumen por regla al final.
import fs from 'node:fs';
const A = '/tmp/sp12-medidas/antes';
const B = '/tmp/sp12-medidas/despues';
const decls = JSON.parse(fs.readFileSync('/tmp/sp12-decls.json', 'utf8'));
const byLine = Object.fromEntries(decls.map((d) => [d.line, d]));
const files = fs.readdirSync(A).filter((f) => f.endsWith('.json'));
let styleDiffs = 0; let boxDiffs = 0; let missing = 0;
const perRule = {};
const lines = [];
for (const f of files) {
  if (!fs.existsSync(`${B}/${f}`)) { missing++; lines.push(`SIN DESPUÉS: ${f}`); continue; }
  const a = JSON.parse(fs.readFileSync(`${A}/${f}`, 'utf8'));
  const b = JSON.parse(fs.readFileSync(`${B}/${f}`, 'utf8'));
  if (a.__unreachable || b.__unreachable) { lines.push(`estado no alcanzado en ${f}: antes=${a.__unreachable || 'ok'} · después=${b.__unreachable || 'ok'}`); }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (k === '__unreachable') continue;
    const va = a[k]; const vb = b[k];
    if (va === vb) continue;
    const line = Number(k.split('|')[0]);
    if (k.endsWith('|n')) { lines.push(`${f} ${k}: n ${va} → ${vb}`); continue; }
    const sa = String(va ?? '').split(' | caja ')[0]; const sb = String(vb ?? '').split(' | caja ')[0];
    if (sa !== sb) { styleDiffs++; perRule[line] = perRule[line] || new Set(); perRule[line].add(`${f}: ${sa} → ${sb}`); lines.push(`${f} ${k}: ${sa} → ${sb}`); }
    else { boxDiffs++; lines.push(`${f} ${k}: solo caja ${String(va).split(' | caja ')[1]} → ${String(vb).split(' | caja ')[1]}`); }
  }
}
console.log(lines.join('\n'));
console.log(`\n== ${files.length} archivos comparados · ${styleDiffs} estilos cambiados · ${boxDiffs} cajas movidas · ${missing} sin después`);
for (const [line, set] of Object.entries(perRule)) {
  const d = byLine[line];
  console.log(`\nL${line} ${d.selector.replace(/\s+/g, ' ')} { ${d.prop}: ${d.value} }`);
  [...set].slice(0, 6).forEach((s) => console.log('   ', s));
  if (set.size > 6) console.log(`    … y ${set.size - 6} más`);
}
