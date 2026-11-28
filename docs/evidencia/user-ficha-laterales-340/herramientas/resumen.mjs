import fs from 'node:fs';
const fase = process.argv[2] || 'antes';
for (const f of ['contacto-w1440', 'contacto-w1280', 'empresa-w1440', 'negocio-w1440']) {
  const m = JSON.parse(fs.readFileSync(`/tmp/l340-w/medidas/${fase}/${f}.json`, 'utf8'));
  console.log(`\n===== ${fase} ${f}: viewport ${m.viewport}, scrollW doc ${m.docScrollW}`);
  console.log('record', m.record.rect.w, 'cols:', m.record['grid-template-columns'], '| hijos:', m.record.cols.map((c) => `${c.cls}=${c.rect.w}`).join(' · '));
  if (m.rtabs) {
    const t = m.rtabs;
    console.log(`rtabs w ${t.rect.w} client ${t.clientW} scroll ${t.scrollW} isScroll ${t.isScroll} moreHidden ${t.moreHidden}`);
    let sumNow = 0; let sum128 = 0;
    for (const x of t.tabs) {
      const pad = parseFloat(x['padding-left']) + parseFloat(x['padding-right']) + parseFloat(x['border-right-width'] || 0);
      const pred = x.textW128 + 16 + parseFloat(x['border-right-width'] || 0);
      if (!x.hidden && !x.cls.includes('more-btn')) { sumNow += x.rect.w; sum128 += pred; }
      console.log(`  [${x.hidden ? 'oculta' : 'visible'}] «${x.text}» w ${x.rect.w} · fs ${x['font-size']} peso ${x['font-weight']} pad ${x['padding-left']}/${x['padding-right']} · texto ${x.textW} → a 12.8px ${x.textW128} → ancho previsto con 0 8px: ${pred.toFixed(1)}`);
    }
    console.log(`  suma visibles ahora ${sumNow.toFixed(1)} · suma prevista (12.8px, pad 8, todas) ${sum128.toFixed(1)}`);
  }
  if (m.quick) {
    const q = m.quick;
    console.log(`quick-row w ${q.rect.w} wrap ${q['flex-wrap']} gap ${q.gap} · card w ${q.card?.w} pad ${q.cardPadding?.['padding-left']}/${q.cardPadding?.['padding-right']}`);
    let sum = 0;
    for (const b of q.btns) { sum += b.textW128; console.log(`  «${b.text}» ${b.rect.w}×${b.rect.h} @y${b.rect.y} fs ${b['font-size']} · ico ${b.ico?.w} svg ${b.svg?.w} · texto ${b.textW} (12.8px: ${b.textW128})`); }
    console.log(`  suma textos a 12.8px ${sum.toFixed(1)} · 6 botones + 5×4 gap = ${(sum + 20).toFixed(1)} · + 5×8 = ${(sum + 40).toFixed(1)}`);
  }
  console.log('props rows:', m.props.map((p) => `${p.key}: h ${p.rect.h} pad ${p['padding-top']}/${p['padding-bottom']} dt h ${p.dt?.h} dd mt ${p.ddMarginTop} dd h ${p.dd?.h}`).join(' | '), `(${m.propsCount} filas)`);
  console.log('assoc card gap', m.assocCardGap?.gap, '| rows:', m.assocRows.map((a) => `h ${a.rect.h} pad ${a['padding-top']}/${a['padding-bottom']} gap ${a.gap}`).join(' | '));
  console.log('left card', m.leftCard.rect?.w, 'pad', m.leftCard['padding-left'], m.leftCard['padding-right']);
}
