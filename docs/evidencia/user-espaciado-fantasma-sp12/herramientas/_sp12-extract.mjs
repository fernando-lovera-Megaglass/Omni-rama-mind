// Temporal (no versionar): lista las declaraciones de src/app.css que usan --sp-12 o --sp-48.
import fs from 'node:fs';
import postcss from 'postcss';
const file = process.argv[2] || 'src/app.css';
const css = fs.readFileSync(file, 'utf8');
const root = postcss.parse(css, { from: file });
const out = [];
root.walkDecls((d) => {
  if (!/var\(--sp-(12|48)\b/.test(d.value)) return;
  const at = [];
  const p = d.parent;
  const selector = p.type === 'rule' ? p.selector : `(${p.type} ${p.name} ${p.params})`;
  for (let q = p.parent; q && q.type !== 'root'; q = q.parent) if (q.type === 'atrule') at.push(`@${q.name} ${q.params}`);
  const siblings = p.nodes.filter((n) => n.type === 'decl').length;
  out.push({ line: d.source.start.line, selector, prop: d.prop, value: d.value, important: Boolean(d.important), at, fallback: /var\(--sp-(12|48)\s*,/.test(d.value), declsInRule: siblings, ruleStart: p.source.start.line, ruleEnd: p.source.end.line });
});
fs.writeFileSync('/tmp/sp12-decls.json', JSON.stringify(out, null, 1));
console.log(out.length, 'declaraciones');
out.forEach((o) => console.log(String(o.line).padStart(5), o.prop.padEnd(15), o.value.padEnd(46), o.at.length ? `[${o.at.join(' ')}] ` : '', o.selector.replace(/\s+/g, ' ').slice(0, 100), o.declsInRule === 1 ? '  ← única' : ''));
