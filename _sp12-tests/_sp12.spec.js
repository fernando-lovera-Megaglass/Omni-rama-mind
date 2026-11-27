// Temporal (no versionar). Tarea user-espaciado-fantasma-sp12. FASE=antes|despues.
// Por pantalla y ancho: (1) estilos computados de cada elemento alcanzado por las reglas que
// usan --sp-12/--sp-48 (→ /tmp/sp12-medidas/<fase>/), (2) captura de evidencia de las pantallas
// nombradas en la tarea, (3) comparación contra una captura de referencia temporal en /tmp
// (creada en la fase «antes»; nunca se tocan las capturas base del repo).
import fs from 'node:fs';
import { test, expect } from '../tests/fixtures.js';

const FASE = process.env.FASE || 'antes';
const DECLS = JSON.parse(fs.readFileSync('/tmp/sp12-decls.json', 'utf8'));
const OUT = `/tmp/sp12-medidas/${FASE}`;
const EVID = 'docs/evidencia/user-espaciado-fantasma-sp12';
const EVID_IDS = new Set(['informes', 'negocios-lista', 'negocios-ficha', 'bandeja', 'configuracion', 'administrar-vistas']);
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(EVID, { recursive: true });

// Misma lista que tests/pantallas.spec.js (+ la lista de Contactos de tests/contactos.spec.js).
const PANTALLAS = [
  { id: 'inicio-sesion', url: '/', ready: 'form:visible' },
  { id: 'informes', url: '/reports/', ready: '.card:visible' },
  { id: 'contactos-lista', url: '/contacts/', ready: '#rows tr[data-id]' },
  { id: 'contactos-ficha', url: '/contacts/record/?id=1', ready: 'h1:visible' },
  { id: 'empresas-lista', url: '/companies/', ready: '#rows tr[data-id]' },
  { id: 'empresas-ficha', url: '/companies/record/?id=1', ready: 'h1:visible' },
  { id: 'negocios-lista', url: '/deals/', ready: '#rows tr[data-id]' },
  { id: 'negocios-ficha', url: '/deals/record/?id=1', ready: 'h1:visible' },
  { id: 'tickets-lista', url: '/tickets/', ready: '#rows tr[data-id]' },
  { id: 'tickets-ficha', url: '/tickets/record/?id=1', ready: 'h1:visible' },
  { id: 'tareas-lista', url: '/tasks/', ready: '#rows tr[data-id]' },
  { id: 'tareas-ficha', url: '/tasks/record/?id=1', ready: 'h1:visible' },
  { id: 'diseno-de-registro', url: '/layout/?type=contacts', ready: 'h2:visible' },
  { id: 'administrar-vistas', url: '/views/', ready: '.pill:visible' },
  { id: 'configuracion', url: '/settings/', ready: 'h2:visible' },
  { id: 'datos', url: '/data/', ready: 'h1:visible' },
  { id: 'datos-importar', url: '/data/import/?from=contacts', ready: 'h1:visible' },
  { id: 'segmentos', url: '/segments/', ready: '.table:visible' },
  { id: 'segmento-crear', url: '/segments/editor/', ready: 'h1:visible' },
  { id: 'bandeja', url: '/inbox/', ready: 'h1:visible' },
  { id: 'llamadas', url: '/calls/', ready: 'h1:visible' },
  { id: 'marketing-preferencias', url: '/marketing/preferences/', ready: 'h1:visible' },
  { id: 'marketing-correo', url: '/marketing/email/', ready: '.table:visible' },
  { id: 'plantillas', url: '/templates/', ready: '.table:visible' },
  { id: 'fragmentos', url: '/snippets/', ready: '.table:visible' },
  { id: 'secuencias', url: '/sequences/', ready: 'h1:visible' },
  { id: 'secuencia-crear', url: '/sequences/create/', ready: 'h1:visible' },
  { id: 'workflows', url: '/automation/', ready: '.table:visible' },
  { id: 'workflow-editor', url: '/automation/editor/?id=d9000000-0000-4000-8000-000000000003', ready: 'main:visible' },
  { id: 'workflow-crear', url: '/automation/create/', ready: 'h1:visible' },
];

const LONGHANDS = {
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  gap: ['row-gap', 'column-gap'],
};

for (const route of PANTALLAS) {
  test(`sp12 ${route.id}`, async ({ page }, testInfo) => {
    await page.goto(route.url);
    await page.locator(route.ready).first().waitFor({ state: 'visible', timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const medidas = await page.evaluate(({ DECLS, LONGHANDS }) => {
      const out = {};
      for (const d of DECLS) {
        const props = LONGHANDS[d.prop] || [d.prop];
        for (const part of d.selector.split(/\s*,\s*/)) {
          let sel = part.replace(/\s+/g, ' ').trim();
          let pseudo = null;
          const m = sel.match(/::?(before|after)$/);
          if (m) { pseudo = `::${m[1]}`; sel = sel.slice(0, m.index); }
          let els;
          try { els = [...document.querySelectorAll(sel)]; } catch (e) { out[`${d.line}|${part}`] = 'unqueryable'; continue; }
          els.slice(0, 400).forEach((el, i) => {
            const cs = getComputedStyle(el, pseudo);
            const r = el.getBoundingClientRect();
            out[`${d.line}|${part}|${i}`] = `${props.map((p) => `${p}=${cs.getPropertyValue(p)}`).join(' ')} | caja ${Math.round(r.width)}×${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)}`;
          });
          out[`${d.line}|${part}|n`] = els.length;
        }
      }
      return out;
    }, { DECLS, LONGHANDS });
    fs.writeFileSync(`${OUT}/${route.id}-${testInfo.project.name}.json`, JSON.stringify(medidas, null, 1));
    if (EVID_IDS.has(route.id)) await page.screenshot({ path: `${EVID}/${FASE}-${route.id}-${testInfo.project.use.viewport.width}.png`, animations: 'disabled', caret: 'hide' });
    await expect(page).toHaveScreenshot(`${route.id}.png`, { fullPage: false, animations: 'disabled', caret: 'hide' });
  });
}
