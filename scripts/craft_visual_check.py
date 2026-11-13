#!/usr/bin/env python3
"""Verificación visual Omni CRM vs HubSpot usando Craft Anything vía MCP (stdio).

Abre el preview local del build, lo captura a los anchos 1440/768/390 y compara
pixel por pixel contra las capturas del HubSpot original guardadas por
Craft Anything en capture/screenshot-<ancho>.png.

Uso: python3 craft_visual_check.py [url|auto] [proyecto]
Con url "auto" compila (npm run build) y sirve dist/ en un puerto local temporal.
Salida: JSON con similarity (0-100) y detalle por ancho.
"""
import json
import subprocess
import sys
import tempfile
import os
import time

CLI = "/Applications/Craft Anything.app/Contents/MacOS/craft-anything-cli"
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:7100/"
PROJECT = sys.argv[2] if len(sys.argv) > 2 else "/Users/fernandolovera/Documents/Craft Anything/app-hubspot-com"
APP = os.path.join(PROJECT, "app")
WIDTHS = [1440, 768, 390]


class Mcp:
    def __init__(self):
        self.proc = subprocess.Popen(
            [CLI, "mcp"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, text=True, bufsize=1)
        self._id = 0

    def _send(self, method, params=None):
        self._id += 1
        msg = {"jsonrpc": "2.0", "id": self._id, "method": method}
        if params is not None:
            msg["params"] = params
        self.proc.stdin.write(json.dumps(msg) + "\n")
        self.proc.stdin.flush()
        while True:
            line = self.proc.stdout.readline()
            if not line:
                raise RuntimeError("MCP: conexión cerrada")
            resp = json.loads(line)
            if resp.get("id") == self._id:
                return resp

    def _notify(self, method, params=None):
        msg = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            msg["params"] = params
        self.proc.stdin.write(json.dumps(msg) + "\n")
        self.proc.stdin.flush()

    def call(self, tool, args):
        resp = self._send("tools/call", {"name": tool, "arguments": args})
        if "error" in resp:
            return {"error": resp["error"]}
        content = resp.get("result", {}).get("content", [])
        text = "".join(c.get("text", "") for c in content if c.get("type") == "text")
        try:
            return json.loads(text)
        except Exception:
            return {"raw": text[:2000]}

    def close(self):
        try:
            self.proc.stdin.close()
            self.proc.terminate()
        except Exception:
            pass


def main():
    server = None
    url = URL
    if url == "auto":
        build = subprocess.run(["npm", "run", "build"], cwd=APP,
                               capture_output=True, text=True, timeout=180)
        if build.returncode != 0:
            print(json.dumps({"ok": False, "step": "build", "error": build.stderr[-800:]}))
            return 1
        import http.server
        import functools
        import socketserver
        import threading
        handler = functools.partial(http.server.SimpleHTTPRequestHandler,
                                    directory=os.path.join(APP, "dist"))
        server = socketserver.TCPServer(("127.0.0.1", 0), handler)
        port = server.server_address[1]
        threading.Thread(target=server.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{port}/"

    mcp = Mcp()
    mcp._send("initialize", {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "omni-visual-check", "version": "1.0"},
    })
    mcp._notify("notifications/initialized")

    outdir = os.path.join(tempfile.mkdtemp(prefix="omni-check-"), "capture")
    r = mcp.call("web_site_open", {"url": url, "width": 1440, "height": 900, "headless": True})
    if "error" in r:
        print(json.dumps({"ok": False, "step": "open", "error": r["error"]}))
        mcp.close()
        return 1

    r = mcp.call("web_site_capture", {
        "output_directory": outdir, "widths": WIDTHS, "timeout_secs": 60,
    })
    if "error" in r:
        print(json.dumps({"ok": False, "step": "capture", "error": r["error"]}))
        mcp.close()
        return 1
    mcp.call("web_site_close", {})
    mcp.close()

    # Comparación pixel por pixel local (PIL) contra las capturas de referencia
    # del HubSpot original guardadas por Craft Anything en capture/.
    from PIL import Image, ImageChops

    TOL = 16
    results = []
    for w in WIDTHS:
        new_png = os.path.join(outdir, f"screenshot-{w}.png")
        ref_png = os.path.join(PROJECT, "capture", f"screenshot-{w}.png")
        if not (os.path.exists(new_png) and os.path.exists(ref_png)):
            results.append({"width": w, "skipped": True})
            continue
        a = Image.open(ref_png).convert("RGB")
        b = Image.open(new_png).convert("RGB")
        if a.size != b.size:
            # recortar al área común
            cw, ch = min(a.width, b.width), min(a.height, b.height)
            a, b = a.crop((0, 0, cw, ch)), b.crop((0, 0, cw, ch))
        diff = ImageChops.difference(a, b)
        px = list(diff.getdata())
        changed = sum(1 for p in px if max(p) > TOL)
        frac = changed / len(px) if px else 0.0
        results.append({
            "width": w,
            "similarity": round((1 - frac) * 100, 1),
            "comparable": True,
        })

    vals = [r["similarity"] for r in results if r.get("similarity") is not None]
    overall = round(sum(vals) / len(vals), 1) if vals else None
    if server:
        server.shutdown()
    print(json.dumps({"ok": True, "overallSimilarity": overall, "byWidth": results, "captureDir": outdir},
                     ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
