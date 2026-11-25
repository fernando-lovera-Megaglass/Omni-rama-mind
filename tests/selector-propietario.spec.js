// Tarea user-selector-propietario-ligero (25-nov-2026): el selector de propietario (.osel, src/owner-select.js)
// es un menú ligero. En reposo: avatar de 24px + nombre en 600 + flecha de 13px, sin caja; hover --c-head.
// Menú anclado bajo el nombre (4px), mínimo 240px, radio 8px, opciones de 36px con avatar, «Sin asignar»
// primero, la elegida con --c-tag-new + ✓; buscador solo con más de 8 personas. El <select> nativo sigue
// siendo la fuente de verdad. Modo demo determinista; sin errores en consola (fixture).
import { test, expect } from './fixtures.js';

const HEAD = 'rgb(245, 248, 250)'; // --c-head
const TAG_NEW = 'rgb(229, 245, 248)'; // --c-tag-new

const box = (loc) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; });

const openRecordOwner = async (page, url) => {
  await page.goto(url);
  await expect(page.locator('h1:visible').first()).toBeVisible();
  await page.locator('#rec-props .props__row[data-key="owner"] [data-edit-key="owner"]').click();
  const osel = page.locator('#rec-props .osel');
  await expect(osel.locator('.osel__btn')).toBeVisible();
  return osel;
};

const expectMenu = async (osel) => {
  const btn = osel.locator('.osel__btn');
  const panel = osel.locator('.osel__panel');
  await expect(panel).toBeVisible();
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  const b = await box(btn);
  const p = await box(panel);
  // Anclado justo debajo del nombre, a la izquierda del botón; mínimo 240px; radio --r-md.
  expect(Math.abs(p.y - (b.bottom + 4))).toBeLessThanOrEqual(1);
  expect(Math.abs(p.x - b.x)).toBeLessThanOrEqual(1);
  expect(p.w).toBeGreaterThanOrEqual(240);
  await expect(panel).toHaveCSS('border-radius', '8px');
  // Todas las opciones con su avatar a la vista; «Sin asignar» primero con avatar neutro.
  const opts = osel.locator('.osel__opt');
  // Una entrada por persona más una sola «Sin asignar» (si el <select> trae «--» y «Sin asignar», se muestra una).
  const native = await osel.locator('select').evaluate((s) => { const empty = /^(sin asignar|--|—|cualquiera|ninguno|)$/i; const all = [...s.options].filter((o) => !o.disabled); const empties = all.filter((o) => o.value === '' || empty.test(o.textContent.trim())).length; return all.length - empties + (empties ? 1 : 0); });
  await expect(opts).toHaveCount(native);
  for (let i = 0; i < native; i++) {
    await expect(opts.nth(i).locator('.avatar')).toBeVisible();
    expect((await box(opts.nth(i))).h).toBe(36);
  }
  await expect(opts.first()).toContainText('Sin asignar');
  await expect(opts.first().locator('.avatar--empty')).toBeVisible();
  const selected = osel.locator('.osel__opt.is-selected');
  await expect(selected).toHaveCount(1);
  await expect(selected).toHaveCSS('background-color', TAG_NEW);
  await expect(selected).toHaveCSS('font-weight', '600');
  await expect(selected.locator('.osel__check')).toBeVisible();
  // Con 8 personas o menos no hay buscador.
  if (native <= 8) await expect(osel.locator('.osel__search')).toHaveCount(0);
};

