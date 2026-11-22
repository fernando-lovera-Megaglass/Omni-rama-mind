// Etiquetas de Ticket (ticket tags): the same object tags as the deals' («Etiquetas de Negocio»), for tickets —
// name, emoji, pastel colour, description, the ticket pipelines they apply to and filters over the ticket
// properties (same engine as the views' advanced filters). A ticket that satisfies the filters shows the chip
// on its board card and in the «Etiquetas» column of the list. Stored in Supabase (ticket_tags,
// supabase/ticket_tags.sql) with a localStorage fallback (crm:ticket_tags); no seed.
import { allTickets, isTicketOpen, ticketPipelineDefs, PRIORITIES } from './data.js';
import { createTagEngine, cond, MAX_TAGS, PALETTE, EMOJIS, tagChipHtml, filterGroups } from './object-tags.js';

export { MAX_TAGS, PALETTE, EMOJIS, tagChipHtml, filterGroups };
// «Crear etiqueta» presets for tickets: name, hint and the filters they preload in step 2.
export const PRESETS = [
  { key: 'high', name: 'Prioridad alta', hint: 'La prioridad es Alta', emoji: '🔥', color: '#FBDDD8', filters: [cond('priority', 'anyof', ['high'])] },
  { key: 'unassigned', name: 'Sin propietario', hint: 'El propietario del ticket es desconocido', emoji: '❗', color: '#FBEECE', filters: [cond('owner', 'empty', '')] },
  { key: 'stale', name: 'Antiguo', hint: 'La fecha de creación pasó hace más de 30 días y sigue abierto', emoji: '⏰', color: '#E9DDFB', filters: [cond('created', 'olderdays', '30'), cond('hs_is_closed', 'anyof', 'No')] },
];
// The filters run on the ticket plus «Está cerrado» (Sí/No from its pipeline's status type).
export const decorateTicket = (r) => ({ ...r, hs_is_closed: isTicketOpen(r) ? 'No' : 'Sí' });
// Priority values read by their label in the tag's description («Prioridad es cualquiera de Alta»).
const optionLabel = (key, value) => (key === 'priority' ? (PRIORITIES.find(([k]) => k === value) || [])[1] || '' : '');

export const engine = createTagEngine({ object: 'tickets', table: 'ticket_tags', ls: 'crm:ticket_tags', event: 'crm:ticket-tags', label: 'etiquetas de ticket', pipelineDefs: ticketPipelineDefs, rows: allTickets, decorate: decorateTicket, seed: () => [], presets: PRESETS, optionLabel });
export const { ready, tagById, tagCount, appliesToPipeline, tagsForPipeline, pipelineAssignment, pipelineNamesOf, createTag, updateTag, deleteTag, moveTag, tagApplies, usage, describeCondition, presetByKey, pending } = engine;
export const ticketTags = engine.tags;
export const ticketTagsLive = engine.live;
// The tags a ticket earns right now (in the tags' order) and their chips.
export const tagsForTicket = engine.tagsFor;
export const ticketTagChips = engine.chips;
