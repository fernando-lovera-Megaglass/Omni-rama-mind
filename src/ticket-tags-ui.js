// Ajustes › Objetos › Tickets › Pipelines › «Etiquetas de Ticket»: the list and the three-step side panel that
// creates or edits a ticket tag. The UI is the shared one of src/object-tags-ui.js bound to the tickets engine
// (src/ticket-tags.js); the element ids carry the «ttag» / «tt-» / «ttags» prefixes.
import { engine } from './ticket-tags.js';
import { createTagsUi } from './object-tags-ui.js';

const ui = createTagsUi(engine, { prefix: 'ttag', short: 'tt', paneId: 'ttags', title: 'Etiquetas de Ticket', article: 'de ticket', singular: 'Ticket', plural: 'tickets', example: 'Clientes VIP' });
export const ticketTagsPaneHtml = ui.paneHtml;
export const ticketPipelineTagsHtml = ui.pipelineTagsHtml;
export const mountTicketTags = ui.mount;
export const openTicketTagWizard = ui.openWizard;
export const closeTicketTagWizard = ui.closeWizard;
export const ticketWizardState = ui.wizardState;
