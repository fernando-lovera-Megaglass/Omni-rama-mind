// Shared side navigation and top bar for the app pages.
// `root` is the relative path back to the site root ('../' or '../../').

import { authEnabled, currentUser, signOut, onAuthChange, siteRoot, goTo, userLabel, userInitial } from './auth.js';
import { notifications, unreadCount, markAllRead } from './notifications.js';
import { displayPhone, phoneHref } from './phone.js';
import { getTheme, setTheme, resolvedTheme } from './theme.js';
import { sectionStatus, ready as roadmapReady } from './roadmap.js';

// The bell: real notifications (workflows, sequences…) with the unread count.
const escN = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); if (m < 1) return 'ahora'; if (m < 60) return `hace ${m} min`; const h = Math.round(m / 60); if (h < 24) return `hace ${h} h`; return `hace ${Math.round(h / 24)} d`; };
function notifPanelHtml(root) {
  const list = notifications().slice(0, 12);
  return `<div class="menu__title">Notificaciones <span class="muted">${unreadCount() ? `· ${unreadCount()} sin leer` : ''}</span></div>${list.length ? list.map((n) => `<a class="menu__note notif${n.read ? '' : ' notif--unread'}" href="${root}${escN(n.href || '')}"><strong>${escN(n.title)}</strong>${n.text ? `<span class="notif__text">${escN(n.text)}</span>` : ''}<span class="notif__when">${ago(n.when)}</span></a>`).join('') : '<div class="menu__note muted">No tienes notificaciones.</div>'}<div class="menu__sep"></div><button class="menu__item" type="button" data-notif="read-all">Marcar todas como leídas</button>`;
}
export function refreshBell(root = '') {
  const btn = document.getElementById('notif-btn');
  const panel = document.getElementById('notif-panel');
  if (!btn || !panel) return;
  const n = unreadCount();
  const count = btn.querySelector('.count');
  if (count) { count.textContent = String(n); count.hidden = n === 0; }
  panel.innerHTML = notifPanelHtml(root || btn.dataset.root || '');
}

// Main navigation: [icon, label, landing page, flyout entries]. Entries with '#'
// are sections of the real product that this version does not include yet.
const NAV = [
  ['workspaces', 'Espacios', 'reports/', [
    ['Inicio', 'reports/'],
    ['Ventas', 'deals/'],
    ['Servicio de asistencia', 'tickets/'],
    ['Prospección', 'contacts/'],
  ]],
  ['crm', 'CRM', 'contacts/', [
    ['Contactos', 'contacts/'],
    ['Empresas', 'companies/'],
    ['Negocios', 'deals/'],
    ['Tickets', 'tickets/'],
    ['Segmentos', 'segments/'],
    ['Bandeja de entrada', 'inbox/', '<span class="sidenav__badge" data-nav-badge="inbox" hidden></span>'],
    ['Llamadas', '#'],
    ['Tareas', 'tasks/'],
    ['Plantillas de mensaje', 'templates/'],
    ['Fragmentos', 'snippets/'],
  ]],
  ['marketing', 'Marketing', 'marketing/email/', [
    ['Campañas', '#'],
    ['Correo', 'marketing/email/'],
    ['Redes sociales', '#'],
    ['Anuncios', '#'],
    ['Formularios', '#'],
    ['CTA', '#'],
  ]],
  ['content', 'Contenido', '#', [
    ['Páginas web', '#'],
    ['Landing pages', '#'],
    ['Blog', '#'],
    ['Base de conocimientos', '#'],
    ['Diseño', '#'],
  ]],
  ['commerce', 'Comercio', '#', [
    ['Pagos', '#'],
    ['Facturas', '#'],
    ['Cotizaciones', '#'],
    ['Productos', '#'],
    ['Suscripciones', '#'],
  ]],
  ['sales', 'Ventas', 'deals/', [
    ['Negocios', 'deals/'],
    ['Tareas', 'tasks/'],
    ['Pronóstico', '#'],
    ['Programador de reuniones', '#'],
    ['Plantillas', 'templates/'],
    ['Secuencias', 'sequences/'],
  ]],
  ['service', 'Servicio', 'tickets/', [
    ['Tickets', 'tickets/'],
    ['Encuestas de feedback', '#'],
    ['Portal del cliente', '#'],
    ['Base de conocimientos', '#'],
  ]],
  ['automation', 'Automatizaciones', 'automation/', [
    ['Workflows', 'automation/'],
    ['Secuencias', 'sequences/'],
    ['Chatflows', '#'],
  ]],
  ['reports', 'Informes', 'reports/', [
    ['Paneles', 'reports/'],
    ['Informes', 'reports/'],
    ['Objetivos', '#'],
    ['Análisis de marketing', '#'],
  ]],
  ['data', 'Gestión de datos', 'data/', [
    ['Agente de datos', '#'],
    ['Integración de datos', 'data/'],
    ['Gestión de eventos', '#'],
    ['Calidad de los datos', '#', '<span class="sidenav__info" title="Monitoriza la calidad de tus datos">ⓘ</span>'],
    ['Data Studio', '#', '<span class="tag tag--beta">Beta</span>'],
    ['Modelo de datos', '#'],
    ['Enriquecimiento de datos', '#'],
  ]],
  ['library', 'Biblioteca', 'templates/', [
    ['Plantillas', 'templates/'],
    ['Documentos', '#'],
    ['Fragmentos', 'snippets/'],
    ['Archivos', '#'],
  ]],
];

