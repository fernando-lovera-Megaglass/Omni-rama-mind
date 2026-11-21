// Circular crop of a profile picture, as the original's «Cambiar imagen»: the picture inside a round frame,
// drag to frame it, a zoom slider, Guardar → a square JPEG (256 px) drawn through a canvas. Without canvas
// support (tests) the original picture is kept as is.
const FRAME = 240;
const OUT = 256;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The square region of the picture under the frame, as a data URL (null when canvas is unavailable).
export function cropToDataUrl(img, { zoom = 1, dx = 0, dy = 0, frame = FRAME, size = OUT } = {}) {
  const nw = img && img.naturalWidth;
  const nh = img && img.naturalHeight;
  if (!nw || !nh || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  if (typeof canvas.getContext !== 'function') return null;
  let ctx = null;
  try { ctx = canvas.getContext('2d'); } catch { ctx = null; }
  if (!ctx) return null;
  canvas.width = size;
  canvas.height = size;
  const s = (frame / Math.min(nw, nh)) * zoom; // displayed pixels per picture pixel
  const left = (frame - nw * s) / 2 + dx; // where the picture's top-left sits inside the frame
  const top = (frame - nh * s) / 2 + dy;
  ctx.drawImage(img, -left / s, -top / s, frame / s, frame / s, 0, 0, size, size);
  try { return canvas.toDataURL('image/jpeg', 0.9); } catch { return null; }
}

export function openAvatarCropper(dataUrl, { onSave, onCancel } = {}) {
  const old = document.getElementById('avatar-crop');
  if (old) old.remove();
  const el = document.createElement('div');
  el.id = 'avatar-crop';
  el.className = 'bmodal is-open';
  el.setAttribute('aria-hidden', 'false');
  el.innerHTML = `<div class="bmodal__scrim" data-ac="cancel"></div>
    <div class="bmodal__panel" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title">
      <div class="bmodal__head"><h3 id="avatar-crop-title">Recortar imagen de perfil</h3><button class="bmodal__close" type="button" data-ac="cancel" aria-label="Cerrar">×</button></div>
      <div class="bmodal__body">
        <p class="muted">Arrastra la imagen para encuadrarla dentro del círculo y usa el control para acercar o alejar.</p>
        <div class="acrop"><div class="acrop__frame" id="acrop-frame"><img class="acrop__img" id="acrop-img" src="${esc(dataUrl)}" alt="" draggable="false" /></div></div>
        <label class="acrop__zoom"><span>Zoom</span><input type="range" id="avatar-zoom" min="1" max="3" step="0.01" value="1" aria-label="Zoom" /><span class="muted" id="acrop-zoom-val">1,0×</span></label>
      </div>
      <div class="bmodal__foot"><button class="btn btn--primary" type="button" data-ac="save">Guardar</button><button class="btn btn--secondary" type="button" data-ac="cancel">Cancelar</button></div>
    </div>`;
  document.body.appendChild(el);
  const img = el.querySelector('#acrop-img');
  const zoomInput = el.querySelector('#avatar-zoom');
  const state = { zoom: 1, dx: 0, dy: 0, drag: null, nw: 0, nh: 0 };
  // The picture is sized to cover the frame at zoom 1 (its shorter side equals the frame).
  const layout = () => {
    const nw = state.nw || FRAME;
    const nh = state.nh || FRAME;
    const s = (FRAME / Math.min(nw, nh)) * state.zoom;
    const w = nw * s;
    const h = nh * s;
    const maxDx = Math.max(0, (w - FRAME) / 2);
    const maxDy = Math.max(0, (h - FRAME) / 2);
    state.dx = Math.max(-maxDx, Math.min(maxDx, state.dx));
    state.dy = Math.max(-maxDy, Math.min(maxDy, state.dy));
    img.style.width = `${w}px`;
    img.style.height = `${h}px`;
    img.style.left = `${(FRAME - w) / 2 + state.dx}px`;
    img.style.top = `${(FRAME - h) / 2 + state.dy}px`;
    const z = el.querySelector('#acrop-zoom-val');
    if (z) z.textContent = `${state.zoom.toFixed(1).replace('.', ',')}×`;
  };
  const measure = () => { state.nw = img.naturalWidth || 0; state.nh = img.naturalHeight || 0; layout(); };
  if (img.complete && img.naturalWidth) measure(); else { img.addEventListener('load', measure); layout(); }
  zoomInput.addEventListener('input', () => { state.zoom = Number(zoomInput.value) || 1; layout(); });
  const frame = el.querySelector('#acrop-frame');
  frame.addEventListener('pointerdown', (e) => { state.drag = { x: e.clientX, y: e.clientY, dx: state.dx, dy: state.dy }; if (frame.setPointerCapture) { try { frame.setPointerCapture(e.pointerId); } catch { /* ignore */ } } e.preventDefault(); });
  frame.addEventListener('pointermove', (e) => { if (!state.drag) return; state.dx = state.drag.dx + (e.clientX - state.drag.x); state.dy = state.drag.dy + (e.clientY - state.drag.y); layout(); });
  const endDrag = () => { state.drag = null; };
  frame.addEventListener('pointerup', endDrag);
  frame.addEventListener('pointercancel', endDrag);
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') { close(); if (onCancel) onCancel(); } };
  document.addEventListener('keydown', onKey);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ac]');
    if (!b) return;
    if (b.dataset.ac === 'save') {
      const out = cropToDataUrl(img, { zoom: state.zoom, dx: state.dx, dy: state.dy }) || dataUrl;
      close();
      if (onSave) onSave(out, { zoom: state.zoom, dx: state.dx, dy: state.dy });
    } else { close(); if (onCancel) onCancel(); }
  });
  return { el, state, close };
}
