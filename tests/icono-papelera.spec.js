// Tarea user-icono-papelera (25-nov-2026): el icono de línea `trash` (ACT_ICONS, 1.8px, currentColor) sustituye
// al emoji 🗑 en los cuatro sitios que lo usaban y acompaña a «Restaurar registros eliminados» en el menú de
// acciones de las listas. Cada botón sigue haciendo lo mismo. Modo demo determinista; sin errores en consola.
import { test, expect } from './fixtures.js';

const TRASH_PATH = 'M3.5 6h17'; // primer trazo del icono `trash`
const iconInfo = (loc) => loc.evaluate((el) => {
  const svg = el.querySelector('svg');
  const r = svg ? svg.getBoundingClientRect() : null;
  return { emoji: el.textContent.includes('🗑'), hasTrash: Boolean(svg && svg.innerHTML.includes('M3.5 6h17')), w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0, opacity: svg ? getComputedStyle(svg).opacity : null, parentOpacity: svg ? getComputedStyle(svg.parentElement).opacity : null };
});

test.describe('Icono de papelera (trash) en lugar del emoji', () => {
  test('lista de contactos: «Eliminar» de la barra masiva y la entrada «Restaurar registros eliminados»', async ({ page }) => {
    await page.goto('/contacts/');
    await expect(page.locator('#rows tr[data-id]').first()).toBeVisible();
    await page.locator('#rows tr .row-check').nth(0).check();
    await page.locator('#rows tr .row-check').nth(1).check();
    const del = page.locator('#bulk [data-action="delete"]');
    await expect(del).toBeVisible();
    const info = await iconInfo(del);
    expect(info.emoji).toBe(false);
    expect(info.hasTrash).toBe(true);
    expect([info.w, info.h]).toEqual([16, 16]);
    expect(Number(info.parentOpacity)).toBeCloseTo(0.85, 2);
    // Sigue abriendo su confirmación.
    await del.click();
    const modal = page.locator('#bulk-modal.is-open');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Se eliminarán');
    await modal.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('#bulk-modal.is-open')).toHaveCount(0);
    // Menú Acciones: la entrada lleva el icono y abre la papelera.
    await page.locator('#actions-menu > button').click();
    const item = page.locator('#actions-menu .menu__item[data-action="trash"]');
    await expect(item).toBeVisible();
    const mi = await iconInfo(item);
    expect(mi.hasTrash).toBe(true);
    expect([mi.w, mi.h]).toEqual([16, 16]);
    await item.click();
    await expect(page.locator('#actions-drawer')).toHaveClass(/is-open/);
    await expect(page.locator('#actions-title')).toContainText('Restaurar registros eliminados');
    expect(await page.evaluate(() => document.body.innerText.includes('🗑'))).toBe(false);
  });

  test('lista de negocios (menú ⋮): la entrada de papelera también lleva el icono', async ({ page }) => {
    await page.goto('/deals/');
    await expect(page.locator('#rows tr[data-id]').first()).toBeVisible();
    await page.locator('.page-head__actions .menu:has(.menu__item[data-action="trash"]) > button').click();
    const item = page.locator('.page-head__actions .menu__item[data-action="trash"]');
    await expect(item).toBeVisible();
    expect((await iconInfo(item)).hasTrash).toBe(true);
    await item.click();
    await expect(page.locator('#actions-drawer')).toHaveClass(/is-open/);
  });

  test('Ajustes › etapas del ciclo de vida: «Eliminar etapa» con el icono y su confirmación', async ({ page }) => {
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
    await page.goto('/settings/#obj-contacts:lifecycle');
    await expect(page.locator('.ptable--lc').first()).toBeVisible();
    const buttons = page.locator('.lctrash');
    expect(await buttons.count()).toBeGreaterThan(0);
    for (let i = 0; i < await buttons.count(); i++) {
      const info = await iconInfo(buttons.nth(i));
      expect(info.emoji, `etapa ${i}`).toBe(false);
      expect(info.hasTrash, `etapa ${i}`).toBe(true);
      expect([info.w, info.h], `etapa ${i}`).toEqual([16, 16]);
    }
    // Una etapa borrable pide confirmación (las que tienen registros o las dos últimas vienen deshabilitadas).
    const enabled = page.locator('.lctrash:not([disabled])');
    if (await enabled.count()) {
      await enabled.first().click();
      await expect.poll(() => dialogs.length).toBe(1);
      expect(dialogs[0]).toMatch(/¿Eliminar la etapa/);
    }
    expect(await page.evaluate(() => document.body.innerText.includes('🗑'))).toBe(false);
  });

  test('Ajustes › editor de lógica: «Eliminar grupo» con el icono y quita el grupo', async ({ page }) => {
    await page.goto('/settings/#obj-contacts:lifecycle');
    await expect(page.locator('.ptable--lc').first()).toBeVisible();
    // El botón «Agregar regla» de la fila solo se ve al pasar el ratón: se le manda el clic directamente.
    await page.locator('[data-logic-edit][data-logic-lifecycle]').first().evaluate((b) => b.click());
    await expect(page.locator('.logic')).toBeVisible();
    await page.locator('[data-logic-group-add]').click();
    await expect(page.locator('.lgroup')).toHaveCount(2);
    const rm = page.locator('[data-logic-group-rm]');
    await expect(rm).toHaveCount(2);
    const info = await iconInfo(rm.first());
    expect(info.emoji).toBe(false);
    expect(info.hasTrash).toBe(true);
    expect([info.w, info.h]).toEqual([16, 16]);
    await rm.first().click();
    await expect(page.locator('.lgroup')).toHaveCount(1);
    expect(await page.evaluate(() => document.body.innerText.includes('🗑'))).toBe(false);
  });

  test('editor de workflow: «Quitar grupo» con el icono (13px) y quita el grupo', async ({ page }) => {
    await page.goto('/automation/editor/?id=d9000000-0000-4000-8000-000000000003');
    await page.locator('[data-node="trigger"]').click();
    const groups = page.locator('#wfe-panel .wfg');
    await expect(groups.first()).toBeVisible();
    const n = await groups.count();
    const del = page.locator('#wfe-panel [data-grp-del]').first();
    const info = await iconInfo(del);
    expect(info.emoji).toBe(false);
    expect(info.hasTrash).toBe(true);
    expect([info.w, info.h]).toEqual([13, 13]);
    await del.click();
    await expect(groups).toHaveCount(n - 1);
    expect(await page.evaluate(() => document.body.innerText.includes('🗑'))).toBe(false);
  });
});