test.describe('Selector de propietario ligero', () => {
  test('ficha de contacto: trigger ligero, menú anclado, elegir cambia el valor y persiste', async ({ page }) => {
    const osel = await openRecordOwner(page, '/contacts/record/?id=1');
    const btn = osel.locator('.osel__btn');
    // En reposo: botón real sin caja, 32px, avatar de 24px, nombre en 600, flecha de 13px.
    await expect(btn).toHaveAttribute('aria-haspopup', 'listbox');
    await expect(btn).toHaveCSS('border-top-width', '0px');
    await expect(btn).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    expect((await box(btn)).h).toBe(32);
    expect((await box(btn.locator('.avatar'))).w).toBe(24);
    await expect(btn.locator('.owner__name')).toHaveCSS('font-weight', '600');
    const arrow = await box(btn.locator('.osel__arrow'));
    expect(arrow.w).toBe(13);
    expect(arrow.h).toBe(13);
    await btn.hover();
    await expect(btn).toHaveCSS('background-color', HEAD);
    await expect(btn).toHaveCSS('border-top-left-radius', '6px');
    await btn.click();
    await expectMenu(osel);
    // Elegir a Sofía R.: el <select> nativo cambia, Guardar lo deja en la ficha y sobrevive a la recarga.
    await osel.locator('.osel__opt', { hasText: 'Sofía R.' }).click();
    await expect(osel.locator('select')).toHaveValue('Sofía R.');
    await expect(osel.locator('.osel__panel')).toBeHidden();
    await expect(btn).toContainText('Sofía R.');
    await page.locator('#rec-props .props__form button[type="submit"]').click();
    await expect(page.locator('#rec-props .props__row[data-key="owner"]')).toContainText('Sofía R.');
    await page.reload();
    await expect(page.locator('#rec-props .props__row[data-key="owner"]')).toContainText('Sofía R.');
  });

  test('ficha de empresa: todas las opciones con avatar; Escape y clic fuera cierran', async ({ page }) => {
    const osel = await openRecordOwner(page, '/companies/record/?id=1');
    const btn = osel.locator('.osel__btn');
    await btn.click();
    await expectMenu(osel);
    // Escape cierra el menú (y, en la ficha, también el editor en línea: comportamiento previo de la ficha).
    await page.keyboard.press('Escape');
    await expect(page.locator('#rec-props .osel__panel:visible')).toHaveCount(0);
    // Clic fuera: cierra el menú.
    const again = await openRecordOwner(page, '/companies/record/?id=1');
    await again.locator('.osel__btn').click();
    await expect(again.locator('.osel__panel')).toBeVisible();
    await page.locator('h1:visible').first().click();
    await expect(page.locator('#rec-props .osel__panel:visible')).toHaveCount(0);
  });

  test('lista de contactos: «Asignar» (campo con borde) y editor de celda abren el mismo menú', async ({ page }) => {
    await page.goto('/contacts/');
    await expect(page.locator('#rows tr[data-id]').first()).toBeVisible();
    await page.locator('#rows tr .row-check').first().check();
    await page.locator('#bulk [data-action="bulk-assign"]').click();
    const field = page.locator('#bulk-modal.is-open .osel');
    const fbtn = field.locator('.osel__btn');
    await expect(fbtn).toBeVisible();
    // Dentro de un campo de formulario conserva la caja con borde de 40px a todo el ancho.
    await expect(fbtn).toHaveCSS('border-top-width', '1px');
    expect((await box(fbtn)).h).toBe(40);
    await fbtn.click();
    await expectMenu(field);
    await field.locator('.osel__opt', { hasText: 'Diego G.' }).click();
    await expect(field.locator('select')).toHaveValue('Diego G.');
    await page.locator('#bulk-modal').getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('#bulk-modal.is-open')).toHaveCount(0);
    // Editor de celda (clic en la celda del propietario).
    const cell = page.locator('#rows tr[data-id]').first().locator('td[data-key="owner"].cell--editable');
    await expect(cell).toHaveCount(1);
    await cell.click();
    const pop = page.locator('#cellpop .osel');
    await expect(pop.locator('.osel__btn')).toBeVisible();
    await pop.locator('.osel__btn').click();
    await expectMenu(pop);
    await page.keyboard.press('Escape');
    await expect(pop.locator('.osel__panel')).toBeHidden();
  });

  test('el buscador solo aparece con más de 8 personas', async ({ page }) => {
    await page.goto('/contacts/');
    await expect(page.locator('#rows tr[data-id]').first()).toBeVisible();
    const counts = await page.evaluate(async () => {
      const { enhanceOwnerSelects } = await import('/src/owner-select.js');
      const make = (n) => { const s = document.createElement('select'); s.setAttribute('data-owner-select', ''); s.innerHTML = ['<option value="">Sin asignar</option>', ...Array.from({ length: n }, (_, i) => `<option>Persona ${i + 1}</option>`)].join(''); document.body.appendChild(s); enhanceOwnerSelects(s); s.parentElement.querySelector('.osel__btn').click(); return s.parentElement; };
      const few = make(7); // 8 opciones en total
      const many = make(9); // 10 opciones en total
      return { few: few.querySelectorAll('.osel__search').length, many: many.querySelectorAll('.osel__search').length, fewOpts: few.querySelectorAll('.osel__opt').length, manyOpts: many.querySelectorAll('.osel__opt').length };
    });
    expect(counts).toEqual({ few: 0, many: 1, fewOpts: 8, manyOpts: 10 });
  });
});
