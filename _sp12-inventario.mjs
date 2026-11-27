// Temporal (no versionar): genera docs/evidencia/user-espaciado-fantasma-sp12/inventario.md con las 83 declaraciones.
import fs from 'node:fs';
const decls = JSON.parse(fs.readFileSync('/tmp/sp12-decls.json', 'utf8'));
const keep = JSON.parse(fs.readFileSync('/tmp/sp12-keep.json', 'utf8'));
const MOTIVO = {
  1517: 'tapaba `.estate { padding: var(--sp-32) var(--sp-16) }` (L1454)',
  3320: 'tapaba `.table th, .table td { padding: 0 var(--sp-16) }` (L1182); sin ninguna regla, `<td>/<th>` tendrían 1px del navegador',
  3566: 'tapaba `.table th, .table td { padding: 0 var(--sp-16) }` (L1182)',
  4959: 'tapaba `.tip__text { top: calc(100% + 10px) }` (L4682): el globo de la columna plegada se movería',
  5027: 'tapaba `.menu__panel { padding: var(--sp-8) 0 }` (L1370)',
  5195: 'en informes personalizados el valor es un `<p>`: sin regla, el navegador le pone `margin: 1em 0`',
  10918: 'es un `<p class="muted">`: sin regla, margen `1em 0` del navegador',
  10934: 'tapaba `.ginput { padding: 0 var(--sp-20) }` (L10420)',
  11722: '`<p>`: sin regla, margen `1em 0` del navegador',
  11749: '`<fieldset>`: sin regla, `margin: 0 2px` del navegador',
  11750: '`<fieldset>`: sin regla, `padding: 0.35em 0.75em 0.625em` del navegador',
  12022: 'tapaba `.mini-table th, .mini-table td { padding: var(--sp-10) var(--sp-8) }` (L2208)',
  12023: 'ídem L2208',
  12176: '`<button>`: sin regla, `padding: 1px 6px` del navegador (pestañas de redacción de la Bandeja)',
  12381: 'ídem: `padding: 1px 6px` del navegador',
  12401: 'tapaba `.mini-table th { padding: var(--sp-10) var(--sp-8) }` (L2208)',
  14258: '`<fieldset>`: sin regla, `margin: 0 2px` del navegador',
  18265: 'tapaba `.tpls__head { margin-bottom: var(--sp-16) }` (L15164): la cabecera de Workflows bajaría 16px',
  18350: 'tapaba `.wfe__bar { gap: var(--sp-16) }` (L17461): la barra del editor se abriría 16px entre elementos',
  19064: 'NO está muerta: tiene reserva `12px` y pinta 12px hoy. No es de las 80 anuladas; fuera del alcance, pendiente de decisión',
  19595: '`<ul>`: sin regla, `margin: 1em 0` del navegador',
  19617: 'tapaba `.drawer__body { gap: var(--sp-16) }` (L1639)',
  20650: 'tapaba `.record__colbar { padding: var(--sp-8) 0 }` (L13003); solo a ≤900px',
};
const antes = {}; const dir = '/tmp/sp12-medidas/antes';
for (const f of fs.readdirSync(dir)) {
  const m = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
  for (const [k, v] of Object.entries(m)) {
    if (!k.endsWith('|n') || !v) continue;
    const line = k.split('|')[0];
    (antes[line] = antes[line] || new Set()).add(f.replace(/-w1[24][48]0\.json$/, '').replace(/^x-/, ''));
  }
}
let md = '# Inventario de las 83 declaraciones con `--sp-12` / `--sp-48` en `src/app.css` (líneas de ANTES del cambio)\n\n';
md += 'Acción: **quitada** (no pintaba nada y nada toma el relevo) · **escrita con el valor actual** (al quitarla, otra regla anterior o el valor por defecto del navegador pasaría a verse: se deja `0`/`auto`, que es exactamente lo que pinta hoy) · **sin tocar**.\n';
md += '«Medida en»: pantallas o sub-estados (de los 30 + 95 medidos con Playwright) donde la regla alcanza elementos; vacío = no se renderiza en ningún estado medido (el análisis se hizo sobre el CSS y las plantillas).\n\n';
md += '| Línea | Selector | Declaración | Acción | Motivo / qué tomaría el relevo | Medida en |\n|---|---|---|---|---|---|\n';
for (const d of decls) {
  const k = keep[d.line];
  const accion = !k ? (d.declsInRule === 1 ? 'quitada (la regla queda vacía y se quita entera)' : 'quitada') : k.startsWith('var(') ? 'sin tocar' : `escrita con el valor actual: \`${d.prop}: ${k}\``;
  const where = [...(antes[d.line] || [])].sort();
  md += `| ${d.line} | \`${d.selector.replace(/\s+/g, ' ')}\`${d.at.length ? ` (${d.at.join(' ')})` : ''} | \`${d.prop}: ${d.value}\` | ${accion} | ${MOTIVO[d.line] || ''} | ${where.slice(0, 5).join(', ')}${where.length > 5 ? ` … (${where.length})` : ''} |\n`;
}
fs.mkdirSync('docs/evidencia/user-espaciado-fantasma-sp12', { recursive: true });
fs.writeFileSync('docs/evidencia/user-espaciado-fantasma-sp12/inventario.md', md);
console.log('inventario.md:', md.split('\n').length, 'líneas');
