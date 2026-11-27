// Frontend de Contactos: homogeneización del módulo (DESIGN.md §5, aprobada 25-nov-2026; pedida 27-nov-2026).
//
// Comprueba en la lista (/contacts/) y la ficha (/contacts/record/?id=1), a 1440px y 1280px:
//   1) botones 40 / 32; 2) botones de icono 40 redondo / 32 / 22; 3) iconos .ico a 20 / 16 / 13 con opacidad .85;
//   4) el icono «edit» del catálogo donde iba el carácter ✎, y que cada botón que lo lleva sigue funcionando;
//   5) teléfonos con displayPhone. Sin errores en consola (fixture) y sin enlaces muertos.
import { test, expect, deadLinks } from './fixtures.js';

const box = (loc) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { w: Math.round(r.width), h: Math.round(r.height), opacity: Number(cs.opacity) }; });
const PHONE = /^\+\d{1,3} [\d ]+/; // «+52 72 2123 2580»: prefijo internacional y dígitos agrupados

test.describe('Contactos — homogeneización (lista)', () => {
  test('botones, iconos y lápices de la lista', async ({ page }) => {
    await page.goto('/contacts/');
    await expect(page.locator('.table tbody tr').first()).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute('data-type', 'contacts');

    // 4) Ningún carácter ✎ queda en la página.
    expect(await page.evaluate(() => document.body.innerHTML.includes('✎'))).toBe(false);

    // 1) Botones de la cabecera: 40px; «Agregar contactos» sigue siendo la píldora verde azulado (--c-link).
    expect((await box(page.locator('.page-head__actions .btn--ghost.btn--pillx'))).h).toBe(40);
    const add = page.locator('.page-head__actions .btn--primary.btn--pillx');
    expect((await box(add)).h).toBe(40);
    expect(await add.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(0, 97, 98)');

    // 2) + 3) «Ver configuración»: botón redondo de 40 con el engranaje a 16px y opacidad .85.
    expect(await box(page.locator('#vsettings-btn'))).toMatchObject({ w: 40, h: 40 });
    expect(await box(page.locator('#vsettings-btn .ico--gear'))).toMatchObject({ w: 16, h: 16, opacity: 0.85 });
    expect(await box(page.locator('#collapse-btn'))).toMatchObject({ w: 40, h: 40 });

    // 2) + 4) «Editar filtros rápidos»: botón de icono de 32 con el icono «edit» a 16px; sigue llevando a Ajustes.
    const quick = page.locator('[data-action="edit-quick"]');
    expect(await box(quick)).toMatchObject({ w: 32, h: 32 });
    expect(await box(quick.locator('svg'))).toMatchObject({ w: 16, h: 16, opacity: 0.85 });
    expect(await box(page.locator('[data-action="advanced"].icon-btn'))).toMatchObject({ w: 32, h: 32 });

    // 3) Iconos de la barra de vistas y de los enlaces externos a .85.
    expect((await box(page.locator('.views__tab .ico--grid').first())).opacity).toBe(0.85);
    expect(await box(page.locator('.table tbody .cell-link .ico--ext').first())).toMatchObject({ w: 13, h: 13, opacity: 0.85 });

    // 5) La columna de teléfono muestra el formato único.
    const phoneCell = page.locator('.table tbody tr:first-child td[data-key="phone"]');
    await expect(phoneCell).toHaveText(PHONE);

    // 4) Lápiz de celda: icono a 13px, visible al pasar el ratón.
    const cell = page.locator('.table tbody tr:first-child td.cell--editable:has(.cell__pen)').first();
    const pen = cell.locator('.cell__pen svg');
    expect(await box(pen)).toMatchObject({ w: 13, h: 13 });
    expect((await box(cell.locator('.cell__pen'))).opacity).toBe(0);
    await cell.hover();
    await expect.poll(async () => (await box(cell.locator('.cell__pen'))).opacity).toBe(1);

    // Menú de columna: iconos del sistema a 16px y .85.
    await page.locator('.th__more').first().evaluate((b) => b.click());
    const thIco = page.locator('.thmenu .menu__item .ico').first();
    await expect(thIco).toBeVisible();
    expect(await box(thIco)).toMatchObject({ w: 16, h: 16, opacity: 0.85 });
    await page.keyboard.press('Escape');

    // 1) + 4) Barra masiva: «Editar» lleva el icono «edit» a 16px, el botón mide 32 y sigue abriendo la edición en lote.
    await page.locator('.row-check').nth(0).check();
    await page.locator('.row-check').nth(1).check();
    const bulkEdit = page.locator('.bulk__btn[data-action="bulk-edit"]');
    await expect(bulkEdit).toBeVisible();
    expect((await box(bulkEdit)).h).toBe(32);
    expect(await box(bulkEdit.locator('.bulk__ico svg'))).toMatchObject({ w: 16, h: 16 });
    await bulkEdit.click();
    await expect(page.locator('#bulk-form')).toBeVisible();
    await page.locator('.bmodal.is-open button[data-bm="close"]').last().click(); // Cancelar
    await expect(page.locator('#bulk-form')).toBeHidden();
    await page.locator('[data-action="bulk-clear"]').click();

    // 1) + 4) Vista previa: «Ver registro» a 40px; los lápices de «Acerca de» llevan el icono y abren el editor en línea.
    await page.locator('.preview-btn').first().evaluate((b) => b.click());
    await expect(page.locator('#pv-props .props__row').first()).toBeVisible();
    expect((await box(page.locator('#preview .preview__foot .btn'))).h).toBe(40);
    await expect(page.locator('#pv-open')).toHaveAttribute('href', /record\/\?id=\d+/);
    const pvPen = page.locator('#pv-props .props__edit').first();
    expect(await box(pvPen.locator('svg'))).toMatchObject({ w: 13, h: 13 });
    await pvPen.evaluate((b) => b.click());
    await expect(page.locator('#pv-props form.props__form')).toBeVisible();
    await page.locator('button.icon-btn[data-pv="close"]').click();

    // Enlaces «#» preexistentes (barra lateral → «En construcción», «Todas las vistas»): se informan, como en pantallas.spec.js.
    test.info().annotations.push({ type: 'deadLinks()', description: (await deadLinks(page)).join(' · ') || '(ninguno)' });
  });

  test('«Editar filtros rápidos» lleva a Ajustes', async ({ page }) => {
    await page.goto('/contacts/');
    await expect(page.locator('.table tbody tr').first()).toBeVisible();
    await page.locator('[data-action="edit-quick"]').click();
    await expect(page).toHaveURL(/settings\/#obj-contacts:index/);
  });
});

test.describe('Contactos — homogeneización (ficha)', () => {
  test('botones, iconos, lápices y teléfonos de la ficha', async ({ page }) => {
    await page.goto('/contacts/record/?id=1');
    await expect(page.locator('h1#rec-name')).toBeVisible();
    await expect(page.locator('#rec-props .props__row').first()).toBeVisible();

    // 4) Ningún carácter ✎ queda en la página.
    expect(await page.evaluate(() => document.body.innerHTML.includes('✎'))).toBe(false);

    // 1) Botones compactos de la ficha: 32px.
    expect((await box(page.locator('.record__actions > .btn--sm'))).h).toBe(32);

    // 2) «Personalizar la tarjeta»: botón de icono de 32 (antes 34) con el engranaje a 16px; sigue abriendo su editor.
    const gear = page.locator('.card__head--about .icon-btn--round');
    expect(await box(gear)).toMatchObject({ w: 32, h: 32 });
    expect(await box(gear.locator('.ico--gear'))).toMatchObject({ w: 16, h: 16, opacity: 0.85 });
    await gear.click();
    await expect(page.locator('#card-search')).toBeVisible();
    await page.locator('[data-close]:visible').first().click();
    await expect(page.locator('#card-search')).toBeHidden();

    // 2) Botón de icono xs (regenerar resumen): 22px.
    const xs = page.locator('.icon-btn--xs').first();
    if (await xs.count()) expect(await box(xs)).toMatchObject({ w: 22, h: 22 });

    // 4) Lápiz del título: icono «edit» a 16px; sigue abriendo la edición del nombre.
    const title = page.locator('h1#rec-name .pencil');
    expect(await box(title.locator('svg'))).toMatchObject({ w: 16, h: 16, opacity: 0.85 });
    let asked = '';
    page.once('dialog', (d) => { asked = d.message(); d.dismiss(); }); // «Nuevo nombre» (window.prompt)
    await title.click();
    await expect.poll(() => asked).toBe('Nuevo nombre');

    // 4) Lápiz de propiedad: icono a 13px, visible al pasar el ratón, abre el editor en línea.
    const row = page.locator('#rec-props .props__row[data-key="phone"]');
    const pen = row.locator('.props__edit');
    expect(await box(pen.locator('svg'))).toMatchObject({ w: 13, h: 13 });
    await row.hover();
    await expect.poll(async () => (await box(pen)).opacity).toBe(1);
    await pen.click();
    await expect(row.locator('form.props__form')).toBeVisible();
    await row.locator('form.props__form [data-cancel]').click(); // Cancelar
    await expect(row.locator('form.props__form')).toBeHidden();

    // 3) Enlaces externos (correo, web) con el icono a 13px y .85.
    const ext = page.locator('#rec-props .cell-link .ico--ext').first();
    if (await ext.count()) expect(await box(ext)).toMatchObject({ w: 13, h: 13, opacity: 0.85 });

    // 5) Teléfonos: cabecera y tarjeta de empresas asociadas con el formato único.
    await expect(page.locator('#rec-phone a')).toHaveText(PHONE);
    const assocPhone = page.locator('.card--assoc[data-kind="companies"] .assoc-card__row:has-text("teléfono") a').first();
    if (await assocPhone.count()) await expect(assocPhone).toHaveText(PHONE);

    // Enlaces «#» preexistentes (barra lateral, valores de las tarjetas de asociación): se informan, no cambian aquí.
    test.info().annotations.push({ type: 'deadLinks()', description: (await deadLinks(page)).join(' · ') || '(ninguno)' });
  });
});
