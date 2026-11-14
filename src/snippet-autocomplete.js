// "#atajo" autocomplete for any text editor (rich-text contenteditable or textarea): typing "#" followed by a
// shortcut lists the matching snippets under the caret; choosing one replaces "#atajo" with the snippet's text,
// its personalisation tokens resolved with the given context (or kept as chips inside template editors).
import { matchShortcut } from './snippets-data.js';
import { renderTokens, insertAtCaret, plainText, markersToChips } from './tokens.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// "#atajo" at the caret: "#" at the start or after any non-word character (space, comma, bracket…).
const TRIGGER = /(^|[^\p{L}\p{N}#])#([\p{L}\p{N}_-]*)$/u;
let ac = null; // { host, opts, el, items, active, trigger }
const isField = (el) => el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';
const lastTextNode = (node) => { if (!node) return null; if (node.nodeType === 3) return node; for (let i = node.childNodes.length - 1; i >= 0; i -= 1) { const t = lastTextNode(node.childNodes[i]); if (t) return t; } return null; };

// Where "#atajo" is being typed, if it is: the word, its length including "#", and the position (field) or node + offset (rich text).
export function triggerAt(host) {
  if (isField(host)) {
    const pos = host.selectionStart ?? host.value.length;
    const m = TRIGGER.exec(host.value.slice(0, pos));
    return m ? { word: m[2], len: m[2].length + 1, pos } : null;
  }
  const sel = host.ownerDocument.defaultView.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!r.collapsed || !host.contains(r.startContainer)) return null;
  let node = r.startContainer;
  let offset = r.startOffset;
  if (node.nodeType !== 3) {
    node = lastTextNode(node.childNodes[offset - 1] || null);
    if (!node) return null;
    offset = node.textContent.length;
  }
  const m = TRIGGER.exec(node.textContent.slice(0, offset));
  return m ? { word: m[2], len: m[2].length + 1, node, offset } : null;
}
export function closeAutocomplete() { if (ac) { ac.el.remove(); ac = null; } }
export const autocompleteOpen = () => Boolean(ac);
function position(host) {
  const el = ac.el;
  let r = null;
  if (!isField(host)) { try { const range = host.ownerDocument.defaultView.getSelection().getRangeAt(0); const rr = range.getBoundingClientRect(); if (rr && (rr.width || rr.height)) r = rr; } catch { r = null; } }
  const box = host.getBoundingClientRect();
  const top = r ? r.bottom + 4 : box.bottom + 2;
  const left = r ? r.left : box.left;
  el.style.left = `${Math.max(8, Math.min(left, (window.innerWidth || 1200) - 328))}px`;
  el.style.top = `${Math.max(8, Math.min(top, (window.innerHeight || 800) - 160))}px`;
}
function render() {
  ac.el.innerHTML = `<div class="snipac__title">Fragmentos <span class="muted">· #${esc(ac.trigger.word)}</span></div>${ac.items.map((s, i) => `<button class="snipac__item${i === ac.active ? ' is-active' : ''}" type="button" role="option" aria-selected="${i === ac.active}" data-snip="${esc(s.id)}"><strong>#${esc(s.shortcut)}</strong><span>${esc(s.name)}</span></button>`).join('')}`;
}
function update(host, opts) {
  const trigger = triggerAt(host);
  const items = trigger ? matchShortcut(trigger.word).slice(0, 8) : [];
  if (!trigger || !items.length) { closeAutocomplete(); return; }
  if (!ac || ac.host !== host) {
    closeAutocomplete();
    const el = document.createElement('div');
    el.className = 'snipac';
    el.setAttribute('role', 'listbox');
    el.addEventListener('mousedown', (e) => { e.preventDefault(); });
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-snip]'); if (b) choose(ac.items.find((s) => s.id === b.dataset.snip)); });
    document.body.appendChild(el);
    ac = { host, opts, el, items, active: 0, trigger };
  } else { ac.items = items; ac.trigger = trigger; ac.active = Math.min(ac.active, items.length - 1); }
  render();
  position(host);
}
function choose(snippet) {
  if (!ac || !snippet) return;
  const { host, opts, trigger } = ac;
  closeAutocomplete();
  const html = opts.resolve === false ? markersToChips(snippet.body) : renderTokens(snippet.body, opts.context ? opts.context() : {});
  if (isField(host)) {
    const text = plainText(html);
    const start = trigger.pos - trigger.len;
    host.value = `${host.value.slice(0, start)}${text}${host.value.slice(trigger.pos)}`;
    const p = start + text.length;
    try { host.setSelectionRange(p, p); } catch { /* jsdom */ }
  } else {
    // Replace the typed "#atajo" (the text node and offsets found at trigger time) and leave the caret after it.
    const doc = host.ownerDocument;
    host.focus();
    try {
      const sel = doc.defaultView.getSelection();
      const range = doc.createRange();
      range.setStart(trigger.node, trigger.offset - trigger.len);
      range.setEnd(trigger.node, trigger.offset);
      range.deleteContents();
      const frag = range.createContextualFragment(`${html} `);
      const last = frag.lastChild;
      range.insertNode(frag);
      if (last && sel) { range.setStartAfter(last); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); }
    } catch { insertAtCaret(host, `${html} `); }
  }
  host.dispatchEvent(new Event('input', { bubbles: true }));
  if (opts.onInsert) opts.onInsert(snippet);
}
// opts.context(): the records the tokens read from; opts.resolve === false keeps the tokens as chips (template editors).
export function attachSnippetAutocomplete(host, opts = {}) {
  if (!host || host.dataset.snipWired) return;
  host.dataset.snipWired = '1';
  host.addEventListener('input', () => update(host, opts));
  host.addEventListener('keyup', (e) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) update(host, opts); });
  host.addEventListener('keydown', (e) => {
    if (!ac || ac.host !== host) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); ac.active = (ac.active + 1) % ac.items.length; render(); } else if (e.key === 'ArrowUp') { e.preventDefault(); ac.active = (ac.active - 1 + ac.items.length) % ac.items.length; render(); } else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(ac.items[ac.active]); } else if (e.key === 'Escape') { e.preventDefault(); closeAutocomplete(); }
  });
  host.addEventListener('blur', () => setTimeout(() => { if (ac && ac.host === host && host.ownerDocument.activeElement !== host) closeAutocomplete(); }, 150));
}
