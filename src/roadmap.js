// The build roadmap (supabase/roadmap.sql): which sections are pending, in what order.
// The "en construcción" dialog uses it to say «va 3ª de 37 en la lista de construcción».
import { supabase } from './supabaseClient.js';

let client = supabase;
export const setRoadmapClient = (c) => { client = c; };

let rows = [];
export async function reloadRoadmap() {
  if (!client) { rows = []; return []; }
  try {
    const { data, error } = await client.from('roadmap_sections').select('key, label, position, status').order('position');
    rows = !error && Array.isArray(data) ? data : [];
  } catch { rows = []; }
  return rows;
}
export const ready = reloadRoadmap();

export const roadmap = () => rows;
// The pending sections in order; position within them is what the dialog shows.
export const pendingSections = () => rows.filter((r) => r.status === 'pending').sort((a, b) => a.position - b.position);
export const pendingTotal = () => pendingSections().length;

// Look up a section by its visible label (what the nav shows) or by key.
export function sectionStatus(name) {
  const n = String(name || '').trim().toLowerCase();
  const hit = rows.find((r) => r.label.toLowerCase() === n || r.key === n);
  if (!hit) return null;
  if (hit.status === 'done') return { status: 'done', label: hit.label };
  if (hit.status === 'building') return { status: 'building', total: pendingTotal(), label: hit.label };
  const list = pendingSections();
  return { status: 'pending', position: list.indexOf(hit) + 1, total: list.length, label: hit.label };
}
