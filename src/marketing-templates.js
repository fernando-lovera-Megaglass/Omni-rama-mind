// Marketing e-mail building blocks: the Megaglass brand kit, the editor's modules and sections, the base
// templates and the HTML renderer (header with the wordmark, modules, automatic footer).
export const BRAND = {
  name: 'Megaglass',
  primary: '#0b3b5c',
  accent: '#ff7a59',
  light: '#f5f8fa',
  text: '#33475b',
  muted: '#7c98b6',
  address: 'Megaglass · Av. de la Industria 120, Monterrey, N.L., México',
  site: 'https://www.megaglass.example',
};
const uid = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const MODULE_DEFS = {
  text: { label: 'Texto', group: 'Base', icon: '¶', defaults: { html: '<p>Escribe aquí tu texto.</p>' } },
  button: { label: 'Botón', group: 'Base', icon: '▭', defaults: { label: 'Más información', url: 'https://', align: 'center' } },
  social: { label: 'Redes sociales', group: 'Base', icon: '◎', defaults: { facebook: 'https://facebook.com/', instagram: 'https://instagram.com/', linkedin: 'https://linkedin.com/' } },
  html: { label: 'HTML', group: 'Base', icon: '<>', defaults: { code: '<p style="margin:0">Bloque HTML personalizado</p>' } },
  image: { label: 'Imagen', group: 'Medios', icon: '▣', defaults: { src: '', alt: 'Imagen', width: 100 } },
  video: { label: 'Video', group: 'Medios', icon: '▶', defaults: { url: '', caption: 'Ver el video' } },
  divider: { label: 'Divisor', group: 'Estructura', icon: '—', defaults: {} },
};
export const MODULE_GROUPS = ['Base', 'Medios', 'Estructura'];
export const newModule = (type, props = {}) => ({ id: uid(), type, props: { ...(MODULE_DEFS[type] ? MODULE_DEFS[type].defaults : {}), ...props } });
export const cloneModules = (mods) => (mods || []).map((m) => ({ id: uid(), type: m.type, props: { ...m.props } }));
// Sections: several modules dropped at once.
export const SECTIONS = [
  { id: 'hero', label: 'Encabezado: título y texto', build: () => [newModule('text', { html: '<h1>Título del correo</h1><p>Una frase que resuma la noticia o la oferta.</p>' })] },
  { id: 'text-button', label: 'Texto + botón', build: () => [newModule('text', { html: '<p>Cuenta en dos o tres líneas por qué merece la pena hacer clic.</p>' }), newModule('button', { label: 'Ver más', url: 'https://' })] },
  { id: 'image-text', label: 'Imagen + texto', build: () => [newModule('image', { alt: 'Proyecto destacado' }), newModule('text', { html: '<h2>Proyecto destacado</h2><p>Describe el proyecto, el producto o la instalación.</p>' })] },
  { id: 'footer-social', label: 'Divisor + redes sociales', build: () => [newModule('divider'), newModule('social')] },
];
export const TEMPLATE_CATEGORIES = ['Guardadas', 'Boletín informativo', 'Evento', 'Saludo', 'Promoción', 'Texto sin formato'];
export const TEMPLATES = [
  { id: 'newsletter', nombre: 'Boletín mensual Megaglass', categoria: 'Boletín informativo', descripcion: 'Cabecera con la marca, titular, dos noticias y botón al catálogo.', header: true, modules: () => [
    newModule('text', { html: '<h1>Novedades del mes</h1><p>Lo más destacado de Megaglass en vidrio, aluminio e instalaciones.</p>' }),
    newModule('divider'),
    newModule('text', { html: '<h2>Noticia 1</h2><p>Resumen breve de la primera noticia.</p>' }),
    newModule('text', { html: '<h2>Noticia 2</h2><p>Resumen breve de la segunda noticia.</p>' }),
    newModule('button', { label: 'Ver catálogo', url: BRAND.site }),
    newModule('social'),
  ] },
  { id: 'event', nombre: 'Invitación a evento', categoria: 'Evento', descripcion: 'Título, fecha y lugar, descripción y botón para reservar plaza.', header: true, modules: () => [
    newModule('text', { html: '<h1>Jornada técnica para instaladores</h1><p><strong>Fecha:</strong> por definir · <strong>Lugar:</strong> Planta Monterrey</p>' }),
    newModule('image', { alt: 'Imagen del evento' }),
    newModule('text', { html: '<p>Demostraciones de producto, novedades en herrajes y una visita guiada a la planta. Cupo limitado.</p>' }),
    newModule('button', { label: 'Reservar plaza', url: BRAND.site }),
  ] },
  { id: 'greeting', nombre: 'Saludo de temporada', categoria: 'Saludo', descripcion: 'Mensaje breve y cálido con la marca, sin botones.', header: true, modules: () => [
    newModule('text', { html: '<h1>¡Gracias por este año!</h1><p>De parte de todo el equipo de Megaglass, te deseamos unas felices fiestas y un gran comienzo de año.</p>' }),
    newModule('divider'),
    newModule('social'),
  ] },
  { id: 'promo', nombre: 'Promoción con oferta', categoria: 'Promoción', descripcion: 'Oferta destacada, condiciones y botón de contacto.', header: true, modules: () => [
    newModule('text', { html: '<h1>15 % de descuento en fachadas de vidrio</h1><p>Hasta fin de mes en proyectos de obra nueva.</p>' }),
    newModule('button', { label: 'Solicitar presupuesto', url: BRAND.site }),
    newModule('text', { html: '<p style="font-size:12px;color:#7c98b6">Condiciones: aplicable a presupuestos aceptados antes de fin de mes.</p>' }),
  ] },
  { id: 'welcome', nombre: 'Bienvenida a nuevos clientes', categoria: 'Saludo', descripcion: 'Presentación de la empresa y enlaces útiles para empezar.', header: true, modules: () => [
    newModule('text', { html: '<h1>Bienvenido a Megaglass</h1><p>Fabricamos e instalamos vidrio y aluminio para proyectos residenciales y comerciales. Estos enlaces te ayudarán a empezar.</p>' }),
    newModule('button', { label: 'Conoce nuestros productos', url: BRAND.site }),
    newModule('text', { html: '<p>¿Dudas? Responde a este correo y tu asesor te atenderá.</p>' }),
  ] },
  { id: 'plain', nombre: 'Texto sin formato', categoria: 'Texto sin formato', descripcion: 'Solo texto, como un correo personal, sin cabecera ni colores.', header: false, modules: () => [
    newModule('text', { html: '<p>Hola,</p><p>Te escribo para contarte…</p><p>Un saludo,<br>El equipo de Megaglass</p>' }),
  ] },
];
export const templateById = (id) => TEMPLATES.find((t) => t.id === id) || null;

