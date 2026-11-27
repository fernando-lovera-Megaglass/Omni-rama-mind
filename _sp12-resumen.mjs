import fs from 'node:fs';
const fase = process.argv[2] || 'antes';
const dir = `/tmp/sp12-medidas/${fase}`;
const decls = JSON.parse(fs.readFileSync('/tmp/sp12-decls.json', 'utf8'));
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
const data = Object.fromEntries(files.map((f) => [f.replace('.json', ''), JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'))]));
for (const d of decls) {
  const where = [];
  let sample = '';
  for (const [scr, m] of Object.entries(data)) {
    for (const [k, v] of Object.entries(m)) {
      if (!k.startsWith(`${d.line}|`)) continue;
      if (k.endsWith('|n') && v > 0) where.push(`${scr}:${v}`);
      if (!k.endsWith('|n') && !sample && v !== 'unqueryable') sample = v;
      if (v === 'unqueryable') sample = 'UNQUERYABLE';
    }
  }
  console.log(`L${d.line} ${d.selector.replace(/\s+/g, ' ').slice(0, 60)} ${d.prop}: ${where.length ? `${where.length} pant. (${where.slice(0, 4).join(', ')}${where.length > 4 ? '…' : ''}) · ${sample.split(' | ')[0]}` : 'SIN ELEMENTOS en las 30 pantallas'}`);
}
