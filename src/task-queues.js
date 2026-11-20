import { supabase } from './supabaseClient.js';
import { clearDeletedTaskQueue } from './data.js';
const key = 'crm:task-queues';
let queues = [];
export const taskQueues = () => queues;
export async function loadTaskQueues() {
  if (supabase) {
    const { data, error } = await supabase.from('task_queues').select('*').order('name');
    if (error) throw error;
    queues = data;
  } else queues = JSON.parse(localStorage.getItem(key) || '[]');
  return queues;
}
export async function saveTaskQueue(name, id = null) {
  name = name.trim();
  if (!name || name.length > 100) throw new Error('El nombre debe tener entre 1 y 100 caracteres.');
  if (queues.some(q => q.id !== id && q.name.toLowerCase() === name.toLowerCase())) throw new Error('Ya existe una cola con ese nombre.');
  let row;
  if (supabase) {
    const query = id ? supabase.from('task_queues').update({ name }).eq('id', id) : supabase.from('task_queues').insert({ name });
    const { data, error } = await query.select('*').single();
    if (error) throw error;
    row = data;
  } else row = { id: id || crypto.randomUUID(), name };
  queues = [...queues.filter(q => q.id !== row.id), row].sort((a, b) => a.name.localeCompare(b.name));
  if (!supabase) localStorage.setItem(key, JSON.stringify(queues));
  return row;
}
export async function deleteTaskQueue(id) {
  if (supabase) {
    const { error, data } = await supabase.from('task_queues').delete().eq('id', id).select('id').single();
    if (error || !data) throw error || new Error('No se pudo eliminar la cola.');
  }
  queues = queues.filter(q => q.id !== id);
  if (!supabase) localStorage.setItem(key, JSON.stringify(queues));
  clearDeletedTaskQueue(id);
}
