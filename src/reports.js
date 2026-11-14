// Dashboards built from the account's own records (the rows data.js loads from Supabase, or the local
// set when there is no connection): every number is a count or a sum over the selected date range, and
// the "frente al periodo anterior" deltas compare with the same length of time just before it.
import { mountShell, wireMenus, closeMenus, toast } from './shell.js';
import {
  allContacts, allCompanies, allDeals, allTickets, allTasks, allActivities,
  STATUSES, COLORS, OWNERS, DEAL_STAGES, PRIORITIES, TASK_TYPES, TODAY, formatDate, formatMoney, formatMoneyShort, homeCurrency, isTicketOpen, allTicketStatuses, isClosedStage,
} from './data.js';

mountShell({ root: '../', active: 'reports' });

const state = { dash: 'ventas', range: 30 };

const DASH = {
  ventas: { name: 'Panel de ventas', sub: 'Compartido con todos · Datos de la cuenta en vivo' },
  marketing: { name: 'Panel de marketing', sub: 'Compartido con el equipo de marketing · Datos de la cuenta en vivo' },
  servicio: { name: 'Panel de servicio', sub: 'Privado · Datos de la cuenta en vivo' },
};
const RANGE_LABELS = { 7: 'Últimos 7 días', 30: 'Últimos 30 días', 90: 'Últimos 90 días', 365: 'Este año' };
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DOW = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const DAY = 86400000;

const fmt = (n) => Number(n || 0).toLocaleString('es-ES');
const money = (n) => formatMoney(Math.round(n || 0), homeCurrency());
const moneyShort = (n) => formatMoneyShort(Math.round(n || 0), homeCurrency());
const pct = (part, total) => (total ? `${Math.round((part / total) * 100)} %` : '—');
const sum = (list, f) => list.reduce((s, r) => s + (Number(f(r)) || 0), 0);

// ---------- date range ----------
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
// The selected range ends on the app's reference day (TODAY, the "hoy" of every list) and the previous
// period is the same number of days just before it.
export function period(range) {
  const end = endOfDay(TODAY);
  const start = range === 365 ? new Date(end.getFullYear(), 0, 1) : startOfDay(new Date(TODAY.getTime() - (range - 1) * DAY));
  const len = end.getTime() - start.getTime() + 1;
  return { start, end, prevStart: new Date(start.getTime() - len), prevEnd: new Date(start.getTime() - 1) };
}
const within = (iso, from, to) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t >= from.getTime() && t <= to.getTime();
};
// Bars of the charts: one per day (7 días), per week (30 y 90 días) or per month (este año).
export function buckets(range, start, end) {
  const unit = range === 7 ? 'day' : range === 365 ? 'month' : 'week';
  const list = [];
  let d = new Date(start);
  while (d <= end) {
    let to;
    let label;
    let title;
    if (unit === 'day') { to = endOfDay(d); label = DOW[d.getDay()]; title = formatDate(d); }
    else if (unit === 'week') { to = endOfDay(new Date(d.getTime() + 6 * DAY)); if (to > end) to = end; label = `${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase()}`; title = `Semana del ${formatDate(d)} al ${formatDate(to)}`; }
    else { to = endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0)); if (to > end) to = end; label = MONTHS[d.getMonth()]; title = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
    list.push({ from: d, to, label, title });
    d = startOfDay(new Date(to.getTime() + 1));
  }
  return { unit, list, unitLabel: { day: 'día', week: 'semana', month: 'mes' }[unit] };
}
const countBy = (rows, dateOf, bk) => bk.list.map((b) => rows.filter((r) => within(dateOf(r), b.from, b.to)).length);
const sumBy = (rows, dateOf, valueOf, bk) => bk.list.map((b) => Math.round(sum(rows.filter((r) => within(dateOf(r), b.from, b.to)), valueOf)));
const delta = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);

// ---------- chart pieces (same look as before) ----------
function kpiHtml(items) {
  return items
    .map(([label, value, d, prevText]) => {
      const trend = d === null || d === undefined
        ? `<span class="kpi__delta is-flat">${prevText || 'Sin datos del periodo anterior'}</span>`
        : `<span class="kpi__delta ${d >= 0 ? 'is-up' : 'is-down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d)} % frente al periodo anterior</span>`;
      return `
      <div class="kpi">
        <span class="kpi__label">${label}</span>
        <span class="kpi__value">${value}</span>
        ${trend}
      </div>`;
    })
    .join('');
}

