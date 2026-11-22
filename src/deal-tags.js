// Etiquetas de Negocio (deal tags), like the original: a tag has a name, an emoji, a pastel colour, a description,
// the pipelines it applies to and a set of filters (same conditions as the views' advanced filters). It is
// evaluated automatically: a deal that satisfies the filters shows the tag's chip on its board card and in the
// list. Stored in Supabase (deal_tags) with a localStorage fallback; seeded with the account's three tags.
// The engine itself is the shared one of src/object-tags.js (tickets have their own in src/ticket-tags.js).
import { allDeals, isClosedStage, dealPipelineDefs } from './data.js';
import { createTagEngine, cond, MAX_TAGS, PALETTE, EMOJIS, tagChipHtml, filterGroups } from './object-tags.js';

export { MAX_TAGS, PALETTE, EMOJIS, tagChipHtml, filterGroups };
// The original's presets of «Crear etiqueta»: name, hint and the filters they preload in step 2.
export const PRESETS = [
  { key: 'late', name: 'Atrasado', hint: 'La fecha de cierre pasó hace más de 1 día', emoji: '⏰', color: '#FBDDD8', filters: [cond('closeDate', 'olderdays', '1'), cond('hs_is_closed', 'anyof', 'No')] },
  { key: 'urgent', name: 'Urgente', hint: 'La fecha de cierre es en menos de 3 días a partir de ahora', emoji: '🔥', color: '#FBEECE', filters: [cond('closeDate', 'nextdays', '3'), cond('hs_is_closed', 'anyof', 'No')] },
  { key: 'contact', name: 'Agregar contacto', hint: 'El número de contactos asociados es menor que 1 o está vacío', emoji: '📞', color: '#D8E8FB', filters: [cond('num_associated_contacts', 'lt', '1')] },
];
// The filters run on the deal plus a few computed properties of the original's catalog that the record does not
// carry itself: «Está cerrado» (Sí/No from the stage) and «Número de contactos asociados».
export function decorateDeal(r) {
  return { ...r, hs_is_closed: isClosedStage(r.stage) ? 'Sí' : 'No', num_associated_contacts: r.num_associated_contacts !== undefined && r.num_associated_contacts !== '' ? Number(r.num_associated_contacts) || 0 : r.contactId ? 1 : 0 };
}
// The account's three tags (same as the original's list): local mode and an empty table get them.
const seed = (defs, t) => {
  const jfc = defs.find((p) => /jfc/i.test(p.name));
  return [
    { id: 'e1000000-0000-4000-8000-000000000001', name: 'Obsoleto', emoji: '', color: '#FBDDD8', description: 'La fecha de creación pasó hace más de 90 días y no se ha movido', pipelineIds: [], filters: [cond('created', 'olderdays', '90'), cond('hs_is_closed', 'anyof', 'No'), cond('lastActivity', 'olderdays', '90')], position: 0, createdAt: t, updatedAt: t },
    { id: 'e1000000-0000-4000-8000-000000000002', name: 'Importante', emoji: '', color: '#FBEECE', description: 'Son negocios importantes que son mayores de 1,000,000 de pesos', pipelineIds: [], filters: [cond('amount', 'gt', '1000000')], position: 1, createdAt: t, updatedAt: t },
    { id: 'e1000000-0000-4000-8000-000000000003', name: 'Negocios importantes', emoji: '', color: '#EBEBEB', description: 'Todos los negocios que se hayan generado arriba de 100,000', pipelineIds: jfc ? [jfc.id] : [], filters: [cond('amount', 'gt', '100000')], position: 2, createdAt: t, updatedAt: t },
  ];
};

export const engine = createTagEngine({ object: 'deals', table: 'deal_tags', ls: 'crm:deal_tags', event: 'crm:deal-tags', label: 'etiquetas de negocio', pipelineDefs: dealPipelineDefs, rows: allDeals, decorate: decorateDeal, seed, presets: PRESETS });
export const { ready, tagById, tagCount, appliesToPipeline, tagsForPipeline, pipelineAssignment, pipelineNamesOf, createTag, updateTag, deleteTag, moveTag, tagApplies, usage, describeCondition, presetByKey, pending } = engine;
export const dealTags = engine.tags;
export const dealTagsLive = engine.live;
// The tags a deal earns right now (in the tags' order) and their chips.
export const tagsForDeal = engine.tagsFor;
export const dealTagChips = engine.chips;
