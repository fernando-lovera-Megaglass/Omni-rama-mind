// Temporal (no versionar). Análisis estático ampliado: para cada declaración muerta, deduce de las
// plantillas JS la etiqueta y TODAS las clases del elemento, y busca reglas de app.css que pinten la
// misma familia de propiedad sobre ese elemento (clases hermanas, etiqueta, universal), más el valor
// por defecto del navegador para la etiqueta. Si existe una, al quitar la muerta ese valor pasaría a
// verse. Salida: /tmp/sp12-static2.txt
import fs from 'node:fs';
import postcss from 'postcss';
const css = fs.readFileSync('src/app.css', 'utf8');
const root = postcss.parse(css, { from: 'src/app.css' });
const decls = JSON.parse(fs.readFileSync('/tmp/sp12-decls.json', 'utf8'));
const js = fs.readdirSync('src').filter((f) => f.endsWith('.js')).map((f) => [f, fs.readFileSync(`src/${f}`, 'utf8')]);
const FAM = {
  padding: /^padding(-top|-right|-bottom|-left|-block|-inline)?$/, 'padding-top': /^padding(-top|-block)?$/, 'padding-bottom': /^padding(-bottom|-block)?$/,
  margin: /^margin(-top|-right|-bottom|-left|-block|-inline)?$/, 'margin-top': /^margin(-top|-block)?$/, 'margin-bottom': /^margin(-bottom|-block)?$/,
  gap: /^(gap|row-gap|column-gap)$/, top: /^(top|inset|inset-block)$/,
};
// Valores por defecto del navegador (Chromium) que importan aquí.
const UA = {
  p: { margin: '1em 0 (≈14–16px)' }, ul: { margin: '1em 0', padding: '0 0 0 40px' }, ol: { margin: '1em 0', padding: '0 0 0 40px' },
  fieldset: { margin: '0 2px', padding: '0.35em 0.75em 0.625em' }, td: { padding: '1px' }, th: { padding: '1px' },
  button: { padding: '1px 6px' }, input: { padding: '1px 2px (texto)' }, select: { padding: '0' }, textarea: { padding: '2px' },
  h2: { margin: '0.83em 0' }, h3: { margin: '1em 0' }, h4: { margin: '1.33em 0' }, details: {}, summary: {}, legend: { padding: '0 2px' },
};
const spec = (sel) => { const ids=(sel.match(/#[\w-]+/g)||[]).length; const cls=(sel.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+(\([^)]*\))?/g)||[]).length; const types=(sel.replace(/\[[^\]]*\]|\([^)]*\)/g,'').match(/(^|[\s>+~])[a-z][\w-]*/g)||[]).length; return ids*100+cls*10+types; };
const compounds = (sel) => sel.trim().split(/\s*[>+~]\s*|\s+/).filter(Boolean);
const classesOf = (c) => (c.match(/\.[\w-]+/g) || []).map((x) => x.slice(1));
const tagOf = (c) => (c.match(/^[a-z][\w-]*/) || [null])[0];
const rules = [];
root.walkRules((r) => {
  const at = [];
  for (let q = r.parent; q && q.type !== 'root'; q = q.parent) if (q.type === 'atrule') at.push(`@${q.name} ${q.params}`);
  rules.push({ r, line: r.source.start.line, parts: r.selector.split(/\s*,\s*/).map((s) => s.replace(/\s+/g, ' ').trim()), at });
});
// elemento real: etiqueta + clases, a partir de las plantillas
const elementFor = (part) => {
  const comps = compounds(part);
  const last = comps[comps.length - 1];
  let cls = classesOf(last); let tag = tagOf(last);
  if (!cls.length && comps.length > 1) {
    // selector que termina en etiqueta (td, th, button, li, p): el contenedor lleva la clase
    const parentCls = classesOf(comps[comps.length - 2])[0];
    return { tag, classes: [], parentCls, note: `hijo <${tag}> de .${parentCls}` };
  }
  const found = new Set(); let tags = new Set();
  for (const [, s] of js) {
    const re = new RegExp(`<([a-z0-9]+)[^>]*class="([^"]*\\b${cls[0]}\\b[^"]*)"`, 'g');
    let m; while ((m = re.exec(s))) { tags.add(m[1]); m[2].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean).forEach((c) => found.add(c)); }
    const re2 = new RegExp(`className\\s*=\\s*'([^']*\\b${cls[0]}\\b[^']*)'`, 'g');
    while ((m = re2.exec(s))) { m[1].split(/\s+/).forEach((c) => found.add(c)); }
  }
  cls.forEach((c) => found.add(c));
  return { tag: tag || [...tags].join('/') || '?', classes: [...found], parentCls: null };
};
let report = '';
let flagged = 0;
for (const d of decls) {
  const fam = FAM[d.prop] || new RegExp(`^${d.prop}$`);
  const hits = [];
  for (const part of d.selector.split(/\s*,\s*/)) {
    const el = elementFor(part);
    const elClasses = new Set(el.classes);
    const tags = el.tag.split('/');
    for (const R of rules) {
      if (R.line === d.ruleStart) continue;
      const match = R.parts.some((p) => {
        const comps = compounds(p); const last = comps[comps.length - 1];
        const lcls = classesOf(last); const ltag = tagOf(last);
        if (last === '*') return true;
        if (el.parentCls) {
          // hijo-etiqueta: la regla debe terminar en la misma etiqueta y sus clases previas ser genéricas (no comprobables): se listan todas las que terminen en esa etiqueta
          return ltag === el.tag && !lcls.length;
        }
        if (lcls.length && !lcls.every((c) => elClasses.has(c))) return false;
        if (ltag && !tags.includes(ltag)) return false;
        if (!lcls.length && !ltag) return false;
        return true;
      });
      if (!match) continue;
      const ds = R.r.nodes.filter((n) => n.type === 'decl' && fam.test(n.prop));
      if (!ds.length) continue;
      const mySpec = Math.max(...d.selector.split(/\s*,\s*/).map(spec)); const rSpec = Math.max(...R.parts.map(spec));
      const takesOver = n => n.important || (R.line < d.ruleStart ? rSpec <= mySpec : rSpec < mySpec);
      ds.filter(takesOver).forEach((n) => hits.push(`      ${R.line < d.ruleStart ? 'ANTES ' : 'después'} L${n.source.start.line} ${R.at.length ? `[${R.at.join(' ')}] ` : ''}${R.parts.join(', ').slice(0, 80)} { ${n.prop}: ${n.value}${n.important ? ' !important' : ''} }`));
    }
    for (const t of tags) if (UA[t]) { const fams = Object.entries(UA[t]).filter(([p]) => fam.test(p)); fams.forEach(([p, v]) => hits.push(`      NAVEGADOR <${t}> { ${p}: ${v} }`)); }
    report += `L${d.line} ${part.trim()} { ${d.prop}: ${d.value} }${d.at.length ? ` [${d.at.join(' ')}]` : ''}  → <${el.tag}${el.classes.length ? ` class="${el.classes.join(' ')}"` : ''}>${el.note ? ` (${el.note})` : ''}\n`;
  }
  if (hits.length) flagged++;
  report += `${hits.length ? [...new Set(hits)].join('\n') : '      (nada tomaría el relevo: quitarla no cambia nada)'}\n`;
}
fs.writeFileSync('/tmp/sp12-static2.txt', report);
console.log(report);
console.log(`\n${flagged} declaraciones con candidato a tomar el relevo`);
