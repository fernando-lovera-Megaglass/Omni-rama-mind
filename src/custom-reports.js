import { supabase } from './supabaseClient.js';
import { allContacts, allCompanies, allDeals, allTickets, allActivities, dealStageLabel, allTicketStatuses, formatMoney, homeCurrency } from './data.js';

export const SOURCES = { contacts: 'Contactos', companies: 'Empresas', deals: 'Negocios', tickets: 'Tickets', activities: 'Actividades', calls: 'Llamadas' };
export const MEASURES = { count: 'Conteo', sum: 'Suma de importe', average: 'Promedio de importe' };
export const DIMENSIONS = { stage: 'Etapa', pipeline: 'Pipeline', owner: 'Propietario', source: 'Fuente', month: 'Mes de creación' };
export const VIEWS = { table: 'Tabla', bars: 'Barras', line: 'Línea', donut: 'Dona', kpi: 'KPI numérico' };
export const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function validateConfig(c) {
  if (!c || !SOURCES[c.source] || !MEASURES[c.measure] || !DIMENSIONS[c.dimension] || !VIEWS[c.visualization]) throw new Error('Configuración de informe inválida.');
  if (c.measure !== 'count' && c.source !== 'deals') throw new Error('El importe solo está disponible para negocios.');
  return c;
}
export function aggregateReport(config, suppliedRows, period) {
  const c = validateConfig(config);
  const rows = suppliedRows ?? ({ contacts: allContacts, companies: allCompanies, deals: allDeals, tickets: allTickets, activities: allActivities, calls: () => allActivities().filter(a => a.type === 'call') }[c.source])();
  const groups = new Map();
  let total = 0, count = 0;
  for (const r of rows) {
    if (period) {
      const date = new Date(['activities', 'calls'].includes(c.source) ? r.when : r.created);
      if (!(date >= period.start && date <= period.end)) continue;
    }
    let label = r[c.dimension];
    if (c.dimension === 'stage') label = c.source === 'deals' ? dealStageLabel(r.pipeline, r.stage) : c.source === 'tickets' ? allTicketStatuses().find(([key]) => key === r.status)?.[1] || r.status : r.lifecycle || r.status;
    if (c.dimension === 'month') {
      const d = String(r.created || r.when || '');
      label = /^\d{4}-\d{2}/.test(d) && !Number.isNaN(Date.parse(d)) ? d.slice(0, 7) : null;
    }
    label = String(label || 'Sin dato');
    const raw = r.amount_in_home_currency ?? r.amount;
    const value = c.measure === 'count' ? 1 : raw == null || raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(value)) continue;
    const g = groups.get(label) || { label, sum: 0, count: 0 };
    g.sum += value; g.count++; total += value; count++; groups.set(label, g);
  }
  return { rows: [...groups.values()].map(g => ({ label: g.label, value: c.measure === 'average' ? g.sum / g.count : g.sum })).sort((a,b) => a.label.localeCompare(b.label, 'es')), total: c.measure === 'average' ? (count ? total / count : 0) : total, count };
}
export function reportChart(c, period) {
  const result = aggregateReport(c, undefined, period);
  const fmt = n => escapeHtml(c.measure === 'count' ? n.toLocaleString('es-ES') : formatMoney(n, homeCurrency()));
  if (!result.count) return '<p class="muted">Sin datos para esta configuración.</p>';
  if (c.visualization === 'kpi') return `<p class="kpi__value">${fmt(result.total)}</p>`;
  const table = `<table class="mini-table"><thead><tr><th>${DIMENSIONS[c.dimension]}</th><th>${MEASURES[c.measure]}</th></tr></thead><tbody>${result.rows.map(r => `<tr><td>${escapeHtml(r.label)}</td><td>${fmt(r.value)}</td></tr>`).join('')}</tbody></table>`;
  if (c.visualization === 'table') return table;
  const max = Math.max(...result.rows.map(r => Math.abs(r.value)), 1);
  let chart;
  if (c.visualization === 'bars') chart = result.rows.map(r => `<div class="custom-bar"><span>${escapeHtml(r.label)}</span><div style="width:${Math.abs(r.value) / max * 100}%;background:${r.value < 0 ? '#f2547d' : '#0091ae'};height:18px;min-width:2px"></div><strong>${fmt(r.value)}</strong></div>`).join('');
  if (c.visualization === 'line') {
    const min = Math.min(0, ...result.rows.map(r => r.value));
    const high = Math.max(0, ...result.rows.map(r => r.value));
    const points = result.rows.map((r,i) => [20 + i * 560 / Math.max(1, result.rows.length - 1), 180 - (r.value - min) / (high - min || 1) * 160]);
    chart = `<svg viewBox="0 0 600 200" role="img" aria-label="Informe de línea"><polyline points="${points.map(p => p.join(',')).join(' ')}" fill="none" stroke="#0091ae" stroke-width="3"/>${points.map((p,i) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#0091ae"><title>${escapeHtml(result.rows[i].label)}: ${fmt(result.rows[i].value)}</title></circle>`).join('')}</svg>`;
  }
  if (c.visualization === 'donut') {
    if (result.rows.some(r => r.value < 0) || result.total <= 0) return `<p>La dona necesita valores positivos.</p>${table}`;
    const sum = result.rows.reduce((s,r) => s + r.value, 0); let acc = 0;
    chart = `<div class="donut" style="margin:auto;background:conic-gradient(${result.rows.map((r,i) => { const start = acc; acc += r.value / sum * 360; return `hsl(${i * 137.5 % 360} 55% 45%) ${start}deg ${acc}deg`; }).join(',')})"><span class="donut__hole">${fmt(result.total)}</span></div>`;
  }
  return `${chart}<details><summary>Ver datos</summary>${table}</details>`;
}
const KEY = 'crm:custom-reports:v1';
export function createReportStore(client = supabase, storage = localStorage) {
  return {
    async list() {
      if (!client) return JSON.parse(storage.getItem(KEY) || '[]');
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await client.from('reports').select('*').order('created_at', { ascending: false }).order('id').range(from, from + 999);
        if (error) throw error;
        rows.push(...data); if (data.length < 1000) return rows;
      }
    },
    async save(name, config) {
      validateConfig(config);
      name = name.trim(); if (!name || name.length > 120) throw new Error('Escribe un nombre de hasta 120 caracteres.');
      if (client) {
        const { data, error } = await client.from('reports').insert({ name, config }).select().single();
        if (error) throw error; return data;
      }
      const row = { id: crypto.randomUUID(), name, config, pinned: false, created_at: new Date().toISOString() };
      storage.setItem(KEY, JSON.stringify([row, ...await this.list()])); return row;
    },
    async duplicate(id) {
      const report = (await this.list()).find(r => r.id === id);
      if (!report) throw new Error('Informe no encontrado.');
      return this.save(`Copia de ${report.name}`.slice(0, 120), structuredClone(report.config));
    },
    async rename(id, name) {
      name = name.trim();
      if (!name || name.length > 120) throw new Error('Escribe un nombre de hasta 120 caracteres.');
      if (client) {
        const { data, error } = await client.from('reports').update({ name }).eq('id', id).select().single();
        if (error) throw error; return data;
      }
      const rows = await this.list(); const row = rows.find(r => r.id === id);
      if (!row) throw new Error('Informe no encontrado.');
      row.name = name; storage.setItem(KEY, JSON.stringify(rows)); return row;
    },
    async remove(id) {
      if (client) {
        const { data, error } = await client.from('reports').delete().eq('id', id).select('id').single();
        if (error) throw error; return data;
      }
      const rows = await this.list();
      if (!rows.some(r => r.id === id)) throw new Error('Informe no encontrado.');
      storage.setItem(KEY, JSON.stringify(rows.filter(r => r.id !== id)));
    },
    async pin(id, pinned) {
      if (client) {
        const { data, error } = await client.from('reports').update({ pinned }).eq('id', id).select().single();
        if (error) throw error; return data;
      }
      const rows = await this.list(); const row = rows.find(r => r.id === id);
      if (!row) throw new Error('Informe no encontrado.');
      row.pinned = pinned; storage.setItem(KEY, JSON.stringify(rows)); return row;
    },
  };
}