const NAV_BOTTOM = [
  ['copilot', 'Copilot', '#'],
  ['marketplace', 'Marketplace', '#'],
];

// Counter badges on the side navigation (e.g. unread conversations on "Bandeja de entrada" and the CRM icon).
export function setNavBadge(key, n) {
  document.querySelectorAll(`[data-nav-badge="${key}"]`).forEach((b) => {
    b.textContent = n > 99 ? '99+' : String(n || '');
    b.hidden = !n;
    b.setAttribute('aria-label', n ? `${n} sin leer` : '');
  });
}
export function mountShell({ root, active, sub }) {
  const sidenav = document.getElementById('sidenav');
  const topbar = document.getElementById('topbar');
  if (!sidenav || !topbar) return;
  // Pages' relative root, for modules (the e-mail composer) that link to other pages.
  document.body.dataset.root = root || '';

  const item = ([key, label, href, children]) => `
    <div class="sidenav__group${key === active ? ' is-active' : ''}">
      <a class="sidenav__item${key === active ? ' is-active' : ''}" href="${href === '#' ? '#' : root + href}" ${href === '#' ? 'data-soon="1"' : ''}>
        <span class="ico ico--${key}"></span><span class="sidenav__label">${label}</span>${key === 'crm' ? '<span class="sidenav__railbadge" data-nav-badge="inbox" hidden></span>' : ''}
      </a>
      ${
        children
          ? `<div class="sidenav__fly">
              <div class="sidenav__fly-title">${label}</div>
              ${children
                .map(
                  ([l, h, extra]) => `<a class="sidenav__sub${sub === l && key === active ? ' is-active' : ''}" href="${h === '#' ? '#' : root + h}" ${h === '#' ? 'data-soon="1"' : ''}><span class="sidenav__sublabel">${l}${extra || ''}</span><span class="sidenav__pin" aria-hidden="true">⊕</span></a>`,
                )
                .join('')}
            </div>`
          : ''
      }
    </div>`;

  // The side navigation can be widened to show the labels; the choice is remembered.
  const NAV_WIDE_KEY = 'crm:nav:expanded';
  const navWide = () => localStorage.getItem(NAV_WIDE_KEY) === '1';
  const applyNavWidth = () => {
    const wide = navWide();
    document.body.classList.toggle('app--navwide', wide);
    const btn = sidenav.querySelector('#nav-collapse');
    if (!btn) return;
    btn.setAttribute('aria-expanded', String(wide));
    btn.setAttribute('aria-label', wide ? 'Contraer navegación' : 'Expandir navegación');
    btn.querySelector('.tip__text').textContent = wide ? 'Contraer navegación' : 'Expandir navegación';
    btn.querySelector('.sidenav__collapse-ico').textContent = wide ? '‹' : '›';
  };
  sidenav.innerHTML = `
    <a class="sidenav__logo" href="${root}" aria-label="Omni · Inicio" title="Omni">
      <span class="sidenav__mark" aria-hidden="true"></span><span class="sidenav__brand" aria-hidden="true">Omni</span>
    </a>
    <nav class="sidenav__list" aria-label="Principal">
      <a class="sidenav__item sidenav__item--bookmark" href="#" data-soon="1" title="Marcadores"><span class="ico ico--bookmark"></span><span class="sidenav__label">Marcadores</span></a>
      <span class="sidenav__divider" aria-hidden="true"></span>
      ${NAV.map(item).join('')}
    </nav>
    <nav class="sidenav__list sidenav__list--bottom" aria-label="Más">
      ${NAV_BOTTOM.map(item).join('')}
      <button class="sidenav__collapse tip" id="nav-collapse" type="button" aria-expanded="false" aria-label="Expandir navegación"><span class="sidenav__collapse-ico" aria-hidden="true">›</span><span class="tip__text">Expandir navegación</span></button>
    </nav>`;
  applyNavWidth();

  sidenav.addEventListener('click', (e) => {
    const col = e.target.closest('#nav-collapse');
    if (col) {
      localStorage.setItem(NAV_WIDE_KEY, navWide() ? '0' : '1');
      applyNavWidth();
      return;
    }
    const soon = e.target.closest('[data-soon]');
    if (!soon) return;
    e.preventDefault();
    openSoon(root, soon.textContent.replace('⊕', '').trim());
  });

  topbar.innerHTML = `
    <button class="topbar__menu" id="menu-toggle" type="button" aria-label="Abrir menú">
      <span></span><span></span><span></span>
    </button>
    <div class="topbar__search menu" id="global-search">
      <input type="search" placeholder="Buscar en Omni" aria-label="Buscar en Omni" autocomplete="off" />
      <span class="ico ico--search" aria-hidden="true"></span>
      <div class="menu__panel menu__panel--search" id="global-results"></div>
    </div>
    <button class="topbar__assistant" type="button"><span class="ai-spark">✦</span> Asistente de Omni</button>
    <div class="topbar__right">
      <button class="topbar__icon" type="button" aria-label="Mejorar" data-soon="Mejorar"><span class="ico ico--rocket"></span></button>
      <div class="menu">
        <button class="topbar__icon" type="button" aria-label="Crear" aria-haspopup="true"><span class="ico ico--plus"></span></button>
        <div class="menu__panel menu__panel--right">
          <a class="menu__item" href="${root}contacts/">Crear contacto</a>
          <a class="menu__item" href="${root}companies/">Crear empresa</a>
          <a class="menu__item" href="${root}deals/">Crear negocio</a>
          <a class="menu__item" href="${root}tickets/">Crear ticket</a>
          <a class="menu__item" href="${root}tasks/">Crear tarea</a>
        </div>
      </div>
      <button class="topbar__icon" type="button" aria-label="Llamadas" data-soon="Llamadas"><span class="ico ico--phone"></span></button>
      <button class="topbar__icon" type="button" aria-label="Marketplace" data-soon="Marketplace"><span class="ico ico--marketplace"></span></button>
      <div class="menu">
        <button class="topbar__icon" type="button" id="notif-btn" data-root="${root}" aria-label="Notificaciones" aria-haspopup="true"><span class="ico ico--bell"></span><span class="count" ${unreadCount() ? '' : 'hidden'}>${unreadCount()}</span></button>
        <div class="menu__panel menu__panel--right menu__panel--wide" id="notif-panel">${notifPanelHtml(root)}</div>
      </div>
      <div class="menu">
        <button class="topbar__icon" type="button" aria-label="Ayuda" aria-haspopup="true"><span class="ico ico--help"></span></button>
        <div class="menu__panel menu__panel--right">
          <a class="menu__item" href="#" data-soon="Base de conocimientos">Base de conocimientos</a>
          <a class="menu__item" href="#" data-soon="Comunidad">Comunidad</a>
          <a class="menu__item" href="#" data-soon="Contactar con soporte">Contactar con soporte</a>
        </div>
      </div>
      <button class="topbar__icon tip" type="button" id="theme-toggle" aria-label="Cambiar tema"><span class="ico ${resolvedTheme() === 'dark' ? 'ico--sun' : 'ico--moon'}"></span><span class="tip__text">${resolvedTheme() === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}</span></button>
      <a class="topbar__icon tip" href="${root}settings/" aria-label="Configuración"><span class="ico ico--gear"></span><span class="tip__text">Configuración</span></a>
      <span class="topbar__divider" aria-hidden="true"></span>
      <div class="menu" id="account-menu">
        <button class="topbar__account" type="button" aria-haspopup="true" aria-expanded="false">
          <span class="avatar avatar--sm avatar--soft" id="account-avatar">M</span>
          <span class="topbar__account-text" id="account-name">Megaglass</span>
          <span class="caret"></span>
        </button>
        <div class="menu__panel menu__panel--right">
          <span class="menu__item menu__item--static" id="account-email" hidden></span>
          <a class="menu__item" href="${root}settings/#prefs-general">Perfil y preferencias</a>
          <a class="menu__item" href="${root}settings/">Configuración de la cuenta</a>
          <button class="menu__item" type="button" id="signout">Cerrar sesión</button>
        </div>
      </div>
    </div>`;

  const toggle = document.getElementById('menu-toggle');
  const scrim = document.getElementById('scrim');
  toggle.addEventListener('click', () => sidenav.classList.toggle('is-open'));
  if (scrim) scrim.addEventListener('click', () => sidenav.classList.remove('is-open'));

  wireMenus();
  // The topbar "soon" entries (Mejorar, Llamadas, Marketplace, help links) open the same
  // "en construcción" dialog as the side navigation.
  topbar.addEventListener('click', (e) => {
    const soon = e.target.closest('[data-soon]');
    if (!soon) return;
    e.preventDefault();
    e.stopPropagation();
    closeMenus();
    openSoon(root, soon.dataset.soon || soon.textContent.trim());
  });
  // The moon/sun button toggles light ↔ dark (the "Según el sistema" choice becomes explicit on click).
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', () => {
    setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark');
    const dark = resolvedTheme() === 'dark';
    themeBtn.querySelector('.ico').className = `ico ${dark ? 'ico--sun' : 'ico--moon'}`;
    const tip = themeBtn.querySelector('.tip__text');
    if (tip) tip.textContent = dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
    themeBtn.setAttribute('aria-label', tip ? tip.textContent : 'Cambiar tema');
  });
  // The bell re-renders when a module pushes a notification; "Marcar todas como leídas" clears the count.
  const bellPanel = document.getElementById('notif-panel');
  if (bellPanel && !bellPanel.dataset.wired) {
    bellPanel.dataset.wired = '1';
    bellPanel.addEventListener('click', (e) => { if (e.target.closest('[data-notif="read-all"]')) { e.stopPropagation(); markAllRead(); refreshBell(root); } });
    document.addEventListener('crm:notifications', () => refreshBell(root));
  }
  wireGlobalSearch(root);
  wireAccount(root);
}

