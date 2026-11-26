// Tarea user-papelera-buscador-interno (25-nov-2026): el panel «Restaurar registros eliminados» (Acciones ›
// Restaurar registros eliminados, src/list.js renderTrash) tiene un buscador propio que filtra las filas por
// nombre, correo/dominio y propietario mientras se escribe; sin coincidencias avisa; restaurar devuelve el
// registro a la lista. Mismo componente para Contactos, Empresas, Negocios y Tickets. Modo demo determinista;
// sin errores en consola (fixture).
import { test, expect } from './fixtures.js';

const openList = async (page, url) => {
  await page.goto(url);
  await expect(page.locator('#rows tr[data-id]').first()).toBeVisible();
};
// Borra las filas indicadas con la barra masiva (diálogo de confirmación de Omni).
const deleteRows = async (page, indexes) => {
  for (const i of indexes) await page.locator('#rows tr .row-check').nth(i).check();
  await page.locator('#bulk [data-action="delete"]').click();
  const modal = page.locator('#bulk-modal.is-open');
  await expect(modal).toBeVisible();
  await modal.locator('#bulk-ok').click();
  await expect(page.locator('#bulk-modal.is-open')).toHaveCount(0);
};
// «Restaurar registros eliminados» vive en el menú «Acciones» (Contactos, Empresas, Tickets) o en el «⋮» (Negocios).
const openTrash = async (page) => {
  const item = page.locator('.page-head__actions .menu__item[data-action="trash"]');
  // El botón hijo directo del .menu que contiene el ítem es su disparador («Acciones» o «⋮»).
  await page.locator('.page-head__actions .menu:has(.menu__item[data-action="trash"]) > button').click();
  await item.click();
  const drawer = page.locator('#actions-drawer');
  await expect(drawer).toHaveClass(/is-open/);
  return drawer;
};

