import { mountShell, wireMenus, closeMenus, toast } from './shell.js';
import { allContacts, STATUSES, COLORS } from './data.js';

mountShell({ root: '../', active: 'reports' });

const state = { dash: 'ventas', range: 30 };

const DASH = {
  ventas: { name: 'Panel de ventas', sub: 'Compartido con todos · Actualizado hace 5 minutos' },
  marketing: { name: 'Panel de marketing', sub: 'Compartido con el equipo de marketing · Actualizado hace 1 hora' },
  servicio: { name: 'Panel de servicio', sub: 'Privado · Actualizado hoy' },
};

const fmt = (n) => n.toLocaleString('es-ES');
const euro = (n) => `${fmt(Math.round(n))} €`;

// Deterministic pseudo-random series so every visit looks the same.
function series(seed, n, base, spread) {
  const out = [];
  let x = seed;
  for (let i = 0; i < n; i += 1) {
    x = (x * 9301 + 49297) % 233280;
    out.push(Math.round(base + (x / 233280) * spread));
  }
  return out;
}

function scale(range) {
  return { 7: 0.3, 30: 1, 90: 2.7, 365: 10 }[range] || 1;
}

function kpiHtml(items) {
  return items
    .map(
      ([label, value, delta]) => `
      <div class="kpi">
        <span class="kpi__label">${label}</span>
        <span class="kpi__value">${value}</span>
        <span class="kpi__delta ${delta >= 0 ? 'is-up' : 'is-down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} % frente al periodo anterior</span>
      </div>`,
    )
    .join('');
}

function barChart(values, labels, color = '#006162') {
  const max = Math.max(...values) || 1;
  return `
    <div class="chart chart--bars">
      ${values
        .map(
          (v, i) => `
        <div class="bar" title="${labels[i]}: ${fmt(v)}">
          <div class="bar__fill" style="height:${(v / max) * 100}%;background:${color}"></div>
          <span class="bar__label">${labels[i]}</span>
        </div>`,
        )
        .join('')}
    </div>`;
}

function lineChart(values, color = '#0091ae') {
  const w = 600;
  const h = 200;
  const max = Math.max(...values) || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - (v / max) * (h - 20) - 5]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${d} L${w},${h} L0,${h} Z`;
  return `
    <svg class="chart chart--line" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="g-${color.slice(1)}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".25"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      ${[0.25, 0.5, 0.75].map((f) => `<line x1="0" x2="${w}" y1="${h * f}" y2="${h * f}" stroke="#eaf0f6" stroke-width="1"/>`).join('')}
      <path d="${area}" fill="url(#g-${color.slice(1)})"/>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round"/>
    </svg>`;
}

function donut(parts) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  let acc = 0;
  const stops = parts
    .map((p, i) => {
      const from = (acc / total) * 360;
      acc += p.value;
      const to = (acc / total) * 360;
      return `${COLORS[i % COLORS.length]} ${from}deg ${to}deg`;
    })
    .join(', ');
  return `
    <div class="chart chart--donut">
      <div class="donut" style="background: conic-gradient(${stops})"><span class="donut__hole">${fmt(total)}</span></div>
      <ul class="legend">
        ${parts.map((p, i) => `<li><span class="legend__dot" style="background:${COLORS[i % COLORS.length]}"></span>${p.label} <strong>${fmt(p.value)}</strong></li>`).join('')}
      </ul>
    </div>`;
}

function tableChart(rows, head) {
  return `
    <table class="mini-table">
      <thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
}

function card(title, body, wide = false) {
  return `
    <section class="card card--report${wide ? ' card--wide' : ''}">
      <div class="card__head">
        <h2 class="card__title">${title}</h2>
        <div class="menu">
          <button class="icon-btn" type="button" aria-label="Opciones del informe" aria-haspopup="true">⋯</button>
          <div class="menu__panel menu__panel--right">
            <button class="menu__item" type="button" data-action="fullscreen">Ver a pantalla completa</button>
            <button class="menu__item" type="button" data-action="export">Exportar</button>
            <button class="menu__item" type="button" data-action="remove">Quitar del panel</button>
          </div>
        </div>
      </div>
      ${body}
    </section>`;
}