// "En construcción" dialog for the sections this version does not include yet (nav entries with '#'),
// with the isometric illustration in public/en-construccion.png.
function openSoon(root, name) {
  let dlg = document.getElementById('soon');
  if (!dlg) {
    dlg = document.createElement('div');
    dlg.className = 'soon';
    dlg.id = 'soon';
    dlg.innerHTML = `<div class="soon__card" role="dialog" aria-modal="true" aria-labelledby="soon-title">
      <img class="soon__img" src="${root}en-construccion.png" alt="Ilustración: página en construcción" />
      <h2 class="soon__title" id="soon-title">Esta página aún está en construcción</h2>
      <p class="soon__text"><strong id="soon-name"></strong> todavía no está incluido en esta versión de Omni. Estamos trabajando para traerlo pronto.</p>
      <p class="soon__queue" id="soon-queue" hidden></p>
      <button class="btn btn--primary" type="button" id="soon-ok">Entendido</button>
    </div>`;
    document.body.appendChild(dlg);
    const close = () => { dlg.classList.remove('is-open'); };
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('#soon-ok')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dlg.classList.contains('is-open')) close(); });
  }
  dlg.querySelector('#soon-name').textContent = `«${name}»`;
  const q = dlg.querySelector('#soon-queue');
  const paintQueue = () => {
    const st = sectionStatus(name);
    if (!st) { q.hidden = true; return; }
    q.hidden = false;
    q.textContent = st.status === 'building'
      ? '🔨 Se está construyendo ahora mismo — es la prioridad de la lista.'
      : `Va en el lugar ${st.position} de ${st.total} pendientes en la lista de construcción.`;
  };
  paintQueue();
  roadmapReady.then(paintQueue).catch(() => {});
  dlg.classList.add('is-open');
}