test.describe('Papelera con buscador interno', () => {
  test('Contactos: borrar, buscar en la papelera, restaurar y verlo de vuelta en la lista', async ({ page }) => {
    await openList(page, '/contacts/');
    const names = page.locator('#rows tr[data-id] .firstcell__content a');
    const victim = (await names.nth(1).textContent()).trim();
    const other = (await names.nth(2).textContent()).trim();
    const total = Number((await page.locator('#total-pill').textContent()).replace(/\D/g, ''));
    await deleteRows(page, [1, 2]);
    await expect.poll(async () => Number((await page.locator('#total-pill').textContent()).replace(/\D/g, ''))).toBe(total - 2);
    await expect(page.locator('#rows tr[data-id] .firstcell__content a', { hasText: victim })).toHaveCount(0);

    const drawer = await openTrash(page);
    await expect(drawer.locator('#actions-title')).toHaveText(/Restaurar registros eliminados · 2/);
    // El buscador: campo .search--sm de 32px con icono y placeholder.
    const q = drawer.locator('#trash-q');
    await expect(q).toBeVisible();
    await expect(q).toHaveAttribute('placeholder', 'Buscar en eliminados');
    await expect(drawer.locator('.trash__search .ico--search')).toBeVisible();
    expect((await drawer.locator('.trash__search').boundingBox()).height).toBe(32);
    await expect(drawer.locator('.trash__table tbody tr')).toHaveCount(2);
    // Filtra por nombre mientras se escribe (sin perder el foco del campo).
    await q.fill(victim.slice(0, 4).toLowerCase());
    await expect(drawer.locator('.trash__table tbody tr')).toHaveCount(1);
    await expect(drawer.locator('.trash__table tbody tr').first()).toContainText(victim);
    await expect(q).toBeFocused();
    // Filtra por correo y por propietario.
    const owner = (await drawer.locator('.trash__table tbody tr').first().locator('td').nth(2).locator('.owner__name').textContent()).trim();
    await q.fill(owner.toLowerCase());
    expect(await drawer.locator('.trash__table tbody tr').count()).toBeGreaterThanOrEqual(1);
    await q.fill('@');
    expect(await drawer.locator('.trash__table tbody tr').count()).toBeGreaterThanOrEqual(1);
    // Sin coincidencias: mensaje claro con lo que se buscó.
    await q.fill('zzzz-nadie');
    await expect(drawer.locator('.trash__table')).toHaveCount(0);
    await expect(drawer.locator('.trash__empty')).toHaveText('Ningún registro eliminado coincide con «zzzz-nadie».');
    // Restaurar desde el filtro: vuelve a la lista.
    await q.fill(victim.slice(0, 4).toLowerCase());
    await drawer.locator('.trash__table tbody tr', { hasText: victim }).locator('[data-trash-restore]').click();
    await expect(page.locator('.toast').last()).toContainText('Registro restaurado');
    await expect(drawer.locator('#actions-title')).toHaveText(/Restaurar registros eliminados · 1/);
    await expect(drawer.locator('.trash__table tbody tr', { hasText: victim })).toHaveCount(0);
    await drawer.locator('.drawer__foot [data-close="actions-drawer"]').click();
    await expect(drawer).not.toHaveClass(/is-open/);
    await expect.poll(async () => Number((await page.locator('#total-pill').textContent()).replace(/\D/g, ''))).toBe(total - 1);
    await expect(page.locator('#rows tr[data-id] .firstcell__content a', { hasText: victim })).toHaveCount(1);
    await expect(page.locator('#rows tr[data-id] .firstcell__content a', { hasText: other })).toHaveCount(0);
  });

  test('Contactos: Escape limpia el buscador y el panel se cierra con ✕ y con Cerrar', async ({ page }) => {
    await openList(page, '/contacts/');
    await deleteRows(page, [0, 1]);
    const drawer = await openTrash(page);
    const q = drawer.locator('#trash-q');
    await q.fill('zzzz-nadie');
    await expect(drawer.locator('.trash__empty')).toBeVisible();
    // Escape en el campo de búsqueda lo vacía (comportamiento nativo de type="search") y vuelven todas las filas.
    await q.press('Escape');
    await expect(q).toHaveValue('');
    await expect(drawer.locator('.trash__table tbody tr')).toHaveCount(2);
    // El panel modal se cierra con la ✕ de la cabecera y con «Cerrar» del pie (los cajones de Omni no se cierran con Escape).
    await drawer.locator('.drawer__head [data-close="actions-drawer"]').click();
    await expect(drawer).not.toHaveClass(/is-open/);
    await openTrash(page);
    await drawer.locator('.drawer__foot [data-close="actions-drawer"]').click();
    await expect(drawer).not.toHaveClass(/is-open/);
  });

  for (const [name, url] of [['Empresas', '/companies/'], ['Negocios', '/deals/'], ['Tickets', '/tickets/']]) {
    test(`${name}: el mismo buscador en la papelera, con filtro y sin resultados`, async ({ page }) => {
      await openList(page, url);
      const victim = (await page.locator('#rows tr[data-id] .firstcell__content a').first().textContent()).trim();
      // En demo puede haber varios registros con el mismo nombre: se compara el conteo antes y después.
      const sameName = page.locator('#rows tr[data-id] .firstcell__content a', { hasText: victim });
      const before = await sameName.count();
      await deleteRows(page, [0]);
      await expect(sameName).toHaveCount(before - 1);
      const drawer = await openTrash(page);
      const q = drawer.locator('#trash-q');
      await expect(q).toBeVisible();
      await expect(q).toHaveAttribute('placeholder', 'Buscar en eliminados');
      // La papelera de demo puede traer ya registros eliminados: al menos está el recién borrado.
      expect(await drawer.locator('.trash__table tbody tr').count()).toBeGreaterThanOrEqual(1);
      await q.fill(victim.slice(0, 5).toLowerCase());
      await expect(drawer.locator('.trash__table tbody tr', { hasText: victim }).first()).toBeVisible();
      await q.fill('zzzz-nadie');
      await expect(drawer.locator('.trash__empty')).toContainText('Ningún registro eliminado coincide con «zzzz-nadie»');
      await q.fill('');
      await drawer.locator('[data-trash-restore]').first().click();
      await expect(page.locator('.toast').last()).toContainText('Registro restaurado');
      await drawer.locator('.drawer__foot [data-close="actions-drawer"]').click();
      await expect(drawer).not.toHaveClass(/is-open/);
      await expect(sameName).toHaveCount(before);
    });
  }
});
