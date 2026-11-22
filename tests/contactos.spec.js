// Pantalla: Contactos (lista). Primera del orden de aprobación (PANTALLAS.md).
//
// Visual: toHaveScreenshot a 1440px y 1280px (proyectos w1440/w1280). La
// captura base solo se crea cuando el usuario aprueba la pantalla (punto 10).
// Funcional: los controles principales responden y no hay errores en consola
// (lo último lo garantiza el fixture de tests/fixtures.js).
import { test, expect, deadLinks } from './fixtures.js';

const URL = '/contacts/';

test.describe('Contactos — lista', () => {
  test('visual', async ({ page }) => {
    await page.goto(URL);
    await expect(page.locator('.table, table').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('contactos-lista.png', {
      fullPage: false,
      animations: 'disabled',
    });
  });

  test('funcional: buscar y abrir un contacto', async ({ page }) => {
    await page.goto(URL);
    await expect(page.locator('.table, table').first()).toBeVisible();

    // Buscar reduce o mantiene el listado sin romper la página.
    const search = page.locator('.search input, input[type="search"], input[placeholder*="uscar"]').first();
    if (await search.count()) {
      await search.fill('a');
      await page.waitForTimeout(300);
    }

    // El nombre del primer contacto enlaza a su ficha.
    const firstName = page.locator('.table tbody tr a[href*="record"], table tbody tr a[href*="record"]').first();
    await expect(firstName).toBeVisible();
    await firstName.click();
    await expect(page).toHaveURL(/contacts\/record\/\?id=\d+/, { timeout: 10000 });

    // Ningún enlace visible es un enlace muerto.
    expect(await deadLinks(page)).toEqual([]);
  });
});
