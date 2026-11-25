// Tarea user-tipos-de-campo-completos (25-nov-2026).
// Parte A: Ajustes › Propiedades › Crear propiedad ofrece 18 tipos de campo, cada uno con icono; una propiedad de
// cada tipo nuevo se crea, se guarda y se ve en la ficha con su control (fecha y hora, número con %, selector de
// propietario, número, adjunto) o como solo lectura «Se calcula automáticamente» (cálculo, acumulación, sincronización).
// Parte B: en las listas de Contactos, Empresas, Negocios y Tickets el icono de vista previa aparece al pasar el
// ratón por la fila, con el tooltip «Vista previa», y abre el panel de vista previa.
// Modo demo determinista (tests/fixtures.js); sin errores en consola (fixture).
import { test, expect } from './fixtures.js';

const ALL_KINDS = ['text', 'textarea', 'number', 'currency', 'percent', 'score', 'date', 'datetime', 'enum', 'bool', 'user', 'phone', 'email', 'url', 'file', 'calculation', 'rollup', 'sync'];
const NEW_KINDS = [
  ['datetime', 'Selector de fecha y hora', 'Prueba fecha y hora'],
  ['percent', 'Porcentaje', 'Prueba porcentaje'],
  ['user', 'Usuario', 'Prueba usuario'],
  ['score', 'Puntuación', 'Prueba puntuación'],
  ['file', 'Archivo', 'Prueba archivo'],
  ['calculation', 'Cálculo', 'Prueba cálculo'],
  ['rollup', 'Acumulación', 'Prueba acumulación'],
  ['sync', 'Sincronización de propiedades', 'Prueba sincronización'],
];

const openProperties = async (page) => {
  await page.goto('/settings/#data-properties');
  await expect(page.locator('[data-act="new-prop"]').first()).toBeVisible();
};
const openCreateProperty = async (page) => {
  await page.locator('[data-act="new-prop"]').first().click();
  await expect(page.locator('#prop-form')).toBeVisible();
  await expect(page.locator('.ksel__btn')).toBeVisible();
};
const createProperty = async (page, kind, label) => {
  await openCreateProperty(page);
  await page.locator('#prop-form [name="label"]').fill(label);
  await page.locator('.ksel__btn').click();
  await page.locator(`.ksel__item[data-value="${kind}"]`).click();
  await expect(page.locator('#prop-kind')).toHaveValue(kind);
  await page.locator('#prop-save').click();
  await expect(page.locator('#prop-form')).toHaveCount(0);
  // La tabla está paginada: se busca la propiedad recién creada por su nombre.
  await page.locator('#props-q').fill(label);
  await expect(page.locator('.proptable')).toContainText(label);
  await page.locator('#props-q').fill('');
};