// Signed-in user in the account menu and the "Cerrar sesión" button (Supabase Auth). Without Supabase the
// menu keeps the account name and the button just goes back to the start page.
function wireAccount(root) {
  const btn = document.getElementById('signout');
  if (!btn) return;
  const leave = async () => {
    btn.disabled = true;
    await signOut();
    goTo(authEnabled() ? siteRoot() : root);
  };
  btn.addEventListener('click', (e) => { e.preventDefault(); closeMenus(); leave(); });
  if (!authEnabled()) return;
  currentUser().then((user) => {
    if (!user) return;
    document.getElementById('account-avatar').textContent = userInitial(user);
    document.getElementById('account-name').textContent = userLabel(user);
    const mail = document.getElementById('account-email');
    mail.textContent = user.email || '';
    mail.hidden = !user.email;
  });
  // Signed out from another tab (or the session expired): back to the login page.
  onAuthChange((event) => { if (event === 'SIGNED_OUT') goTo(siteRoot()); });
}

function wireGlobalSearch(root) {
  const box = document.getElementById('global-search');
  const input = box.querySelector('input');
  const results = document.getElementById('global-results');
  let dataMod = null;
  input.addEventListener('input', async () => {
    const q = input.value.trim();
    if (q.length < 2) {
      box.classList.remove('is-open');
      return;
    }
    dataMod = dataMod || (await import('./data.js'));
    const { allContacts, allCompanies, allDeals, allTickets, strip } = dataMod;
    const s = strip(q);
    const hits = [
      ...allContacts().filter((r) => strip(`${r.name} ${r.email}`).includes(s)).slice(0, 4).map((r) => ['Contacto', r.name, `${root}contacts/record/?id=${r.id}`]),
      ...allCompanies().filter((r) => strip(r.name).includes(s)).slice(0, 3).map((r) => ['Empresa', r.name, `${root}companies/record/?id=${r.id}`]),
      ...allDeals().filter((r) => strip(r.name).includes(s)).slice(0, 3).map((r) => ['Negocio', r.name, `${root}deals/record/?id=${r.id}`]),
      ...allTickets().filter((r) => strip(r.name).includes(s)).slice(0, 3).map((r) => ['Ticket', r.name, `${root}tickets/record/?id=${r.id}`]),
    ];
    results.innerHTML = hits.length
      ? hits.map(([t, n, h]) => `<a class="menu__item" href="${h}"><span class="muted">${t} · </span>${n}</a>`).join('')
      : '<div class="menu__note">Sin resultados</div>';
    box.classList.add('is-open');
  });
  input.addEventListener('click', (e) => e.stopPropagation());
}

