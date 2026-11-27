// Temporal (no versionar). Para cada declaración muerta (--sp-12/--sp-48) busca OTRAS reglas de
// app.css que puedan pintar la misma propiedad en los mismos elementos: si existe una anterior
// en cascada, al quitar la declaración muerta ese valor pasaría a verse (cambio visual).
import fs from 'node:fs';
import postcss from 'postcss';
const css = fs.readFileSync('src/app.css', 'utf8');
const root = postcss.parse(css, { from: 'src/app.css' });
const decls = JSON.parse(fs.readFileSync('/tmp/sp12-decls.json', 'utf8'));
const FAM = {
  padding: /^padding(-top|-right|-bottom|-left)?$/, 'padding-top': /^padding(-top)?$/, 'padding-bottom': /^padding(-bottom)?$/,
  margin: /^margin(-top|-right|-bottom|-left)?$/, 'margin-top': /^margin(-top)?$/, 'margin-bottom': /^margin(-bottom)?$/,
  gap: /^(gap|row-gap|column-gap)$/, top: /^(top|inset)$/,
};
const lastCompound = (sel) => sel.trim().split(/\s*[>+~]\s*|\s+/).filter(Boolean).pop() || '';
const tokens = (compound) => (compound.match(/[.#][\w-]+/g) || []);
const rules = [];
root.walkRules((r) => {
  const at = [];
  for (let q = r.parent; q && q.type !== 'root'; q = q.parent) if (q.type === 'atrule') at.push(`@${q.name} ${q.params}`);
  rules.push({ r, line: r.source.start.line, parts: r.selector.split(/\s*,\s*/).map((s) => s.replace(/\s+/g, ' ').trim()), at });
});
let report = '';
for (const d of decls) {
  const fam = FAM[d.prop] || new RegExp(`^${d.prop}$`);
  const myTokens = new Set(d.selector.split(/\s*,\s*/).flatMap((p) => tokens(lastCompound(p))));
  const hits = [];
  for (const R of rules) {
    if (R.line === d.ruleStart) {
      // misma regla: ¿otra declaración de la misma familia?
      R.r.nodes.filter((n) => n.type === 'decl' && n.source.start.line !== d.line && fam.test(n.prop)).forEach((n) => hits.push(`      misma regla L${n.source.start.line}: ${n.prop}: ${n.value}`));
      continue;
    }
    const share = R.parts.some((p) => tokens(lastCompound(p)).some((t) => myTokens.has(t)));
    if (!share) continue;
    const ds = R.r.nodes.filter((n) => n.type === 'decl' && fam.test(n.prop));
    if (!ds.length) continue;
    ds.forEach((n) => hits.push(`      ${R.line < d.ruleStart ? 'ANTES ' : 'después'} L${n.source.start.line} ${R.at.length ? `[${R.at.join(' ')}] ` : ''}${R.parts.join(', ').slice(0, 90)} { ${n.prop}: ${n.value}${n.important ? ' !important' : ''} }`));
  }
  report += `L${d.line} ${d.selector.replace(/\s+/g, ' ')} { ${d.prop}: ${d.value} }${d.at.length ? ` [${d.at.join(' ')}]` : ''}\n${hits.length ? hits.join('\n') : '      (ninguna otra regla de la familia en selectores afines)'}\n`;
}
fs.writeFileSync('/tmp/sp12-static.txt', report);
console.log(report);