function barChart(values, labels, color = '#006162', titles = labels, format = fmt) {
  const max = Math.max(...values) || 1;
  const empty = values.every((v) => !v);
  return `
    <div class="chart chart--bars${empty ? ' is-empty' : ''}">
      ${values
        .map(
          (v, i) => `
        <div class="bar" title="${titles[i]}: ${format(v)}">
          <div class="bar__fill" style="height:${(v / max) * 100}%;background:${color}"></div>
          <span class="bar__label">${labels[i]}</span>
        </div>`,
        )
        .join('')}
    </div>${empty ? '<p class="chart__empty muted">Sin registros en el periodo seleccionado.</p>' : ''}`;
}

function lineChart(values, color = '#0091ae', titles = [], format = fmt, labels = titles) {
  const w = 600;
  const h = 200;
  const n = values.length;
  const max = Math.max(...values) || 1;
  const x = (i) => (n > 1 ? (i / (n - 1)) * w : w / 2);
  const pts = values.map((v, i) => [x(i), h - (v / max) * (h - 20) - 5]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${d} L${pts[n - 1] ? pts[n - 1][0].toFixed(1) : w},${h} L${pts[0] ? pts[0][0].toFixed(1) : 0},${h} Z`;
  const total = values.reduce((a, b) => a + b, 0);
  return `
    <svg class="chart chart--line" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="g-${color.slice(1)}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".25"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      ${[0.25, 0.5, 0.75].map((f) => `<line x1="0" x2="${w}" y1="${h * f}" y2="${h * f}" stroke="#eaf0f6" stroke-width="1"/>`).join('')}
      <path d="${area}" fill="url(#g-${color.slice(1)})"/>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round"/>
      ${pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="${color}"><title>${titles[i] || ''}: ${format(values[i])}</title></circle>`).join('')}
    </svg>
    <div class="chart__axis">${values.map((v, i) => `<span title="${titles[i] || ''}: ${format(v)}">${labels[i] || ''}</span>`).join('')}</div>
    <p class="chart__total muted">Total del periodo: <strong>${format(total)}</strong></p>`;
}

function donut(parts, format = fmt) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  let acc = 0;
  const stops = total
    ? parts
      .map((p, i) => {
        const from = (acc / total) * 360;
        acc += p.value;
        const to = (acc / total) * 360;
        return `${COLORS[i % COLORS.length]} ${from}deg ${to}deg`;
      })
      .join(', ')
    : '#eaf0f6 0deg 360deg';
  return `
    <div class="chart chart--donut">
      <div class="donut" style="background: conic-gradient(${stops})"><span class="donut__hole">${format(total)}</span></div>
      <ul class="legend">
        ${parts.map((p, i) => `<li><span class="legend__dot" style="background:${COLORS[i % COLORS.length]}"></span>${p.label} <strong>${format(p.value)}</strong> <span class="muted">${pct(p.value, total)}</span></li>`).join('')}
      </ul>
    </div>${total ? '' : '<p class="chart__empty muted">Sin registros en el periodo seleccionado.</p>'}`;
}

function tableChart(rows, head) {
  return `
    <table class="mini-table">
      <thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.length ? rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${head.length}" class="muted">Sin registros en el periodo seleccionado.</td></tr>`}</tbody>
    </table>`;
}

function card(title, body, wide = false, note = '') {
  return `
    <section class="card card--report${wide ? ' card--wide' : ''}">
      <div class="card__head">
        <h2 class="card__title">${title}${note ? ` <span class="card__note muted">${note}</span>` : ''}</h2>
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

// ---------- the numbers behind each dashboard ----------
// Win rate counts won against lost; deals in "Eliminado" are closed but not part of the rate.
const dealClosed = (d) => d.stage === 'won' || d.stage === 'lost';
const taskDoneAt = (t) => t.completedAt || t.due;
const ticketClosedAt = (t) => t.lastActivity || t.created;

export function salesFigures(range) {
  const p = period(range);
  const bk = buckets(range, p.start, p.end);
  const deals = allDeals();
  const contacts = allContacts();
  const inRange = (dateOf) => (r) => within(dateOf(r), p.start, p.end);
  const inPrev = (dateOf) => (r) => within(dateOf(r), p.prevStart, p.prevEnd);
  const created = deals.filter(inRange((d) => d.created));
  const createdPrev = deals.filter(inPrev((d) => d.created));
  const won = deals.filter((d) => d.stage === 'won').filter(inRange((d) => d.closeDate));
  const wonPrev = deals.filter((d) => d.stage === 'won').filter(inPrev((d) => d.closeDate));
  const closed = deals.filter(dealClosed).filter(inRange((d) => d.closeDate));
  const closedPrev = deals.filter(dealClosed).filter(inPrev((d) => d.closeDate));
  const newContacts = contacts.filter(inRange((c) => c.created));
  const newContactsPrev = contacts.filter(inPrev((c) => c.created));
  const revenue = sum(won, (d) => d.amount_in_home_currency ?? d.amount);
  const revenuePrev = sum(wonPrev, (d) => d.amount_in_home_currency ?? d.amount);
  const calls = allActivities().filter((a) => a.type === 'call').filter(inRange((a) => a.when));
  const winRate = closed.length ? won.length / closed.length : null;
  const winRatePrev = closedPrev.length ? wonPrev.length / closedPrev.length : null;
  const owners = OWNERS.filter((o) => o !== 'Sin asignar').map((o) => {
    const oc = newContacts.filter((c) => c.owner === o).length;
    const od = created.filter((d) => d.owner === o).length;
    const ow = won.filter((d) => d.owner === o);
    const ocl = closed.filter((d) => d.owner === o).length;
    return { owner: o, contacts: oc, deals: od, revenue: sum(ow, (d) => d.amount_in_home_currency ?? d.amount), rate: ocl ? ow.length / ocl : null };
  }).filter((o) => o.contacts || o.deals || o.revenue);
  return {
    p, bk, created, createdPrev, won, wonPrev, closed, revenue, revenuePrev, newContacts, newContactsPrev, winRate, winRatePrev, calls, owners,
    revenueSeries: sumBy(won, (d) => d.closeDate, (d) => d.amount_in_home_currency ?? d.amount, bk),
    createdSeries: countBy(created, (d) => d.created, bk),
    callSeries: countBy(calls, (a) => a.when, bk),
    byStatus: Object.entries(STATUSES).map(([key, [label]]) => ({ label, value: newContacts.filter((c) => c.status === key).length })),
  };
}

export function marketingFigures(range) {
  const p = period(range);
  const bk = buckets(range, p.start, p.end);
  const contacts = allContacts();
  const companies = allCompanies();
  const deals = allDeals();
  const inRange = (dateOf) => (r) => within(dateOf(r), p.start, p.end);
  const inPrev = (dateOf) => (r) => within(dateOf(r), p.prevStart, p.prevEnd);
  const isLead = (c) => /^lead/i.test(c.lifecycle || '');
  const newContacts = contacts.filter(inRange((c) => c.created));
  const newContactsPrev = contacts.filter(inPrev((c) => c.created));
  const newCompanies = companies.filter(inRange((c) => c.created));
  const newCompaniesPrev = companies.filter(inPrev((c) => c.created));
  const emails = allActivities().filter((a) => a.type === 'email');
  const sources = [...new Set(contacts.map((c) => c.source).filter(Boolean))];
  const lifecycles = [...new Set(contacts.map((c) => c.lifecycle).filter(Boolean))];
  const industries = [...new Set(companies.map((c) => c.industry).filter(Boolean))];
  return {
    p, bk, newContacts, newContactsPrev, newCompanies, newCompaniesPrev,
    leads: newContacts.filter(isLead).length, leadsPrev: newContactsPrev.filter(isLead).length,
    emails: emails.filter(inRange((a) => a.when)).length, emailsPrev: emails.filter(inPrev((a) => a.when)).length,
    contactSeries: countBy(newContacts, (c) => c.created, bk),
    bySource: sources.map((s) => ({ label: s, value: newContacts.filter((c) => c.source === s).length })).sort((a, b) => b.value - a.value),
    byLifecycle: lifecycles.map((l) => ({ label: l, value: newContacts.filter((c) => c.lifecycle === l).length })),
    byIndustry: industries.map((ind) => {
      const ids = new Set(companies.filter((c) => c.industry === ind).map((c) => Number(c.id)));
      return [ind, newCompanies.filter((c) => c.industry === ind).length, newContacts.filter((c) => ids.has(Number(c.companyId))).length, deals.filter((d) => ids.has(Number(d.companyId)) && !dealClosed(d)).length];
    }).sort((a, b) => b[1] - a[1] || b[2] - a[2]),
  };
}

export function serviceFigures(range) {
  const p = period(range);
  const bk = buckets(range, p.start, p.end);
  const tickets = allTickets();
  const tasks = allTasks();
  const inRange = (dateOf) => (r) => within(dateOf(r), p.start, p.end);
  const inPrev = (dateOf) => (r) => within(dateOf(r), p.prevStart, p.prevEnd);
  const created = tickets.filter(inRange((t) => t.created));
  const createdPrev = tickets.filter(inPrev((t) => t.created));
  const open = tickets.filter(isTicketOpen);
  const closed = tickets.filter((t) => !isTicketOpen(t)).filter(inRange(ticketClosedAt));
  const closedPrev = tickets.filter((t) => !isTicketOpen(t)).filter(inPrev(ticketClosedAt));
  const doneTasks = tasks.filter((t) => t.status === 'done').filter(inRange(taskDoneAt));
  const doneTasksPrev = tasks.filter((t) => t.status === 'done').filter(inPrev(taskDoneAt));
  const dueTasks = tasks.filter(inRange((t) => t.due));
  const overdue = tasks.filter((t) => t.status !== 'done' && t.due && new Date(t.due) < startOfDay(TODAY));
  return {
    p, bk, created, createdPrev, open, closed, closedPrev, doneTasks, doneTasksPrev, dueTasks, overdue,
    createdSeries: countBy(created, (t) => t.created, bk),
    byStatus: allTicketStatuses().map(([k, l]) => ({ label: l, value: created.filter((t) => t.status === k).length })),
    byPriority: PRIORITIES.map(([k, l]) => ({ label: l, value: created.filter((t) => t.priority === k).length })),
    byType: TASK_TYPES.map((ty) => {
      const of = dueTasks.filter((t) => t.type === ty);
      return [ty, of.filter((t) => t.status !== 'done').length, of.filter((t) => t.status !== 'done' && new Date(t.due) < startOfDay(TODAY)).length, of.filter((t) => t.status === 'done').length];
    }),
  };
}

// ---------- rendering ----------
const bar = (bk) => bk.list.map((b) => b.label);
const titles = (bk) => bk.list.map((b) => b.title);

function render() {
  document.getElementById('dash-name').textContent = DASH[state.dash].name;
  document.getElementById('dash-sub').textContent = `${DASH[state.dash].sub} · ${RANGE_LABELS[state.range]}`;
  document.getElementById('range-btn').innerHTML = `${RANGE_LABELS[state.range]} <span class="caret"></span>`;

  let kpis;
  let cards;

  if (state.dash === 'ventas') {
    const f = salesFigures(state.range);
    kpis = kpiHtml([
      ['Negocios creados', fmt(f.created.length), delta(f.created.length, f.createdPrev.length), `Periodo anterior: ${fmt(f.createdPrev.length)}`],
      ['Ingresos cerrados', moneyShort(f.revenue), delta(f.revenue, f.revenuePrev), `Periodo anterior: ${moneyShort(f.revenuePrev)}`],
      ['Contactos nuevos', fmt(f.newContacts.length), delta(f.newContacts.length, f.newContactsPrev.length), `Periodo anterior: ${fmt(f.newContactsPrev.length)}`],
      ['Tasa de cierre', f.winRate === null ? '—' : pct(f.won.length, f.closed.length), f.winRate !== null && f.winRatePrev !== null ? Math.round((f.winRate - f.winRatePrev) * 100) : null, f.winRate === null ? 'Sin negocios cerrados en el periodo' : 'Sin negocios cerrados en el periodo anterior'],
    ]);
    cards = [
      card(`Ingresos cerrados por ${f.bk.unitLabel}`, lineChart(f.revenueSeries, '#0091ae', titles(f.bk), money, bar(f.bk)), true, `${f.won.length} ${f.won.length === 1 ? 'negocio ganado' : 'negocios ganados'} · ${homeCurrency()}`),
      card(`Negocios creados por ${f.bk.unitLabel}`, barChart(f.createdSeries, bar(f.bk), '#006162', titles(f.bk))),
      card('Contactos por estado del lead', donut(f.byStatus), false, 'contactos creados en el periodo'),
      card('Rendimiento por propietario', tableChart(f.owners.map((o) => [o.owner, fmt(o.contacts), fmt(o.deals), money(o.revenue), o.rate === null ? '—' : `${Math.round(o.rate * 100)} %`]), ['Propietario', 'Contactos nuevos', 'Negocios creados', 'Ingresos cerrados', 'Tasa de cierre'])),
      card(`Llamadas registradas por ${f.bk.unitLabel}`, barChart(f.callSeries, bar(f.bk), '#006162', titles(f.bk)), true, `${fmt(f.calls.length)} en el periodo`),
    ];
  } else if (state.dash === 'marketing') {
    const f = marketingFigures(state.range);
    kpis = kpiHtml([
      ['Contactos nuevos', fmt(f.newContacts.length), delta(f.newContacts.length, f.newContactsPrev.length), `Periodo anterior: ${fmt(f.newContactsPrev.length)}`],
      ['Leads nuevos', fmt(f.leads), delta(f.leads, f.leadsPrev), `Periodo anterior: ${fmt(f.leadsPrev)}`],
      ['Correos registrados', fmt(f.emails), delta(f.emails, f.emailsPrev), `Periodo anterior: ${fmt(f.emailsPrev)}`],
      ['Empresas nuevas', fmt(f.newCompanies.length), delta(f.newCompanies.length, f.newCompaniesPrev.length), `Periodo anterior: ${fmt(f.newCompaniesPrev.length)}`],
    ]);
    cards = [
      card(`Contactos creados por ${f.bk.unitLabel}`, lineChart(f.contactSeries, '#6a78d1', titles(f.bk), fmt, bar(f.bk)), true),
      card('Leads por fuente', donut(f.bySource), false, 'contactos creados en el periodo'),
      card('Contactos por etapa del ciclo de vida', barChart(f.byLifecycle.map((x) => x.value), f.byLifecycle.map((x) => x.label.split(' ')[0]), '#6a78d1', f.byLifecycle.map((x) => x.label))),
      card('Empresas por sector', tableChart(f.byIndustry.map((r) => [r[0], fmt(r[1]), fmt(r[2]), fmt(r[3])]), ['Sector', 'Empresas nuevas', 'Contactos nuevos', 'Negocios abiertos'])),
    ];
  } else {
    const f = serviceFigures(state.range);
    kpis = kpiHtml([
      ['Tickets abiertos', fmt(f.open.length), null, `${fmt(f.created.filter(isTicketOpen).length)} creados en el periodo`],
      ['Tickets creados', fmt(f.created.length), delta(f.created.length, f.createdPrev.length), `Periodo anterior: ${fmt(f.createdPrev.length)}`],
      ['Tickets cerrados', fmt(f.closed.length), delta(f.closed.length, f.closedPrev.length), `Periodo anterior: ${fmt(f.closedPrev.length)}`],
      ['Tareas completadas', fmt(f.doneTasks.length), delta(f.doneTasks.length, f.doneTasksPrev.length), `Periodo anterior: ${fmt(f.doneTasksPrev.length)}`],
    ]);
    cards = [
      card(`Tickets creados por ${f.bk.unitLabel}`, barChart(f.createdSeries, bar(f.bk), '#f2547d', titles(f.bk)), true),
      card('Tickets por estado', donut(f.byStatus), false, 'tickets creados en el periodo'),
      card('Tickets por prioridad', donut(f.byPriority), false, 'tickets creados en el periodo'),
      card('Tareas por tipo', tableChart(f.byType.map((r) => [r[0], fmt(r[1]), fmt(r[2]), fmt(r[3])]), ['Tipo', 'Pendientes', 'Vencidas', 'Completadas']), false, `con vencimiento en el periodo · ${fmt(f.overdue.length)} vencidas en total`),
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
export { state, render };