function render() {
  const k = scale(state.range);
  const contacts = allContacts();
  const months = ['May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov'];
  const week = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  document.getElementById('dash-name').textContent = DASH[state.dash].name;
  document.getElementById('dash-sub').textContent = DASH[state.dash].sub;
  document.getElementById('range-btn').innerHTML = `${{ 7: 'Últimos 7 días', 30: 'Últimos 30 días', 90: 'Últimos 90 días', 365: 'Este año' }[state.range]} <span class="caret"></span>`;

  let kpis;
  let cards;

  if (state.dash === 'ventas') {
    const deals = series(11, 7, 8, 20).map((v) => Math.round(v * k));
    const revenue = series(23, 12, 14000, 26000).map((v) => Math.round(v * k));
    const byStatus = Object.entries(STATUSES).map(([key, [label]]) => ({ label, value: contacts.filter((c) => c.status === key).length }));
    const owners = ['Fernando L.', 'Sofía R.'].map((o, i) => [o, fmt(contacts.filter((c) => c.owner === o).length), euro((48000 + i * 9000) * k), `${62 + i * 7} %`]);
    kpis = kpiHtml([
      ['Negocios creados', fmt(deals.reduce((a, b) => a + b, 0)), 12],
      ['Ingresos cerrados', euro(revenue.slice(-3).reduce((a, b) => a + b, 0)), 8],
      ['Contactos nuevos', fmt(Math.round(contacts.length * Math.min(1, k / 2))), -3],
      ['Tasa de cierre', '27 %', 2],
    ]);
    cards = [
      card('Ingresos por mes', lineChart(revenue), true),
      card('Negocios creados por día', barChart(deals, week)),
      card('Contactos por estado del lead', donut(byStatus)),
      card('Rendimiento por propietario', tableChart(owners, ['Propietario', 'Contactos', 'Ingresos', 'Objetivo'])),
      card('Llamadas registradas', barChart(series(5, 7, 10, 40).map((v) => Math.round(v * k)), months), true),
    ];
  } else if (state.dash === 'marketing') {
    const visits = series(31, 12, 2200, 6000).map((v) => Math.round(v * k));
    kpis = kpiHtml([
      ['Visitas al sitio', fmt(visits.reduce((a, b) => a + b, 0)), 15],
      ['Leads nuevos', fmt(Math.round(184 * k)), 6],
      ['Correos enviados', fmt(Math.round(5400 * k)), 4],
      ['Tasa de apertura', '41 %', -1],
    ]);
    cards = [
      card('Sesiones por día', lineChart(visits, '#6a78d1'), true),
      card('Leads por fuente', donut([
        { label: 'Búsqueda orgánica', value: Math.round(96 * k) },
        { label: 'Redes sociales', value: Math.round(41 * k) },
        { label: 'Referencias', value: Math.round(27 * k) },
        { label: 'Correo', value: Math.round(20 * k) },
      ])),
      card('Formularios enviados', barChart(series(9, 7, 5, 30).map((v) => Math.round(v * k)), months, '#6a78d1')),
      card('Campañas principales', tableChart([
        ['Promoción otoño', fmt(Math.round(1200 * k)), fmt(Math.round(84 * k)), '7 %'],
        ['Guía de ventanas', fmt(Math.round(860 * k)), fmt(Math.round(52 * k)), '6 %'],
        ['Newsletter mensual', fmt(Math.round(640 * k)), fmt(Math.round(21 * k)), '3 %'],
      ], ['Campaña', 'Visitas', 'Leads', 'Conversión'])),
    ];
  } else {
    const tickets = series(17, 7, 3, 12).map((v) => Math.round(v * k));
    kpis = kpiHtml([
      ['Tickets abiertos', fmt(Math.round(23 * Math.min(1, k))), -9],
      ['Tiempo de primera respuesta', '1 h 42 min', -12],
      ['Tickets cerrados', fmt(tickets.reduce((a, b) => a + b, 0)), 5],
      ['Satisfacción', '4,6 / 5', 1],
    ]);
    cards = [
      card('Tickets creados por día', barChart(tickets, week, '#f2547d'), true),
      card('Tickets por estado', donut([
        { label: 'Nuevo', value: Math.round(9 * k) },
        { label: 'En espera', value: Math.round(6 * k) },
        { label: 'Cerrado', value: Math.round(31 * k) },
      ])),
      card('Tiempo medio de resolución', lineChart(series(41, 10, 8, 20), '#f2547d')),
    ];
  }

  document.getElementById('kpis').innerHTML = kpis;
  document.getElementById('grid').innerHTML = cards.join('');
  wireMenus();
}

document.getElementById('dash-menu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dash]');
  if (!b) return;
  state.dash = b.dataset.dash;
  closeMenus();
  render();
});
document.getElementById('range-menu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-range]');
  if (!b) return;
  state.range = Number(b.dataset.range);
  closeMenus();
  render();
});

const MESSAGES = {
  share: 'Enlace copiado (solo en esta demostración).',
  clone: 'El panel se ha clonado como "Copia de panel" (solo en esta demostración).',
  export: 'Exportación en preparación: recibirás un correo cuando esté lista.',
  'add-report': 'La biblioteca de informes estará disponible en la próxima versión.',
  fullscreen: 'La vista a pantalla completa estará disponible en la próxima versión.',
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  if (action === 'remove') {
    el.closest('.card--report').remove();
    toast('Informe quitado del panel');
  } else if (MESSAGES[action]) {
    toast(MESSAGES[action]);
  }
  closeMenus();
});

wireMenus();
render();
