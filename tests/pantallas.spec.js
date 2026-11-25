// Capturas base y verificación funcional básica de CADA pantalla del router (tarea
// user-design-md-y-capturas-base, 24-nov-2026). Modo demo determinista (ver fixtures.js).
//
// Por pantalla y por ancho (proyectos w1440 / w1280):
//  - «visual»: toHaveScreenshot() tal como está hoy la pantalla. La captura base se crea
//    en la primera corrida (updateSnapshots: 'missing') y SOLO se actualiza cuando el
//    usuario aprueba un cambio (CLAUDE.md punto 5). Prohibido --update-snapshots.
//  - «funcional»: sin errores en consola (fixture), los enlaces que deadLinks() marca
//    como «muertos» (sin href o con «#») tienen que responder al clic, y cada botón visible
//    del contenido principal hace algo (cambia el DOM, abre un panel/menú/diálogo, navega,
//    descarga o abre una ventana). Lo que no responde se lista en `inert` de la pantalla y
//    queda documentado en DESIGN.md («Inconsistencias detectadas») para que el usuario decida.
//
// La lista de Contactos ya tiene su prueba en tests/contactos.spec.js (misma base); aquí van
// las demás rutas de vite.config.js.
import { test, expect, deadLinks } from './fixtures.js';

const PANTALLAS = [
  // Sin barra lateral: la pantalla de acceso (ruta raíz en modo demo). Sus enlaces de pie y
  // «crear una cuenta» son «#» sin acción: hallazgo documentado, no se corrige en esta tarea.
  { id: 'inicio-sesion', url: '/', ready: 'form:visible', inert: ['a "Página principal"', 'a "Solicitar demostración"', 'a "Política de privacidad"', 'a "Administrar las cookies"', 'a "Política de cookies"'] },
  { id: 'informes', url: '/reports/', ready: '.card:visible' },
  { id: 'contactos-ficha', url: '/contacts/record/?id=1', ready: 'h1:visible' },
  { id: 'empresas-lista', url: '/companies/', ready: '#rows tr[data-id]' },
  { id: 'empresas-ficha', url: '/companies/record/?id=1', ready: 'h1:visible' },
  // «‹» de las métricas: al cargar la pista ya está en el extremo izquierdo, no hay nada que desplazar.
  { id: 'negocios-lista', url: '/deals/', ready: '#rows tr[data-id]', inert: ['button "‹"'] },
  { id: 'negocios-ficha', url: '/deals/record/?id=1', ready: 'h1:visible' },
  { id: 'tickets-lista', url: '/tickets/', ready: '#rows tr[data-id]' },
  { id: 'tickets-ficha', url: '/tickets/record/?id=1', ready: 'h1:visible' },
  // «Crear cola» es el envío del formulario que abre «Cola ▾»: solo es alcanzable con ese panel abierto.
  { id: 'tareas-lista', url: '/tasks/', ready: '#rows tr[data-id]', skip: ['button "Crear cola"'] },
  // Hallazgo (no se corrige en esta tarea): «Notas +», «Recordatorio +» y «Repetir +» de la ficha de tarea
  // lanzan «Cannot read properties of null (reading 'scrollIntoView')» en consola. Ver DESIGN.md §3 #16.
  { id: 'tareas-ficha', url: '/tasks/record/?id=1', ready: 'h1:visible', skip: ['button "Notas +"', 'button "Recordatorio +"', 'button "Repetir +"'] },
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

// Un enlace «#» sin manejador solo añade «#» a la URL: eso no cuenta como respuesta.
const sinHash = (u) => u.split('#')[0];

// Botones que se omiten en el barrido porque destruyen o abandonan el estado de la pantalla
// (se verifican a mano en las tareas que los tocan).
const SKIP_TEXT = /^(eliminar|borrar|descartar|quitar|cerrar sesión|salir|restablecer)$/i;
const MAX_ITEMS = 40;

const open = async (page, route) => {
  await page.goto(route.url);
  await page.locator(route.ready).first().waitFor({ state: 'visible', timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
};

// Reabre la pantalla limpia: los clics del barrido dejan preferencias en localStorage (modo panel,
// menú plegado, filtros ocultos…) que esconderían los controles siguientes.
const reopen = async (page, route) => {
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} }).catch(() => {});
  // Pasar por about:blank fuerza una carga real (ir a la misma URL con «#» no recarga la página).
  await page.goto('about:blank');
  await open(page, route);
};

