import { authEnabled, mfaStatus, enrollTotp, verifyTotp, disableTotp, cancelTotp, authMessage } from './auth.js';

export const ssoUnavailable = '<label class="srow"><span><strong>Inicio de sesión único (SSO)</strong><small>Próximamente · No hay un proveedor configurado.</small></span><input type="checkbox" class="switch" disabled aria-label="SSO: próximamente" /></label>';

export async function mountMfaSettings(root) {
  let pending = null;
  let status;
  let busy = false;
  const draw = (message = '') => {
    root.innerHTML = '<h3>Autenticación en dos pasos (TOTP)</h3><p data-status role="status"></p><div data-controls></div><p data-error role="alert"></p>';
    root.querySelector('[data-status]').textContent = status ? (status.active ? 'Activo' : 'Inactivo') : 'Consultando estado…';
    root.querySelector('[data-error]').textContent = message;
    const controls = root.querySelector('[data-controls]');
    if (!status) { controls.innerHTML = '<button type="button" data-action="reload">Reintentar</button>'; return; }
    if (pending) {
      controls.innerHTML = '<p>Escanea el QR con tu aplicación de autenticación y verifica el primer código.</p><img alt="QR de alta TOTP" width="200" height="200"><p><a data-uri>Configurar con URL otpauth</a></p><form><label>Código de 6 dígitos <input name="code" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required></label><button>Verificar y activar</button><button type="button" data-action="cancel">Cancelar</button></form>';
      const qr = pending.totp.qr_code;
      controls.querySelector('img').src = qr.startsWith('data:image/') ? qr : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`;
      controls.querySelector('[data-uri]').href = pending.totp.uri;
    } else if (status.active) {
      controls.innerHTML = '<form><label>Código de tu aplicación para desactivar <input name="code" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required></label><button>Desactivar</button></form>';
    } else controls.innerHTML = '<button type="button" data-action="enroll">Activar autenticación en dos pasos</button>';
  };
  const run = async (fn) => {
    if (busy) return;
    busy = true;
    root.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try { await fn(); draw(); } catch (err) { draw(authMessage(err)); }
    finally { busy = false; }
  };
  if (!authEnabled()) { root.textContent = 'MFA no disponible sin conexión con Supabase.'; return; }
  root.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    void run(async () => {
      if (action === 'enroll') pending = await enrollTotp();
      if (action === 'cancel') { await cancelTotp(pending.id); pending = null; }
      if (action === 'reload') status = await mfaStatus();
    });
  });
  root.addEventListener('submit', (e) => {
    e.preventDefault(); e.stopPropagation();
    const code = new FormData(e.target).get('code');
    void run(async () => {
      if (pending) { await verifyTotp(pending.id, code); pending = null; }
      else await disableTotp(status.factors[0].id, code);
      status = await mfaStatus();
    });
  });
  draw();
  await run(async () => { status = await mfaStatus(); });
}
