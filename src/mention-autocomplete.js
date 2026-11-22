// «@usuario» in notes and comments (same pattern as src/snippet-autocomplete.js): typing "@" lists the account's
// users (OWNERS) with their avatar; Enter / Tab / click inserts «@Nombre ». mentionsIn(text) finds the users
// named in a saved note (full name or first name, accents ignored). Works on a textarea / input or a
// contenteditable host.
import { OWNERS, initials, colorFor } from './data.js';
import { insertAtCaret } from './tokens.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const strip = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// "@nombre" at the caret: "@" at the start or after any non-word character.
const TRIGGER = /(^|[^\p{L}\p{N}@])@([\p{L}\p{N}_.-]*)$/u;
const isField = (el) => el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';
const lastTextNode = (node) => { if (!node) return null; if (node.nodeType === 3) return node; for (let i = node.childNodes.length - 1; i >= 0; i -= 1) { const t = lastTextNode(node.childNodes[i]); if (t) return t; } return null; };
let ac = null; // { host, opts, el, items, active, trigger }

export const mentionUsers = () => OWNERS.filter((o) => o !== 'Sin asignar').map((name, i) => ({ name, first: name.split(' ')[0], id: i + 1 }));
export const matchMention = (word) => { const w = strip(word); return mentionUsers().filter((u) => !w || strip(u.name).startsWith(w) || strip(u.first).startsWith(w)); };
// The users mentioned in a text: «@Laura M.» or just «@Laura» (accents and case ignored).
export function mentionsIn(text) {
  const t = strip(text);
  return mentionUsers().filter((u) => [u.name, u.first].some((n) => { const i = t.indexOf(`@${strip(n)}`); return i >= 0 && !/[\p{L}\p{N}]/u.test(t.charAt(i + 1 + strip(n).length)); }));
}

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
  if (node.nodeType !== 3) { node = lastTextNode(node.childNodes[offset - 1] || null); if (!node) return null; offset = node.textContent.length; }
  const m = TRIGGER.exec(node.textContent.slice(0, offset));
  return m ? { word: m[2], len: m[2].length + 1, node, offset } : null;
}
export function closeMentionAutocomplete() { if (ac) { ac.el.remove(); ac = null; } }
export const mentionAutocompleteOpen = () => Boolean(ac);
function position(host) {
  const el = ac.el;
  let r = null;
  if (!isField(host)) { try { const rr = host.ownerDocument.defaultView.getSelection().getRangeAt(0).getBoundingClientRect(); if (rr && (rr.width || rr.height)) r = rr; } catch { r = null; } }
  const box = host.getBoundingClientRect();
  const top = r ? r.bottom + 4 : box.bottom + 2;
  const left = r ? r.left : box.left;
  el.style.left = `${Math.max(8, Math.min(left, (window.innerWidth || 1200) - 328))}px`;
  el.style.top = `${Math.max(8, Math.min(top, (window.innerHeight || 800) - 160))}px`;
}
function render() {
  ac.el.innerHTML = `<div class="snipac__title">Mencionar <span class="muted">· @${esc(ac.trigger.word)}</span></div>${ac.items.map((u, i) => `<button class="snipac__item mention-ac__item${i === ac.active ? ' is-active' : ''}" type="button" role="option" aria-selected="${i === ac.active}" data-mention="${esc(u.name)}"><span class="avatar avatar--sm mention-ac__avatar" style="background:${colorFor(u.id)}" aria-hidden="true">${esc(initials(u.name))}</span><span>${esc(u.name)}</span></button>`).join('')}`;
}
function update(host, opts) {
  const trigger = triggerAt(host);
  const items = trigger ? matchMention(trigger.word).slice(0, 8) : [];
  if (!trigger || !items.length) { closeMentionAutocomplete(); return; }
  if (!ac || ac.host !== host) {
    closeMentionAutocomplete();
    const el = document.createElement('div');
    el.className = 'snipac mention-ac';
    el.setAttribute('role', 'listbox');
    el.addEventListener('mousedown', (e) => { e.preventDefault(); });
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-mention]'); if (b) choose(ac.items.find((u) => u.name === b.dataset.mention)); });
    document.body.appendChild(el);
    ac = { host, opts, el, items, active: 0, trigger };
  } else { ac.items = items; ac.trigger = trigger; ac.active = Math.min(ac.active, items.length - 1); }
  render();
  position(host);
}
function choose(user) {
  if (!ac || !user) return;
  const { host, opts, trigger } = ac;
  closeMentionAutocomplete();
  const text = `@${user.name} `;
  if (isField(host)) {
    const start = trigger.pos - trigger.len;
    host.value = `${host.value.slice(0, start)}${text}${host.value.slice(trigger.pos)}`;
    const p = start + text.length;
    try { host.setSelectionRange(p, p); } catch { /* jsdom */ }
  } else {
    const doc = host.ownerDocument;
    host.focus();
    try {
      const sel = doc.defaultView.getSelection();
      const range = doc.createRange();
      range.setStart(trigger.node, trigger.offset - trigger.len);
      range.setEnd(trigger.node, trigger.offset);
      range.deleteContents();
      const node = doc.createTextNode(text);
      range.insertNode(node);
      if (sel) { range.setStartAfter(node); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); }
    } catch { insertAtCaret(host, esc(text)); }
  }
  host.dispatchEvent(new Event('input', { bubbles: true }));
  if (opts.onInsert) opts.onInsert(user);
}
export function attachMentionAutocomplete(host, opts = {}) {
  if (!host || host.dataset.mentionWired) return;
  host.dataset.mentionWired = '1';
  host.addEventListener('input', () => update(host, opts));
  host.addEventListener('keyup', (e) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) update(host, opts); });
  host.addEventListener('keydown', (e) => {
    if (!ac || ac.host !== host) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); ac.active = (ac.active + 1) % ac.items.length; render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); ac.active = (ac.active - 1 + ac.items.length) % ac.items.length; render(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(ac.items[ac.active]); }
    else if (e.key === 'Escape') { e.preventDefault(); closeMentionAutocomplete(); }
  });
  host.addEventListener('blur', () => setTimeout(() => { if (ac && ac.host === host && host.ownerDocument.activeElement !== host) closeMentionAutocomplete(); }, 150));
}
