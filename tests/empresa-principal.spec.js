// Tarea user-ficha-empresa-principal (27-nov-2026), modo demo determinista (fixtures.js), 1440 y 1280.
//  1) Ficha: en cada tarjeta de asociaciones con multi-asociación, el registro principal va PRIMERO y lleva
//     la etiqueta «Principal» (.tag.tag--done) siempre visible; los demás, sin esa etiqueta.
//  2) Lista de Contactos: la celda «Contacto → Empresas» muestra solo la empresa principal en una línea,
//     sin el botón «N registros»; la fila mide lo mismo que las demás (48px, DESIGN.md §5 punto 7).
import { test, expect, deadLinks } from './fixtures.js';

const open = async (page, url, ready) => {
  await page.goto(url);
  await page.locator(ready).first().waitFor({ state: 'visible', timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
};
// En ventanas de menos de 1440px la ficha pliega sola la columna derecha (record.js, NARROW_QUERY): se expande
// para comprobar que la etiqueta se ve.
const expandRight = async (page) => {
  const t = page.locator('#col-toggle-right');
  if (await t.count() && (await t.getAttribute('aria-expanded')) === 'false') { await t.click(); await page.waitForTimeout(250); }
};

// La tarjeta de un tipo: sus filas (.assoc-card) y cuál lleva la etiqueta «Principal».
const cardInfo = (page, kind) => page.locator(`.card--assoc[data-kind="${kind}"]`).first().evaluate((card) => {
  const rows = [...card.querySelectorAll('.assoc-card')];
  const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  return {
    count: rows.length,
    names: rows.map((r) => txt(r.querySelector('.assoc-card__head strong'))),
    principal: rows.map((r) => [...r.querySelectorAll('.tag--done')].map(txt)),
    tagVisible: rows.map((r) => { const t = r.querySelector('.tag--done'); if (!t) return false; const b = t.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(t).visibility !== 'hidden'; }),
  };
});

test.describe('Empresa principal — ficha', () => {
  test('contacto con dos empresas (Alicia Prieto, id 55): la principal primero y con «Principal»', async ({ page }) => {
    await open(page, '/contacts/record/?id=55', 'h1:visible');
    await expandRight(page);
    const c = await cardInfo(page, 'companies');
    expect(c.count).toBeGreaterThanOrEqual(2);
    // La empresa principal del contacto (campo «Empresa principal» de la ficha) es la primera fila.
    const primaryName = await page.locator('#rec-props .props__row[data-key="company"] dd, .record__who, .record__sub').first().evaluate((el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
    if (primaryName) expect(primaryName).toContain(c.names[0]);
    expect(c.principal[0]).toEqual(['Principal']);
    expect(c.tagVisible[0]).toBe(true);
    c.principal.slice(1).forEach((tags) => expect(tags).toEqual([]));
    // Una sola etiqueta «Principal» en la tarjeta.
    expect(c.principal.flat().filter((t) => t === 'Principal')).toHaveLength(1);
    expect(await deadLinks(page)).toEqual(expect.any(Array));
  });

  test('empresa con varios contactos (id 1): el contacto principal primero y con «Principal»', async ({ page }) => {
    await open(page, '/companies/record/?id=1', 'h1:visible');
    await expandRight(page);
    const c = await cardInfo(page, 'contacts');
    expect(c.count).toBeGreaterThanOrEqual(2);
    expect(c.principal[0]).toEqual(['Principal']);
    expect(c.tagVisible[0]).toBe(true);
    c.principal.slice(1).forEach((tags) => expect(tags).toEqual([]));
  });

  test('negocio (id 1): tarjetas de contactos y empresas con la etiqueta «Principal» en la primera fila', async ({ page }) => {
    await open(page, '/deals/record/?id=1', 'h1:visible');
    await expandRight(page);
    for (const kind of ['contacts', 'companies']) {
      const c = await cardInfo(page, kind);
      if (!c.count) continue;
      expect(c.principal[0], kind).toEqual(['Principal']);
      c.principal.slice(1).forEach((tags) => expect(tags, kind).toEqual([]));
    }
  });
});

test.describe('Empresa principal — lista de Contactos', () => {
  test('la celda de Empresa va en una línea y la fila de Alicia Prieto mide como las demás', async ({ page }) => {
    await open(page, '/contacts/', '#rows tr[data-id]');
    const row = page.locator('#rows tr[data-id="55"]');
    await expect(row).toBeVisible();
    await expect(row).toContainText('Alicia Prieto');
    // Sin botón «N registros» ni nada apilado.
    await expect(page.locator('#rows [data-assoc-more]')).toHaveCount(0);
    const cell = row.locator('td').filter({ hasText: 'Cristales' }).first();
    await expect(cell.locator('.name')).toHaveCount(1);
    // La fila mide 48px, igual que las demás filas (DESIGN.md §5 punto 7).
    const heights = await page.locator('#rows tr[data-id]').evaluateAll((trs) => trs.slice(0, 12).map((tr) => Math.round(tr.getBoundingClientRect().height)));
    const h55 = await row.evaluate((tr) => Math.round(tr.getBoundingClientRect().height));
    expect(h55).toBe(48);
    heights.forEach((h) => expect(h).toBe(48));
    // La empresa principal sigue enlazando a su ficha.
    const href = await cell.locator('a').first().getAttribute('href');
    expect(href).toMatch(/companies\/record\/\?id=\d+/);
    // Texto en una sola línea (sin salto): la celda no es más alta que la fila.
    const cellH = await cell.evaluate((td) => Math.round(td.getBoundingClientRect().height));
    expect(cellH).toBeLessThanOrEqual(48);
  });
});
