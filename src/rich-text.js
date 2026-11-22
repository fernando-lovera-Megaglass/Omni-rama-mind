// Minimal safe rich text for the inbox reply editor: a whitelist sanitiser (bold, italic, underline, lists,
// links, paragraphs, line breaks — everything else is unwrapped to its text, scripts and the like dropped),
// HTML → plain text, and the formatting fallbacks the editor uses where document.execCommand is missing.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SAFE = new Set(['B', 'I', 'STRONG', 'EM', 'U', 'UL', 'OL', 'LI', 'A', 'BR', 'P']);
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'SVG', 'MATH', 'TEXTAREA', 'INPUT', 'SELECT', 'BUTTON', 'FORM']);
const SAFE_HREF = /^(https?:|mailto:|tel:|\.\.?\/|\/|#)/i;
const TAG_RE = /<\/?(b|i|strong|em|u|ul|ol|li|a|br|p|div)\b[^>]*>/i;

// True when the text carries (rich) markup rather than plain text.
export const isHtml = (s) => TAG_RE.test(String(s || ''));

// Only the whitelist survives, with a safe href on links; <div> lines (what contenteditable produces) become <p>.
export function sanitizeHtml(html) {
  const doc = document;
  const tpl = doc.createElement('template');
  tpl.innerHTML = String(html || '');
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) return;
      if (child.nodeType !== 1) { child.remove(); return; }
      const tag = child.tagName;
      if (DROP.has(tag)) { child.remove(); return; }
      if (tag === 'DIV') { const p = doc.createElement('p'); while (child.firstChild) p.appendChild(child.firstChild); child.replaceWith(p); walk(p); return; }
      if (!SAFE.has(tag)) { walk(child); const frag = doc.createDocumentFragment(); while (child.firstChild) frag.appendChild(child.firstChild); child.replaceWith(frag); return; }
      [...child.attributes].forEach((a) => { if (!(tag === 'A' && a.name === 'href')) child.removeAttribute(a.name); });
      if (tag === 'A') {
        const href = String(child.getAttribute('href') || '').trim();
        if (!SAFE_HREF.test(href)) child.removeAttribute('href');
        else { child.setAttribute('href', href); if (/^https?:/i.test(href)) { child.setAttribute('rel', 'noopener'); child.setAttribute('target', '_blank'); } }
      }
      walk(child);
    });
  };
  walk(tpl.content);
  return tpl.innerHTML.replace(/^(\s|<br>|<p><\/p>)+|(\s|<br>|<p><\/p>)+$/g, '').trim();
}
// Plain text of rich HTML (paragraphs and line breaks become newlines, entities decoded).
export function htmlToText(html) {
  const t = document.createElement('textarea');
  t.innerHTML = String(html || '').replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  return t.value.replace(/\n{3,}/g, '\n\n').trim();
}
// A stored message body as HTML for the thread: plain text escaped with its line breaks, rich text sanitised.
export const messageHtml = (body) => (isHtml(body) ? sanitizeHtml(body) : esc(body).replace(/\n/g, '<br>'));
// A stored message body as plain text (previews, timeline, the e-mail's text part).
export const messageText = (body) => (isHtml(body) ? htmlToText(body) : String(body || ''));
// Plain text typed as a reply (or pasted) → safe HTML paragraphs.
export const textToHtml = (text) => String(text || '').split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

// ---- the editor's formatting without execCommand (jsdom, locked-down browsers): wrap the selection ----
const selectionIn = (editor) => {
  const sel = editor.ownerDocument.defaultView.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  return editor.contains(r.commonAncestorContainer) ? r : null;
};
export function wrapSelection(editor, tag, attrs = {}) {
  const r = selectionIn(editor);
  if (!r || r.collapsed) return false;
  const el = editor.ownerDocument.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  try { el.appendChild(r.extractContents()); r.insertNode(el); } catch { return false; }
  const sel = editor.ownerDocument.defaultView.getSelection();
  if (sel) { sel.removeAllRanges(); const nr = editor.ownerDocument.createRange(); nr.selectNodeContents(el); sel.addRange(nr); }
  return true;
}
// The editor's command: execCommand where the browser has it, the wrap fallback otherwise.
export function format(editor, cmd) {
  editor.focus();
  const doc = editor.ownerDocument;
  if (typeof doc.execCommand === 'function') { try { if (doc.execCommand(cmd, false, null)) return true; } catch { /* fallback */ } }
  if (cmd === 'bold') return wrapSelection(editor, 'b');
  if (cmd === 'italic') return wrapSelection(editor, 'i');
  if (cmd === 'underline') return wrapSelection(editor, 'u');
  if (cmd === 'insertUnorderedList') {
    const r = selectionIn(editor);
    const ul = doc.createElement('ul');
    const li = doc.createElement('li');
    if (r && !r.collapsed) li.appendChild(r.extractContents()); else li.textContent = '';
    ul.appendChild(li);
    if (r) r.insertNode(ul); else editor.appendChild(ul);
    return true;
  }
  return false;
}