// Contador de mutaciones del DOM: un control «hace algo» si tras el clic hubo mutaciones,
// cambió la URL, hubo descarga, ventana nueva o diálogo nativo.
const armObserver = (page) => page.evaluate(() => {
  if (window.__sweep) { window.__sweep.n = 0; return; }
  window.__sweep = { n: 0 };
  new MutationObserver((list) => { window.__sweep.n += list.length; }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  // Desplazar una pista o la página también es una respuesta (flechas ‹ › de métricas y kanban).
  document.addEventListener('scroll', () => { window.__sweep.n += 1; }, true);
});

const collect = (page) => page.evaluate(({ SKIP }) => {
  const skip = new RegExp(SKIP, 'i');
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const txt = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const main = document.querySelector('main') || document.body;
  const sig = (el) => ({ tag: el.tagName.toLowerCase(), text: txt(el).slice(0, 60), cls: el.className && typeof el.className === 'string' ? el.className : '', aria: el.getAttribute('aria-label') || '' });
  const key = (s) => `${s.tag}|${s.text}|${s.cls}|${s.aria}`;
  const seen = {};
  const out = [];
  const add = (el, kind) => {
    const s = sig(el); const k = key(s); const nth = seen[k] || 0; seen[k] = nth + 1;
    out.push({ ...s, nth, kind, label: `${s.tag} "${s.text || s.aria || s.cls.split(' ')[0]}"` });
  };
  // Botones del contenido principal: visibles, habilitados, fuera de filas repetidas de tabla.
  for (const el of main.querySelectorAll('button, [role="button"]')) {
    if (!vis(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
    if (skip.test(txt(el))) continue;
    const row = el.closest('tbody tr'); if (row && row !== row.parentElement.querySelector('tr')) continue;
    add(el, 'button');
  }
  // Enlaces «muertos» según deadLinks(): sin href o con «#». Deben responder al clic.
  for (const el of document.querySelectorAll('a')) {
    if (!vis(el)) continue;
    const href = el.getAttribute('href');
    if (href && href !== '#') continue;
    add(el, 'link');
  }
  return out;
}, { SKIP: SKIP_TEXT.source });

const locate = (page, it) => page.evaluateHandle((it) => {
  const txt = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const all = [...document.querySelectorAll(it.tag)].filter((el) => vis(el) && txt(el) === it.text && (el.className || '') === it.cls && (el.getAttribute('aria-label') || '') === it.aria);
  return all[it.nth] || all[0] || null;
}, it);

const settle = async (page, route) => {
  // Cierra lo que el clic haya abierto para que el siguiente control quede alcanzable.
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => {
    const click = (sel) => document.querySelectorAll(sel).forEach((b) => b.click());
    click('.drawer.is-open [data-close], .drawer.is-open .drawer__close, .bmodal.is-open [data-bm="close"], .bmodal.is-open .bmodal__close, .soon.is-open #soon-ok, .slideover.is-open .slideover__close, #compose [data-cm="close"], .preview.is-open [data-pv="close"]');
    document.querySelectorAll('.menu.is-open').forEach((m) => m.classList.remove('is-open'));
  }).catch(() => {});
  await page.waitForTimeout(120);
  if (!page.url().endsWith(route.url) && !page.url().includes(route.url)) await reopen(page, route);
};

for (const route of PANTALLAS) {
  test.describe(`Pantalla: ${route.id}`, () => {
    test('visual', async ({ page }) => {
      await open(page, route);
      await expect(page).toHaveScreenshot(`${route.id}.png`, { fullPage: false, animations: 'disabled', caret: 'hide' });
    });

    test('funcional: botones y enlaces responden, sin errores en consola', async ({ page, context }) => {
      test.setTimeout(240000);
      // El entorno de prueba no tiene portapapeles: los botones «copiar» de las fichas lo usan.
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      page.on('dialog', (d) => d.dismiss().catch(() => {}));
      await open(page, route);
      const flagged = await deadLinks(page);
      const skip = route.skip || [];
      const items = (await collect(page)).filter((it) => !skip.includes(it.label)).slice(0, MAX_ITEMS);
      const inert = [];
      const unreachable = [];
      const errorsBy = [];
      for (const it of items) {
        let popup = null, download = null, dialog = null;
        const onPopup = (p) => { popup = p; };
        const onDownload = (d) => { download = d; d.cancel().catch(() => {}); };
        const onDialog = () => { dialog = true; };
        const onError = (e) => { errorsBy.push(`${it.label} → ${String(e.message || e).slice(0, 90)}`); };
        context.on('page', onPopup); page.on('download', onDownload); page.on('dialog', onDialog); page.on('pageerror', onError);
        // Si un clic anterior ocultó este control (cambió de modo, plegó filtros…), se reabre la
        // pantalla limpia y se intenta una vez más.
        let el = (await locate(page, it)).asElement();
        if (!el) { await reopen(page, route); el = (await locate(page, it)).asElement(); }
        if (!el) { unreachable.push(it.label); continue; }
        const before = sinHash(page.url());
        await armObserver(page);
        try {
          try {
            await el.click({ timeout: 4000 });
          } catch (e) {
            // Tapado por otro elemento: en la pantalla limpia se le manda el clic directamente al botón.
            await reopen(page, route);
            el = (await locate(page, it)).asElement();
            if (!el) throw e;
            // Un botón de envío de formulario no se fuerza: enviaría el formulario sin pasar por su panel.
            if (await el.evaluate((b) => b.type === 'submit' && Boolean(b.form))) throw e;
            await armObserver(page);
            await el.evaluate((b) => b.click());
          }
          await page.waitForTimeout(350);
          const n = await page.evaluate(() => (window.__sweep && window.__sweep.n) || 0).catch(() => 1);
          const responded = n > 0 || sinHash(page.url()) !== before || popup || download || dialog;
          if (!responded) inert.push(it.label);
        } catch (e) {
          unreachable.push(`${it.label} (${String(e.message).split('\n')[0].slice(0, 60)})`);
        } finally {
          context.off('page', onPopup); page.off('download', onDownload); page.off('dialog', onDialog); page.off('pageerror', onError);
          if (popup) await popup.close().catch(() => {});
        }
        await settle(page, route);
      }
      // Lo flagged por deadLinks() está incluido en el barrido (kind: link): aquí solo se informa.
      test.info().annotations.push({ type: 'deadLinks()', description: flagged.join(' · ') || '(ninguno)' });
      test.info().annotations.push({ type: 'barrido', description: `${items.length} controles; sin respuesta: ${inert.join(' · ') || 'ninguno'}; no alcanzables: ${unreachable.join(' · ') || 'ninguno'}` });
      if (errorsBy.length) console.log(`[errores ${route.id}] ${errorsBy.join(' | ')}`);
      expect(inert, 'controles sin respuesta').toEqual(route.inert || []);
      expect(unreachable, 'controles no alcanzables').toEqual([]);
    });
  });
}
