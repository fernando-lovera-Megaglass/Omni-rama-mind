// Minimalist line icons (24×24, 1.8px stroke, currentColor) — same stroke width everywhere.
export const ico = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
export const ACT_ICONS = {
  note: ico('<path d="M15.5 4.5l4 4L9 19H5v-4L15.5 4.5z"/><path d="M13.5 6.5l4 4"/>'),
  email: ico('<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>'),
  call: ico('<path d="M6.8 4h2.6l1.3 4-1.9 1.6a13.5 13.5 0 0 0 5.6 5.6l1.6-1.9 4 1.3v2.6a1.8 1.8 0 0 1-2 1.8C9.9 18.4 5.6 14.1 5 6a1.8 1.8 0 0 1 1.8-2z"/>'),
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
  schedule: ico('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5"/><circle cx="12" cy="14.5" r="2.6"/><path d="M12 13.2v1.3l1 .7"/>'),
  deal: ico('<path d="M8 12.5L3.5 8 8 3.5h8L20.5 8 16 12.5"/><path d="M8 12.5V17a3.5 3.5 0 0 0 3.5 3.5h1A3.5 3.5 0 0 0 16 17v-4.5M8 12.5h8"/>'),
  ticket: ico('<path d="M4 8.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1.5a2 2 0 0 0 0 4v1.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V14a2 2 0 0 0 0-4V8.5z"/><path d="M13 7.5v1.6M13 11.2v1.6M13 14.9v1.6"/>'),
  workflow: ico('<circle cx="6" cy="6" r="2.3"/><circle cx="18" cy="6" r="2.3"/><circle cx="12" cy="18" r="2.3"/><path d="M6 8.3v3.2a3 3 0 0 0 3 3h1M18 8.3v3.2a3 3 0 0 1-3 3h-1"/>'),
  list: ico('<path d="M8.5 6.5H20M8.5 12H20M8.5 17.5H20"/><circle cx="4.8" cy="6.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="4.8" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="4.8" cy="17.5" r="1.15" fill="currentColor" stroke="none"/>'),
};
