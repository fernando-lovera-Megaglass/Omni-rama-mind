// A failed optional demo seed must never switch a connected CRM to local storage.
let status = Object.freeze({ state: 'idle' });
export const getDemoBootstrapStatus = () => status;

export async function bootstrapDemo(client, payload) {
  try {
    const { data, error } = await client.rpc('bootstrap_demo_v1', { payload });
    if (error) throw error;
    if (typeof data !== 'boolean') throw new Error('Respuesta inválida de bootstrap_demo_v1');
    status = Object.freeze({ state: data ? 'seeded' : 'skipped' });
  } catch (error) {
    status = Object.freeze({
      state: 'failed', code: error?.code || 'BOOTSTRAP_FAILED',
      message: 'No se pudieron cargar los datos de ejemplo. La conexión a Supabase se conserva; no se ha activado el modo demo local. Revisa la migración bootstrap-demo.sql.',
    });
    console.error('[supabase] bootstrap_demo_v1:', status.message, error);
  }
  return status;
}
