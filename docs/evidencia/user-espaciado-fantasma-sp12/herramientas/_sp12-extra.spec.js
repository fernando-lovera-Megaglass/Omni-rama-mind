// Temporal (no versionar). Tarea user-espaciado-fantasma-sp12. FASE=antes|despues.
// Sub-estados que no cubren las 30 pantallas base pero donde viven reglas con --sp-12: secciones
// y pestañas de Configuración, tablero de negocios con columna plegada, importación (paso de mapeo),
// editor de previsualización, modal de reunión, editor de segmento existente, pestañas de Vistas…
// Misma medición que _sp12.spec.js (→ /tmp/sp12-medidas/<fase>/x-<estado>-<proyecto>.json) y
// captura de referencia temporal en /tmp/sp12-base (nunca las capturas base del repo).
import fs from 'node:fs';
import { test, expect } from './fixtures.js';

const FASE = process.env.FASE || 'antes';
const DECLS = JSON.parse(fs.readFileSync('/tmp/sp12-decls.json', 'utf8'));
const OUT = `/tmp/sp12-medidas/${FASE}`;
fs.mkdirSync(OUT, { recursive: true });

const SETTINGS = ['prefs-general', 'prefs-notif', 'org-accounts', 'org-copy', 'account-defaults', 'data-audit', 'account-users', 'int-connected', 'int-private', 'account-marketplace', 'track-code', 'track-analytics', 'account-privacy', 'account-security', 'account-ai', 'account-payments', 'data-objects', 'data-properties', 'data-import', 'data-quality', 'data-enrich', 'data-sync', 'mk-email', 'mk-forms', 'mk-ads', 'mk-social', 'ct-pages', 'ct-blog', 'ct-domains', 'sl-deals', 'sl-quotes', 'sl-meetings', 'sv-tickets', 'sv-surveys', 'sv-kb', 'ib-channels', 'ib-inboxes', 'tools-calling', 'tools-payments'];
const OBJ_TABS = ['config', 'pipelines', 'lifecycle', 'record', 'preview', 'index', 'assoc'];

const wait = async (page, sel, ms = 8000) => page.locator(sel).first().waitFor({ state: 'attached', timeout: ms });
const STATES = [
  ...SETTINGS.map((id) => ({ id: `settings-${id}`, url: `/settings/#${id}`, ready: 'main' })),
  ...['contacts', 'companies', 'deals', 'tickets'].flatMap((o) => OBJ_TABS.map((t) => ({ id: `settings-obj-${o}-${t}`, url: `/settings/#obj-${o}:${t}`, ready: 'main' }))),
  { id: 'settings-rail', url: '/settings/', ready: 'main', setup: async (page) => { await page.locator('.snav__collapse').first().click(); await wait(page, '.snav--rail'); } },
  { id: 'negocios-tablero', url: '/deals/', ready: '#rows tr[data-id]', setup: async (page) => { await page.locator('[data-action="mode-board"]').first().evaluate((b) => b.click(), { timeout: 8000 }); await wait(page, '.kcol'); } },
  { id: 'negocios-tablero-plegado', url: '/deals/', ready: '#rows tr[data-id]', setup: async (page) => { await page.locator('[data-action="mode-board"]').first().evaluate((b) => b.click(), { timeout: 8000 }); await wait(page, '.kcol'); await page.locator('[data-kcol-collapse]').first().evaluate((b) => b.click(), { timeout: 8000 }); await wait(page, '.kcol--collapsed'); } },
  { id: 'negocios-menu-pipeline', url: '/deals/', ready: '#rows tr[data-id]', setup: async (page) => { await page.locator('.menu:has(.pmenu) > button').first().click(); await wait(page, '.pmenu'); } },
  { id: 'importar-mapeo', url: '/data/import/?from=contacts', ready: 'h1', setup: async (page) => { await page.locator('#imp-paste').fill('Nombre\tCorreo\tTeléfono\nAna Prueba\tana.prueba@ejemplo.com\t+34 600 000 000\nLuis Prueba\tluis.prueba@ejemplo.com\t'); await page.locator('[data-act="use-paste"]').click(); await page.waitForTimeout(300); await page.locator('[data-act="next1"]').first().evaluate((b) => b.click(), { timeout: 8000 }); await wait(page, '.imp__map'); } },
  { id: 'diseno-previsualizacion', url: '/layout/?type=contacts&preview=1', ready: '.pvedit', setup: async (page) => { await wait(page, '.pvedit'); } },
  { id: 'ficha-modal-reunion', url: '/contacts/record/?id=1', ready: 'h1', setup: async (page) => { await page.getByRole('button', { name: 'Reunión' }).first().click(); await wait(page, '.log-attendees, #log-modal, .bmodal.is-open'); } },
  { id: 'segmento-editar', url: '/segments/', ready: '.table', setup: async (page) => { const href = await page.locator('a[href*="editor/?id="]').first().getAttribute('href'); await page.goto(href.startsWith('/') ? href : `/segments/${href}`); await wait(page, '.sedit__filters-head, .sedit__ai, .sedit__addmember'); } },
  { id: 'vistas-pestana-2', url: '/views/', ready: '.pill', setup: async (page) => { await page.locator('.mv__tab').nth(1).click(); await page.waitForTimeout(300); } },
  { id: 'vistas-pestana-3', url: '/views/', ready: '.pill', setup: async (page) => { await page.locator('.mv__tab').nth(2).click(); await page.waitForTimeout(300); } },
  { id: 'vistas-tabla', url: '/views/', ready: '.pill', setup: async (page) => { await page.locator('.mv__nav button[data-tab-go="all"]').first().evaluate((b) => b.click(), { timeout: 8000 }); await wait(page, '.mvtable td'); } },
  { id: 'workflows-editor-ayuda', url: '/automation/editor/?id=d9000000-0000-4000-8000-000000000003', ready: 'main', setup: async (page) => { await page.locator('[data-we="help"]').first().evaluate((b) => b.click(), { timeout: 8000 }); await wait(page, '.wfe__help'); } },
];

const LONGHANDS = {
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  gap: ['row-gap', 'column-gap'],
};

for (const st of STATES) {
  test(`sp12 extra ${st.id}`, async ({ page }, testInfo) => {
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    await page.goto(st.url);
    await page.locator(st.ready).first().waitFor({ state: 'visible', timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    let unreachable = null;
    if (st.setup) { try { await st.setup(page); } catch (e) { unreachable = String(e.message || e).split('\n')[0].slice(0, 160); } }
    await page.waitForTimeout(300);
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
    if (unreachable) medidas.__unreachable = unreachable;
    fs.writeFileSync(`${OUT}/x-${st.id}-${testInfo.project.name}.json`, JSON.stringify(medidas, null, 1));
    expect.soft(unreachable, `estado alcanzable: ${st.id}`).toBeNull();
    await expect(page).toHaveScreenshot(`x-${st.id}.png`, { fullPage: false, animations: 'disabled', caret: 'hide' });
  });
}
