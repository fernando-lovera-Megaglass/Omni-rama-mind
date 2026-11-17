#!/usr/bin/env python3
"""Explorador del HubSpot real vía Chrome CDP (perfil Chrome-CDP con sesión del usuario).

Uso:
  python3 hubspot-explore.py nav <url>                 Navega la pestaña de HubSpot
  python3 hubspot-explore.py shot <ruta.png>           Captura pantalla (viewport)
  python3 hubspot-explore.py full <ruta.png>           Captura pantalla completa (full page)
  python3 hubspot-explore.py snapshot                  Extrae texto y elementos interactivos visibles
  python3 hubspot-explore.py click "<texto>"           Clic en elemento por texto visible
  python3 hubspot-explore.py clicksel "<selector>"     Clic por selector CSS
  python3 hubspot-explore.py type "<selector>" "<txt>" Escribe en un campo
  python3 hubspot-explore.py eval "<js>"               Evalúa JS y devuelve JSON
  python3 hubspot-explore.py url                       URL y título actuales
  python3 hubspot-explore.py wait <seg>                Espera y devuelve url actual

Requiere: Chrome corriendo con --remote-debugging-port=9222 (perfil Chrome-CDP).
"""
import asyncio
import base64
import json
import sys

import websockets

CDP = "http://127.0.0.1:9222"

SNAPSHOT_JS = r"""
(() => {
  const vis = el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const txt = el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const SEL = 'a, button, [role="button"], [role="menuitem"], [role="tab"], [role="dialog"], input, select, textarea, [data-test-id], summary, label';
  const deepAll = (sel) => {
    const out = [];
    const walk = (node, depth) => {
      if (depth > 8) return;
      node.querySelectorAll(sel).forEach(e => out.push(e));
      node.querySelectorAll('*').forEach(e => { if (e.shadowRoot) walk(e.shadowRoot, depth + 1); });
    };
    walk(document, 0);
    return out;
  };
  const items = [];
  deepAll(SEL).forEach(el => {
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    if (r.top > innerHeight || r.bottom < 0) return;
    items.push({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      text: txt(el),
      aria: el.getAttribute('aria-label') || '',
      href: el.getAttribute('href') || '',
      type: el.getAttribute('type') || '',
      placeholder: el.getAttribute('placeholder') || '',
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
    });
  });
  const bodyTxt = () => {
    let t = (document.body.innerText || '');
    deepAll('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]').forEach(el => { t += ' | OVERLAY: ' + (el.innerText || ''); });
    return t.replace(/\s+/g, ' ').trim().slice(0, 4000);
  };
  return JSON.stringify({
    url: location.href, title: document.title,
    h1: [...document.querySelectorAll('h1')].map(txt).filter(Boolean).slice(0,3),
    bodyText: bodyTxt(),
    elements: items.slice(0, 160),
  });
})()
"""

CLICK_JS = r"""
(() => {
  const wanted = %s;
  const vis = el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const txt = el => (el.innerText || el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
  const SEL = 'a, button, [role="button"], [role="menuitem"], [role="tab"], [role="option"], li, span, div';
  const deepAll = (sel) => {
    const out = [];
    const walk = (node, depth) => {
      if (depth > 8) return;
      node.querySelectorAll(sel).forEach(e => out.push(e));
      node.querySelectorAll('*').forEach(e => { if (e.shadowRoot) walk(e.shadowRoot, depth + 1); });
    };
    walk(document, 0);
    return out;
  };
  const cands = deepAll(SEL).filter(el => vis(el) && txt(el).toLowerCase() === wanted);
  cands.sort((a, b) => (a.querySelectorAll('*').length - b.querySelectorAll('*').length));
  if (!cands.length) return JSON.stringify({ok: false, error: 'no encontrado: ' + wanted});
  const el = cands[0];
  el.scrollIntoView({block: 'center'});
  el.click();
  return JSON.stringify({ok: true, text: txt(el).slice(0, 60), tag: el.tagName});
})()
"""


async def connect():
    import urllib.request
    with urllib.request.urlopen(CDP + "/json/list") as r:
        targets = json.load(r)
    pages = [t for t in targets if t.get("type") == "page"]
    if not pages:
        raise SystemExit("No hay pestañas en el Chrome CDP")
    # preferir la pestaña de hubspot; si no, la primera
    hub = [t for t in pages if "hubspot" in t.get("url", "").lower()]
    target = (hub or pages)[0]
    ws = await websockets.connect(target["webSocketDebuggerUrl"], max_size=50 * 1024 * 1024)
    return ws, target