// Generic dropdown menus: .menu > button + .menu__panel
export function wireMenus(scope = document) {
  scope.querySelectorAll('.menu').forEach((menu) => {
    if (menu.dataset.wired) return;
    menu.dataset.wired = '1';
    const btn = menu.querySelector(':scope > button');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menu.classList.contains('is-open');
      closeMenus();
      if (!open) {
        menu.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });
  if (!document.body.dataset.menusWired) {
    document.body.dataset.menusWired = '1';
    document.addEventListener('click', closeMenus);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenus();
    });
  }
}

export function closeMenus() {
  document.querySelectorAll('.menu.is-open').forEach((m) => {
    m.classList.remove('is-open');
    const btn = m.querySelector(':scope > button');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
}

// Link-type values (URL, e-mail, phone) as they appear in tables and cards: a teal link that opens the
// address, with the external-link icon for web addresses and e-mails, as in the original.
const escText = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
export function linkHref(kind, value) {
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (kind === 'email') return `mailto:${v}`;
  if (kind === 'phone') return `tel:${v.replace(/[^\d+]/g, '')}`;
  return /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
}
export function linkHtml(kind, value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '<span class="muted">—</span>';
  // Phones read the same everywhere: international prefix + grouped digits (src/phone.js).
  const v = kind === 'phone' ? displayPhone(raw) : raw;
  const href = kind === 'phone' ? phoneHref(raw) : linkHref(kind, v);
  const external = kind !== 'phone';
  return `<a class="cell-link${external ? '' : ' cell-link--plain'}" href="${escText(href)}" ${external ? 'target="_blank" rel="noopener"' : ''} data-full="${escText(kind === 'phone' ? v : href)}"><span class="cell-link__text">${escText(v)}</span>${external ? '<span class="ico ico--ext" aria-hidden="true"></span>' : ''}</a>`;
}
// One dark tooltip with the full address, shown above whichever link the pointer is over.
export function wireLinkTooltips() {
  if (document.body.dataset.linkTips) return;
  document.body.dataset.linkTips = '1';
  const tip = document.createElement('div');
  tip.className = 'linktip';
  tip.hidden = true;
  document.body.appendChild(tip);
  document.addEventListener('mouseover', (e) => {
    const a = e.target.closest && e.target.closest('a.cell-link[data-full]');
    if (!a) return;
    tip.textContent = a.dataset.full;
    tip.hidden = false;
    const r = a.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(r.left + r.width / 2, window.innerWidth - 8))}px`;
    tip.style.top = `${r.top - 8}px`;
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest && e.target.closest('a.cell-link[data-full]')) tip.hidden = true;
  });
}

export function toast(text) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('is-visible');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('is-visible'), 2500);
}