test.describe('Tipos de campo (Ajustes › Propiedades)', () => {
  test('el selector muestra los 18 tipos, cada uno con su icono', async ({ page }) => {
    await openProperties(page);
    await openCreateProperty(page);
    await page.locator('.ksel__btn').click();
    const items = page.locator('.ksel__item');
    await expect(items).toHaveCount(18);
    expect(await items.evaluateAll((els) => els.map((e) => e.dataset.value))).toEqual(ALL_KINDS);
    for (const kind of ALL_KINDS) {
      const ico = page.locator(`.ksel__item[data-value="${kind}"] .ksel__ico svg`);
      await expect(ico, kind).toBeVisible();
      const box = await ico.boundingBox();
      expect(box.width, kind).toBeGreaterThanOrEqual(16);
    }
    for (const [kind, label] of NEW_KINDS) await expect(page.locator(`.ksel__item[data-value="${kind}"]`)).toContainText(label);
    // El tipo elegido se muestra con su icono en el botón del selector.
    await page.locator('.ksel__item[data-value="file"]').click();
    await expect(page.locator('.ksel__btn .ksel__ico svg')).toBeVisible();
    await expect(page.locator('.ksel__btn')).toContainText('Archivo');
  });

  test('una propiedad de cada tipo nuevo se crea, se guarda y se ve en la ficha con su control', async ({ page }) => {
    test.setTimeout(180000);
    await openProperties(page);
    for (const [kind, , label] of NEW_KINDS) await createProperty(page, kind, label);

    await page.goto('/contacts/record/?id=1');
    await expect(page.locator('h1:visible').first()).toBeVisible();
    await page.locator('[data-act="all-props-panel"]').click();
    const panel = page.locator('#allprops-panel');
    await expect(panel).toHaveClass(/is-open/);
    const rowOf = (label) => panel.locator('.props__row', { has: page.locator(`dt:text-is("${label}")`) });
    const edit = async (label) => { const row = rowOf(label); await row.locator('[data-edit-key]').click(); return row; };

    // Fecha y hora: selector fecha+hora, se guarda y se muestra con la hora.
    let row = await edit('Prueba fecha y hora');
    await expect(row.locator('input[type="datetime-local"][data-edit]')).toBeVisible();
    await row.locator('input[type="datetime-local"]').fill('2026-11-25T10:30');
    await row.locator('button[type="submit"]').click();
    await expect(rowOf('Prueba fecha y hora')).toContainText('2026');
    await expect(rowOf('Prueba fecha y hora')).toContainText('10:30');

    // Porcentaje: número, se muestra con «%».
    row = await edit('Prueba porcentaje');
    await expect(row.locator('input[type="number"][data-edit]')).toBeVisible();
    await row.locator('input[type="number"]').fill('50');
    await row.locator('button[type="submit"]').click();
    await expect(rowOf('Prueba porcentaje')).toContainText('50 %');

    // Puntuación: número.
    row = await edit('Prueba puntuación');
    await expect(row.locator('input[type="number"][data-edit]')).toBeVisible();
    await row.locator('input[type="number"]').fill('7');
    await row.locator('button[type="submit"]').click();
    await expect(rowOf('Prueba puntuación')).toContainText('7');

    // Usuario: selector de propietario (con el desplegable de avatares de owner-select.js).
    row = await edit('Prueba usuario');
    await expect(row.locator('select[data-owner-select][data-edit]')).toHaveCount(1);
    await expect(row.locator('.osel__btn')).toBeVisible();
    await row.locator('select[data-owner-select]').selectOption({ label: 'Sofía R.' }, { force: true });
    await row.locator('button[type="submit"]').click();
    await expect(rowOf('Prueba usuario')).toContainText('Sofía R.');

    // Archivo: control de adjunto; en modo demo no hay almacenamiento y lo dice sin romper nada.
    row = await edit('Prueba archivo');
    const file = row.locator('input[type="file"][data-edit]');
    await expect(file).toBeVisible();
    await file.setInputFiles({ name: 'prueba.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') });
    await expect(page.locator('.toast').last()).toContainText(/Inicia sesión para subir archivos|migración/);
    await expect(rowOf('Prueba archivo')).toContainText('--');

    // Cálculo, acumulación y sincronización: solo lectura con texto explicativo, sin control.
    for (const label of ['Prueba cálculo', 'Prueba acumulación', 'Prueba sincronización']) {
      await expect(rowOf(label)).toContainText('Se calcula automáticamente');
      await expect(rowOf(label).locator('[data-edit-key]')).toHaveCount(0);
    }
  });
});

test.describe('Icono «Vista previa» en las filas de lista', () => {
  for (const [name, url] of [['Contactos', '/contacts/'], ['Empresas', '/companies/'], ['Negocios', '/deals/'], ['Tickets', '/tickets/']]) {
    test(`${name}: aparece al pasar el ratón, dice «Vista previa» y abre el panel`, async ({ page }) => {
      await page.goto(url);
      const row = page.locator('#rows tr[data-id]').first();
      await expect(row).toBeVisible();
      const btn = row.locator('.preview-btn');
      await expect(btn).toHaveCSS('opacity', '0');
      await row.hover();
      await expect(btn).toHaveCSS('opacity', '1');
      await expect(btn.locator('svg')).toBeVisible();
      await btn.hover();
      const tip = btn.locator('.tip__text');
      await expect(tip).toBeVisible();
      await expect(tip).toHaveText('Vista previa');
      // El tooltip se ve entero: su caja está dentro de la ventana y no la recorta la fila.
      const box = await tip.boundingBox();
      const viewport = page.viewportSize();
      expect(box.y).toBeGreaterThan(0);
      expect(box.y + box.height).toBeLessThan(viewport.height);
      expect(await tip.evaluate((el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return hit === el || el.contains(hit); })).toBe(true);
      await btn.click();
      await expect(page.locator('#preview.is-open')).toBeVisible();
      await expect(page.locator('#pv-name')).not.toBeEmpty();
    });
  }
});