class Cdp:
    def __init__(self, ws):
        self.ws = ws
        self._id = 0

    async def cmd(self, method, params=None):
        self._id += 1
        mid = self._id
        await self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(await self.ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})

    async def evaljs(self, expr):
        r = await self.cmd("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
        return r.get("result", {}).get("value")

    async def wait_load(self, secs=6):
        await asyncio.sleep(secs)


async def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 1
    action = args[0]
    ws, target = await connect()
    cdp = Cdp(ws)
    await cdp.cmd("Page.enable")
    await cdp.cmd("Runtime.enable")

    try:
        if action == "nav":
            await cdp.cmd("Page.navigate", {"url": args[1]})
            await asyncio.sleep(float(args[2]) if len(args) > 2 else 6)
            v = await cdp.evaljs("JSON.stringify({url: location.href, title: document.title})")
            print(v)
        elif action == "url":
            print(await cdp.evaljs("JSON.stringify({url: location.href, title: document.title})"))
        elif action == "wait":
            await asyncio.sleep(float(args[1]))
            print(await cdp.evaljs("JSON.stringify({url: location.href, title: document.title})"))
        elif action in ("shot", "full"):
            if action == "full":
                metrics = await cdp.cmd("Page.getLayoutMetrics")
                h = min(int(metrics["cssContentSize"]["height"]), 16000)
                await cdp.cmd("Emulation.setDeviceMetricsOverride", {
                    "width": 1440, "height": h, "deviceScaleFactor": 1, "mobile": False})
            r = await cdp.cmd("Page.captureScreenshot", {"format": "png"})
            with open(args[1], "wb") as f:
                f.write(base64.b64decode(r["data"]))
            if action == "full":
                await cdp.cmd("Emulation.clearDeviceMetricsOverride")
            print(json.dumps({"ok": True, "path": args[1]}))
        elif action == "snapshot":
            print(await cdp.evaljs(SNAPSHOT_JS))
        elif action == "clickat":
            js = CLICK_JS.replace("el.click();", "void 0;").replace(
                "return JSON.stringify({ok: true, text: txt(el).slice(0, 60), tag: el.tagName});",
                "const r2 = el.getBoundingClientRect(); return JSON.stringify({ok: true, cx: r2.x + r2.width/2, cy: r2.y + r2.height/2, text: txt(el).slice(0,60), tag: el.tagName});") % json.dumps(args[1].lower())
            res = json.loads(await cdp.evaljs(js))
            print(json.dumps(res, ensure_ascii=False))
            if res.get("ok"):
                for t in ("mousePressed", "mouseReleased"):
                    await cdp.cmd("Input.dispatchMouseEvent", {
                        "type": t, "x": res["cx"], "y": res["cy"],
                        "button": "left", "clickCount": 1})
                await asyncio.sleep(2.5)
        elif action == "click":
            print(await cdp.evaljs(CLICK_JS % json.dumps(args[1].lower())))
            await asyncio.sleep(2.5)
        elif action == "clicksel":
            js = "(() => { const el = document.querySelector(%s); if (!el) return JSON.stringify({ok:false,error:'no existe'}); el.scrollIntoView({block:'center'}); el.click(); return JSON.stringify({ok:true}); })()" % json.dumps(args[1])
            print(await cdp.evaljs(js))
            await asyncio.sleep(2.5)
        elif action == "type":
            js = """(() => { const el = document.querySelector(%s); if (!el) return JSON.stringify({ok:false});
              el.focus(); el.value = %s; el.dispatchEvent(new Event('input', {bubbles:true}));
              el.dispatchEvent(new Event('change', {bubbles:true})); return JSON.stringify({ok:true}); })()""" % (json.dumps(args[1]), json.dumps(args[2]))
            print(await cdp.evaljs(js))
        elif action == "eval":
            r = await cdp.evaljs(args[1])
            print(r if isinstance(r, str) else json.dumps(r, ensure_ascii=False))
        else:
            print("acción desconocida:", action)
            return 1
    finally:
        await ws.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
