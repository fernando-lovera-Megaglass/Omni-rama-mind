// Ajustes › Objetos › Negocios › Pipelines › «Etiquetas de Negocio»: the list and the three-step side panel that
// creates or edits a deal tag. The UI is the shared one of src/object-tags-ui.js bound to the deals engine
// (src/deal-tags.js); the element ids keep the «dtag» / «dt-» / «dtags» prefixes.
import { engine } from './deal-tags.js';
import { createTagsUi } from './object-tags-ui.js';

const ui = createTagsUi(engine, { prefix: 'dtag', short: 'dt', paneId: 'dtags', title: 'Etiquetas de Negocio', article: 'de negocio', singular: 'Negocio', plural: 'negocios', example: 'Negocios importantes' });
export const dealTagsPaneHtml = ui.paneHtml;
export const pipelineTagsHtml = ui.pipelineTagsHtml;
export const mountDealTags = ui.mount;
export const openDealTagWizard = ui.openWizard;
export const closeDealTagWizard = ui.closeWizard;
export const wizardState = ui.wizardState;
