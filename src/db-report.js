// Aviso compartido cuando una escritura a Supabase falla: antes moría en la consola mientras la interfaz ya
// había mostrado éxito. Lo usan data.js y los módulos con cola propia (plantillas, fragmentos, secuencias,
// conversaciones, correos conectados, marketing, workflows, etiquetas de negocio, ajustes de bandeja).
export function reportDbError(what, error) {
  console.error('[supabase]', what, error);
  const msg = (error && (error.message || error.details)) || String(error);
  import('./shell.js').then((m) => m.toast(`No se pudo guardar en la base de datos (${what}): ${msg}`)).catch(() => {});
}