// ---------- rendering ----------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Text modules accept simple HTML; everything else is escaped.
export function moduleHtml(m) {
  const p = m.props || {};
  switch (m.type) {
    case 'text': return `<div style="font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:${BRAND.text};padding:12px 24px">${p.html || ''}</div>`;
    case 'button': return `<div style="padding:12px 24px;text-align:${esc(p.align || 'center')}"><a href="${esc(p.url || '#')}" style="display:inline-block;padding:12px 24px;border-radius:4px;background:${BRAND.accent};color:#fff;font-family:Helvetica,Arial,sans-serif;font-weight:600;text-decoration:none">${esc(p.label || 'Botón')}</a></div>`;
    case 'social': return `<div style="padding:12px 24px;text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:13px">${['facebook', 'instagram', 'linkedin'].filter((k) => p[k]).map((k) => `<a href="${esc(p[k])}" style="margin:0 8px;color:${BRAND.primary};text-decoration:none">${k[0].toUpperCase() + k.slice(1)}</a>`).join('') || '<span style="color:#7c98b6">Redes sociales</span>'}</div>`;
    case 'html': return `<div style="padding:12px 24px">${p.code || ''}</div>`;
    case 'image': return `<div style="padding:12px 24px;text-align:center">${p.src ? `<img src="${esc(p.src)}" alt="${esc(p.alt || '')}" style="max-width:${Number(p.width) || 100}%;height:auto;border-radius:4px" />` : `<div style="background:#eaf0f6;color:#7c98b6;padding:40px;border-radius:4px;font-family:Helvetica,Arial,sans-serif">${esc(p.alt || 'Imagen')}</div>`}</div>`;
    case 'video': return `<div style="padding:12px 24px;text-align:center;font-family:Helvetica,Arial,sans-serif"><a href="${esc(p.url || '#')}" style="display:block;background:#0b3b5c;color:#fff;padding:48px 16px;border-radius:4px;text-decoration:none">▶ ${esc(p.caption || 'Ver el video')}</a></div>`;
    case 'divider': return '<div style="padding:8px 24px"><hr style="border:0;border-top:1px solid #dfe3eb;margin:0" /></div>';
    default: return '';
  }
}
export function renderEmailHtml(email) {
  const header = email.plantilla === 'plain' ? '' : `<tr><td style="background:${BRAND.primary};padding:20px 24px;text-align:center"><span style="display:inline-block;color:#fff;font-family:Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;letter-spacing:.18em">MEGAGLASS</span></td></tr>`;
  const body = (email.contenido || []).map((m) => `<tr><td>${moduleHtml(m)}</td></tr>`).join('');
  const footer = `<tr><td style="background:${BRAND.light};padding:16px 24px;text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${BRAND.muted}">${esc(BRAND.address)}<br /><a href="#unsubscribe" style="color:${BRAND.muted}">Darme de baja</a> · <a href="#preferences" style="color:${BRAND.muted}">Gestionar preferencias</a></td></tr>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8" /><title>${esc(email.asunto || email.nombre || 'Correo')}</title></head><body style="margin:0;background:#eef2f6;padding:24px"><table role="presentation" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;margin:0 auto;background:#fff;border-radius:6px;overflow:hidden">${header}${body || '<tr><td style="padding:40px;text-align:center;color:#7c98b6;font-family:Helvetica,Arial,sans-serif">Sin contenido todavía</td></tr>'}${footer}</table></body></html>`;
}
