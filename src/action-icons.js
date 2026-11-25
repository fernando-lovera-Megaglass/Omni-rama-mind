// Minimalist line icons (24×24, 1.8px stroke, currentColor) — same stroke width everywhere.
export const ico = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
export const ACT_ICONS = {
  user: ico('<circle cx="12" cy="8" r="3.5"/><path d="M5 20v-1a7 7 0 0 1 14 0v1"/>'),
  // «Agregar persona» (aprobado por el usuario 25-nov-2026): la misma cabeza y arco de `user` más un «+».
  'user-add': ico('<circle cx="9.5" cy="8" r="3.5"/><path d="M3 20v-1a6.5 6.5 0 0 1 12-3.5"/><path d="M18.5 14v6M15.5 17h6"/>'),
  users: ico('<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2"/>'),
  thumbsUp: ico('<path d="M8 10l4-7a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2l-2 8a2 2 0 0 1-2 1H8z"/><path d="M3 10h5v10H3z"/>'),
  thumbsDown: ico('<g transform="rotate(180 12 12)"><path d="M8 10l4-7a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2l-2 8a2 2 0 0 1-2 1H8z"/><path d="M3 10h5v10H3z"/></g>'),
  copy: ico('<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>'),
  link: ico('<path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-2 2M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l2-2"/>'),
  image: ico('<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M20.5 15.5l-4.5-4.5-7 7M4 17.5l3.5-3.5 2.5 2.5"/>'),
  attach: ico('<path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7-7l8.5-8.5a3.2 3.2 0 0 1 4.5 4.5L9.6 17a1.5 1.5 0 0 1-2.1-2.1l7.5-7.5"/>'),
  expand: ico('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  shrink: ico('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  clock: ico('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  info: ico('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.01"/>'),
  alert: ico('<path d="M12 4l9 15.5H3L12 4z"/><path d="M12 10v4M12 17v.01"/>'),
  preview: ico('<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 9.5h17M8 13h8"/>'),
  bell: ico('<path d="M6 9a6 6 0 0 1 12 0v5l2 3H4l2-3zM10 20a2 2 0 0 0 4 0M12 3V2"/>'),
  megaphone: ico('<path d="M4 9h5l11-5v16L9 15H4zM9 9v6M6 15l2 6h4l-2-6"/>'),
  chat: ico('<path d="M20 15a2 2 0 0 1-2 2H9l-5 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2zM8 8h8M8 12h5"/>'),
  form: ico('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h3M8 18h5"/>'),
  swap: ico('<path d="M4 7h16l-4-4M20 17H4l4 4M20 7l-4 4M4 17l4-4"/>'),
  lightning: ico('<path d="M13 3L4 14h7l-1 7 10-12h-8l1-6z"/>'),
  delay: ico('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  goto: ico('<path d="M4 18v-6a5 5 0 0 1 5-5h11M15 2l5 5-5 5"/>'),
  // «Mapa» (aprobado por el usuario 25-nov-2026): mapa plegado en tres paneles, para direcciones y ubicación.
  map: ico('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>'),

  note: ico('<path d="M15.5 4.5l4 4L9 19H5v-4L15.5 4.5z"/><path d="M13.5 6.5l4 4"/>'),
  email: ico('<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>'),
  call: ico('<path d="M6.8 4h2.6l1.3 4-1.9 1.6a13.5 13.5 0 0 0 5.6 5.6l1.6-1.9 4 1.3v2.6a1.8 1.8 0 0 1-2 1.8C9.9 18.4 5.6 14.1 5 6a1.8 1.8 0 0 1 1.8-2z"/>'),
  inbound: ico('<path d="M18 6L6 18M6 8v10h10"/>'),
  outbound: ico('<path d="M6 18L18 6M8 6h10v10"/>'),
  task: ico('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8"/>'),
  meeting: ico('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5"/>'),
  more: ico('<circle cx="5.5" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.15" fill="currentColor" stroke="none"/>'),
  invoice: ico('<path d="M6 3.5h12V21l-2-1.4-2 1.4-2-1.4L10 21l-2-1.4L6 21V3.5z"/><path d="M9.5 8.5h5M9.5 12h5"/>'),
  quote: ico('<path d="M4 5.5h16v9H9l-5 4v-13z"/><path d="M12 8.2v.01M9.4 8.5c0-1 .9-1.8 2.6-1.8s2.6.8 2.6 1.8c0 2.1-2.6 1.9-2.6 3.4M9.5 13.7c.5.5 1.4.8 2.5.8s2-.3 2.5-.8" stroke-width="0"/>'),
  paylink: ico('<rect x="3" y="6" width="18" height="12.5" rx="2"/><path d="M3 10h18M7 14.5h4"/>'),
  contract: ico('<path d="M7 3.5h7.5L19 8v12.5H7V3.5z"/><path d="M14 3.5V8.5h4.5M9.5 12.5h5M9.5 16h5"/>'),
  sequence: ico('<path d="M4 6h10M4 12h7M4 18h10"/><path d="M15.5 9.5l4 2.5-4 2.5v-5z"/>'),
  linkedin: ico('<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 10.5V17M8 7.2v.01M12 17v-3.6c0-1.2.9-2.1 2-2.1s2 .9 2 2.1V17"/>'),
  log: ico('<path d="M5 5.5h14M5 10h14M5 14.5h8"/><path d="M15.5 16.5l3.5 3.5M19 16.5l-3.5 3.5" stroke-width="0"/><path d="M14 19.5h6"/>'),
  whatsapp: ico('<path d="M12 4a8 8 0 0 0-6.9 12L4 20l4.1-1.1A8 8 0 1 0 12 4z"/><path d="M9.5 9.2c0 3 2.3 5.3 5.3 5.3l.8-1.5-2-1-1 .7a3.6 3.6 0 0 1-1.3-1.3l.7-1-1-2-1.2.7z" stroke-width="1.2"/>'),
  sms: ico('<path d="M4 5.5h16v10H9.5L5 19v-3.5H4z" transform="translate(0 -1)"/><path d="M8 8.5h8M8 11.5h5"/>'),
  schedule: ico('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5"/><circle cx="12" cy="14.5" r="2.6"/><path d="M12 13.2v1.3l1 .7"/>'),
  // Negocio = apretón de manos (aprobado por el usuario 25-nov-2026; antes un diamante). `OBJECT_ICONS.deals` lo reutiliza.
  deal: ico('<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>'),
  ticket: ico('<path d="M4 8.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1.5a2 2 0 0 0 0 4v1.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V14a2 2 0 0 0 0-4V8.5z"/><path d="M13 7.5v1.6M13 11.2v1.6M13 14.9v1.6"/>'),
  workflow: ico('<circle cx="6" cy="6" r="2.3"/><circle cx="18" cy="6" r="2.3"/><circle cx="12" cy="18" r="2.3"/><path d="M6 8.3v3.2a3 3 0 0 0 3 3h1M18 8.3v3.2a3 3 0 0 1-3 3h-1"/>'),
  list: ico('<path d="M8.5 6.5H20M8.5 12H20M8.5 17.5H20"/><circle cx="4.8" cy="6.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="4.8" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="4.8" cy="17.5" r="1.15" fill="currentColor" stroke="none"/>'),
  created: ico('<circle cx="12" cy="12" r="8.5"/><path d="M12 8.5v7M8.5 12h7"/>'),
  stage: ico('<path d="M4 5.5h4v13H4zM10.5 5.5h4v9h-4zM17 5.5h4v5h-4z"/>'),
  prop: ico('<path d="M4 4.5h6.6L20 13.9a1.8 1.8 0 0 1 0 2.5l-5.6 5.6a1.8 1.8 0 0 1-2.5 0L2.5 12.6V4.5z" transform="translate(1 0)"/><circle cx="8" cy="9" r="1.4"/>'),
  system: ico('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8"/>'),
};

// CRM objects (Ajustes › Objetos: selector and object pages): the same line set as the side navigation
// (24×24, 1.8 stroke, currentColor, so the dark theme tints them like every other icon) instead of emoji.
export const OBJECT_ICONS = {
  contacts: ACT_ICONS.user,
  companies: ico('<path d="M4 20.5V5a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 15 5v15.5"/><path d="M15 9.5h3.5A1.5 1.5 0 0 1 20 11v9.5M3 20.5h18"/><path d="M7.5 7.5h1.5M11 7.5h1.5M7.5 11h1.5M11 11h1.5M7.5 14.5h1.5M11 14.5h1.5M9.5 20.5v-3h2.5v3"/>'),
  deals: ACT_ICONS.deal,
  tickets: ACT_ICONS.ticket,
  tasks: ACT_ICONS.task,
  products: ico('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>'),
  custom: ico('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><path d="M17 14v6M14 17h6"/>'),
};

// Property field types (Ajustes › Propiedades › Crear propiedad): one minimalist icon per kind.
export const FIELD_ICONS = {
  text: ico('<path d="M5 6.5V5h14v1.5M12 5v14M9 19h6"/>'),
  textarea: ico('<path d="M4 6h16M4 10.5h16M4 15h10M4 19.5h7"/>'),
  number: ico('<path d="M9 4.5L7.5 19.5M16.5 4.5L15 19.5M5 9.5h15M4 14.5h15"/>'),
  currency: ico('<circle cx="12" cy="12" r="8.5"/><path d="M15 9.2c-.6-.9-1.7-1.4-3-1.4-1.9 0-3.2 1-3.2 2.4 0 3.4 6.6 1.7 6.6 4.6 0 1.4-1.4 2.4-3.4 2.4-1.4 0-2.6-.6-3.2-1.5M12 6.3v11.4"/>'),
  percent: ico('<path d="M18.5 5.5l-13 13"/><circle cx="7.5" cy="7.5" r="2.3"/><circle cx="16.5" cy="16.5" r="2.3"/>'),
  date: ico('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5"/><circle cx="12" cy="14.5" r="1.15" fill="currentColor" stroke="none"/>'),
  datetime: ico('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  enum: ico('<path d="M8.5 6.5H20M8.5 12H20M8.5 17.5H20"/><path d="M4 5.2l1.4 1.4L7.5 4.5M4 10.7l1.4 1.4 2.1-2.1M4 16.2l1.4 1.4 2.1-2.1"/>'),
  bool: ico('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8"/>'),
  user: ico('<circle cx="12" cy="8.2" r="3.6"/><path d="M5 20c.8-3.6 3.7-5.4 7-5.4s7 1.8 7 5.4"/>'),
  email: ico('<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>'),
  phone: ico('<path d="M6.8 4h2.6l1.3 4-1.9 1.6a13.5 13.5 0 0 0 5.6 5.6l1.6-1.9 4 1.3v2.6a1.8 1.8 0 0 1-2 1.8C9.9 18.4 5.6 14.1 5 6a1.8 1.8 0 0 1 1.8-2z"/>'),
  url: ico('<path d="M10 14.5a4.2 4.2 0 0 0 6 .4l2.6-2.6a4.24 4.24 0 0 0-6-6l-1.4 1.4"/><path d="M14 9.5a4.2 4.2 0 0 0-6-.4l-2.6 2.6a4.24 4.24 0 0 0 6 6l1.4-1.4"/>'),
  id: ico('<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="8.3" cy="10" r="1.8"/><path d="M5.7 15.5c.4-1.8 1.4-2.7 2.6-2.7s2.2.9 2.6 2.7M14 9h5M14 12.5h5"/>'),
  stage: ico('<path d="M4 5.5h4v13H4zM10.5 5.5h4v9h-4zM17 5.5h4v5h-4z"/>'),
  status: ico('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8"/>'),
  priority: ico('<path d="M6 21V4.5M6 4.5c2-1.2 4 1.2 6 0s4-1.2 6 0V12c-2 1.2-4-1.2-6 0s-4 1.2-6 0"/>'),
  // Field types added on 25-nov-2026 (Ajustes › Propiedades): same 24×24 line style, stroke 1.8, currentColor.
  file: ico('<path d="M7 3.5h7l5 5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M14 3.5V9h5"/>'),
  calculation: ico('<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 7.5h7M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01"/>'),
  rollup: ico('<path d="M17 5.5H7.5l5 6.5-5 6.5H17"/>'),
  sync: ico('<path d="M19.5 10.5A7.5 7.5 0 0 0 6.6 7.2L4.5 9.5M4.5 4.5v5h5"/><path d="M4.5 13.5a7.5 7.5 0 0 0 12.9 3.3l2.1-2.3M19.5 19.5v-5h-5"/>'),
};
FIELD_ICONS.score = FIELD_ICONS.priority; // «Puntuación» uses the flag of «Prioridad»
