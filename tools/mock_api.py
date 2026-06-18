#!/usr/bin/env python3
"""Dev test double for the Ellery API.

Implements the SAME HTTP contract as server/server.js (sessions, tier
enforcement, ingest caps, sandbox checkout, gated layout delivery, export
gating) so the frontend can be developed and verified on machines without
Node. The Express server is the real implementation — keep the two in sync
when the contract changes.

Usage: python3 tools/mock_api.py [port]
"""
import csv
import io
import json
import os
import re
import secrets
import sys
import time
from datetime import datetime
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
GATED = os.path.join(ROOT, "server", "gated")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4173

FREE_ROW_CAP = 150
GATED_FILES = {"map.js", "simulation.js"}
TEST_CARD = "4242424242424242"
HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")

SESSIONS = {}  # sid -> {"tier": "free"|"pro"}


def limits_for(tier):
    pro = tier == "pro"
    return {
        "tier": tier,
        "price": 12.99,
        "maxRows": None if pro else FREE_ROW_CAP,
        "layouts": ["kinetic", "timeline", "cards", "nodes", "map"] if pro else ["kinetic", "timeline", "cards", "nodes"],
        "watermark": not pro,
        "export": pro,
        "simulation": pro,
    }


# ---------- ingestion (mirrors server/ingest/*.js closely enough for dev) ----------

# ---------- intelligent nested JSON (mirrors server/ingest/parsers.js) ----------

MAX_DEPTH = 6
MAX_FIELDS = 64


def is_primitive(v):
    return v is None or not isinstance(v, (dict, list))


def leaf_string(v):
    if is_primitive(v):
        return "" if v is None else v
    s = json.dumps(v)
    return s if len(s) <= 120 else s[:117] + "…"


def flatten_deep(node, prefix="", depth=0, out=None):
    if out is None:
        out = {}
    if len(out) >= MAX_FIELDS:
        return out
    if depth >= MAX_DEPTH:
        out[prefix or "value"] = leaf_string(node)
        return out
    if isinstance(node, list):
        for i, item in enumerate(node):
            key = f"{prefix}[{i}]"
            if is_primitive(item):
                if len(out) < MAX_FIELDS:
                    out[key] = item
            else:
                flatten_deep(item, key, depth + 1, out)
        return out
    if isinstance(node, dict):
        for k, v in node.items():
            key = f"{prefix}.{k}" if prefix else k
            if is_primitive(v):
                if len(out) < MAX_FIELDS:
                    out[key] = v
            else:
                flatten_deep(v, key, depth + 1, out)
        return out
    out[prefix or "value"] = leaf_string(node)
    return out


def hierarchy_rows(data):
    rows = []

    def walk(node, path, branch, depth):
        if len(rows) >= 400:
            return
        if depth >= MAX_DEPTH or is_primitive(node):
            rows.append({"branch": branch, "path": path,
                         "value": node if is_primitive(node) else leaf_string(node)})
            return
        if isinstance(node, list):
            for i, item in enumerate(node):
                walk(item, f"{path}[{i}]", branch, depth + 1)
            return
        for k, v in node.items():
            walk(v, f"{path}.{k}" if path else k, branch or k, depth + 1)

    for k, v in data.items():
        walk(v, k, k, 0)
    return rows


def json_rows(data):
    if isinstance(data, dict):
        keys = list(data.keys())
        if keys and all(isinstance(data[k], list) and all(is_primitive(x) for x in data[k]) for k in keys):
            length = max(len(data[k]) for k in keys)
            return [{k: (data[k][i] if i < len(data[k]) else None) for k in keys} for i in range(length)]
        arr_key = next((k for k in keys if isinstance(data[k], list) and len(data[k]) > 1
                        and any(isinstance(x, dict) for x in data[k])), None)
        if arr_key and all(k == arr_key or is_primitive(data[k]) for k in keys):
            data = data[arr_key]
    if isinstance(data, list):
        return [flatten_deep(d) if isinstance(d, (dict, list)) else {"value": d} for d in data]
    if isinstance(data, dict):
        rows = hierarchy_rows(data)
        if rows:
            return rows
    return [{"value": leaf_string(data)}]


NUM_RE = re.compile(r"^[-+]?[$€£]?\s?\d[\d,]*\.?\d*\s?%?$")
DATE_RES = [
    re.compile(r"^\d{4}-\d{2}-\d{2}"),
    re.compile(r"^\d{1,2}/\d{1,2}/\d{2,4}$"),
]
BOOL_RE = re.compile(r"^(true|false|yes|no)$", re.I)


def value_type(v):
    if v is None or v == "":
        return "empty"
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, (int, float)):
        return "number"
    s = str(v).strip()
    if not s:
        return "empty"
    if NUM_RE.match(s):
        return "number"
    if BOOL_RE.match(s):
        return "boolean"
    if any(r.match(s) for r in DATE_RES):
        return "date"
    return "string"


def pretty_label(key):
    s = re.sub(r"[_.\-]+", " ", key)
    s = re.sub(r"([a-z])([A-Z])", r"\1 \2", s)
    return " ".join(w[:1].upper() + w[1:] for w in s.split())


def coerce(v, t):
    if v is None:
        return None
    if t == "number":
        if isinstance(v, (int, float)):
            return v
        try:
            return float(re.sub(r"[$€£,%\s]", "", str(v)))
        except ValueError:
            return None
    if t == "boolean":
        if isinstance(v, bool):
            return v
        return bool(re.match(r"^(true|yes)$", str(v).strip(), re.I))
    return str(v)


def sniff_delimiter(raw):
    lines = [l for l in raw.splitlines() if l.strip()][:40]
    best, best_score = None, 0
    for d in [",", "\t", ";", "|"]:
        counts = [l.count(d) for l in lines]
        with_d = sum(1 for c in counts if c > 0)
        if with_d < max(1, len(lines) * 0.7):
            continue
        mode = max(set(c for c in counts if c > 0), key=counts.count, default=0)
        score = (sum(1 for c in counts if c == mode) / len(lines)) * 10 + mode
        if score > best_score:
            best, best_score = d, score
    return best


def ingest(raw, cap):
    warnings = []
    raw = raw.strip()
    if not raw:
        return {"ok": False, "dataset": None, "warnings": ["Nothing to ingest — paste some data first."]}

    rows = None
    fmt = "text"

    if raw[:1] in "[{":
        try:
            data = json.loads(raw)
            fmt = "json"
            rows = json_rows(data)
        except (json.JSONDecodeError, ValueError):
            pass

    if rows is None:
        delim = sniff_delimiter(raw)
        if delim:
            fmt = "csv"
            parsed = list(csv.reader(io.StringIO(raw), delimiter=delim))
            parsed = [r for r in parsed if any(c.strip() for c in r)]
            if len(parsed) >= 2:
                width = max(set(len(r) for r in parsed), key=[len(r) for r in parsed].count)
                fixed = 0
                shaped = []
                for r in parsed:
                    if len(r) != width:
                        fixed += 1
                        r = (r + [""] * width)[:width]
                    shaped.append([c.strip() for c in r])
                if fixed:
                    warnings.append(f"{fixed} ragged row{'s' if fixed > 1 else ''} repaired to {width} columns.")
                header = shaped[0]
                body = shaped[1:]
                has_header = all(value_type(c) == "string" and c.strip() for c in header) and any(
                    sum(1 for r in body[:20] if value_type(r[i]) in ("number", "date")) >= len(body[:20]) * 0.6
                    for i in range(width)
                )
                if has_header:
                    keys = [h.strip() or f"col_{i+1}" for i, h in enumerate(header)]
                else:
                    keys = [f"col_{i+1}" for i in range(width)]
                    body = shaped
                    warnings.append("No header row detected — generated column names.")
                rows = [dict(zip(keys, r)) for r in body]

    if rows is None:
        fmt = "text"
        warnings.append("Unstructured text — each line became a story beat.")
        segs = [s.strip() for s in raw.splitlines() if s.strip()]
        if len(segs) <= 1:
            segs = [s.strip() for s in re.split(r"(?<=[.!?])\s+", raw) if s.strip()]
        rows = []
        for i, text in enumerate(segs):
            num = re.search(r"-?[$€£]?\d[\d,]*\.?\d*%?", text)
            date = re.search(r"\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4}", text)
            rows.append({"beat": i + 1, "text": text, "value": num.group(0) if num else "", "date": date.group(0) if date else ""})

    if not rows:
        return {"ok": False, "dataset": None, "warnings": ["No usable rows found in that input."]}

    keys = []
    for r in rows[:50]:
        for k in r:
            if k not in keys:
                keys.append(k)
    columns = []
    for k in keys:
        sample = [value_type(r.get(k)) for r in rows[:80]]
        sample = [t for t in sample if t != "empty"]
        if sample:
            freq = {}
            for t in sample:
                freq[t] = freq.get(t, 0) + 1
            best, count = max(freq.items(), key=lambda kv: kv[1])
            col_type = best if count >= len(sample) * 0.7 else "string"
        else:
            col_type = "string"
        columns.append({"key": k, "label": pretty_label(k), "type": col_type})

    out_rows = [{c["key"]: coerce(r.get(c["key"]), c["type"]) for c in columns} for r in rows]
    total = len(out_rows)
    truncated = total > cap
    if truncated:
        out_rows = out_rows[:cap]

    return {
        "ok": True,
        "warnings": warnings,
        "dataset": {
            "columns": columns,
            "rows": out_rows,
            "truncated": truncated,
            "meta": {"format": fmt, "totalRows": total, "ingestedAt": int(time.time() * 1000)},
        },
    }


# ---------- sandbox checkout validation (mirrors server/tier.js) ----------

def luhn_ok(digits):
    total, double = 0, False
    for ch in reversed(digits):
        n = int(ch)
        if double:
            n *= 2
            if n > 9:
                n -= 9
        total += n
        double = not double
    return total % 10 == 0


def validate_card(body):
    digits = re.sub(r"\D", "", str(body.get("number", "")))
    if len(digits) != 16 or not luhn_ok(digits):
        return "That card number is not valid."
    if digits != TEST_CARD:
        return "Payments are disabled in this preview build — use the demo card 4242 4242 4242 4242."
    m = re.match(r"^(\d{2})/(\d{2})$", str(body.get("exp", "")))
    if not m or not (1 <= int(m.group(1)) <= 12):
        return "Expiry must be MM/YY and in the future."
    year, month = 2000 + int(m.group(2)), int(m.group(1))
    now = datetime.now()
    if year < now.year or (year == now.year and month < now.month):
        return "Expiry must be MM/YY and in the future."
    if not re.match(r"^\d{3,4}$", str(body.get("cvv", "")).strip()):
        return "CVV must be 3–4 digits."
    return None


# ---------- HTTP plumbing ----------

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC, **kwargs)

    def log_message(self, *args):
        pass

    # -- session helpers --
    def session(self):
        cookie = SimpleCookie(self.headers.get("Cookie", ""))
        sid = cookie["ellery.sid"].value if "ellery.sid" in cookie else None
        if sid and sid in SESSIONS:
            return sid, SESSIONS[sid]
        return None, {"tier": "free"}

    def ensure_session(self):
        sid, sess = self.session()
        if sid is None:
            sid = secrets.token_urlsafe(24)
            SESSIONS[sid] = {"tier": "free"}
            sess = SESSIONS[sid]
        return sid, sess

    def send_json(self, status, payload, set_sid=None, clear_sid=False):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        if set_sid:
            self.send_header("Set-Cookie", f"ellery.sid={set_sid}; Path=/; HttpOnly; SameSite=Lax")
        if clear_sid:
            self.send_header("Set-Cookie", "ellery.sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax")
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            return json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return None

    # -- routes --
    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/session":
            _, sess = self.session()
            return self.send_json(200, {"ok": True, **limits_for(sess["tier"])})
        if path.startswith("/gated/"):
            name = os.path.basename(path)
            if name not in GATED_FILES:
                return self.send_json(404, {"ok": False, "error": "Not found."})
            _, sess = self.session()
            if sess["tier"] != "pro":
                return self.send_json(403, {"ok": False, "error": "This layout ships with the Pro plan."})
            with open(os.path.join(GATED, name), "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)
            return
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?")[0]
        body = self.read_body()
        if body is None:
            return self.send_json(400, {"ok": False, "error": "Malformed request body."})

        if path == "/api/ingest":
            _, sess = self.session()
            cap = FREE_ROW_CAP if sess["tier"] != "pro" else float("inf")
            raw = body.get("raw")
            if not isinstance(raw, str):
                return self.send_json(400, {"ok": False, "warnings": ["Request must include a raw data string."]})
            result = ingest(raw, cap)
            return self.send_json(200 if result["ok"] else 422, result)

        if path == "/api/checkout/sandbox":
            error = validate_card(body)
            if error:
                return self.send_json(402, {"ok": False, "error": error})
            sid, sess = self.ensure_session()
            sess["tier"] = "pro"
            return self.send_json(200, {"ok": True, **limits_for("pro")}, set_sid=sid)

        if path == "/api/share":
            html = body.get("html")
            if not isinstance(html, str) or not html.strip():
                return self.send_json(400, {"ok": False, "error": "Nothing to export — render a story first."})
            wm = ('<a class="sd-watermark" href="https://ellery.example?utm_source=watermark">'
                  "\u25c6 Built with Ellery AI \u2014 Generate Yours Free</a>")
            doc = f'<!DOCTYPE html>\n<html lang="en"><head><meta charset="UTF-8"><title>Data Story</title></head><body><div class="canvas">{html}{wm}</div></body></html>'
            data = doc.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        if path == "/api/export/interactive":
            _, sess = self.session()
            if sess["tier"] != "pro":
                return self.send_json(403, {"ok": False, "error": "Interactive presentation export is a Pro feature."})
            dataset = body.get("dataset") or {}
            if not isinstance(dataset.get("rows"), list) or not dataset["rows"]:
                return self.send_json(400, {"ok": False, "error": "Nothing to export — render a story first."})
            engine_path = os.path.join(PUBLIC, "js", "render", "kinetic-engine.js")
            with open(engine_path, encoding="utf-8") as f:
                engine = f.read()
            payload = json.dumps({"columns": dataset.get("columns", []), "rows": dataset["rows"]}).replace("<", "\\u003c")
            doc = ("<!-- Generated via Ellery AI Engine - Built by Ishaan Jha -->\n<!DOCTYPE html>\n"
                   '<html lang="en"><head><meta charset="UTF-8"><title>Kinetic Data Story</title>'
                   "<style>body{margin:0;background:#0b0b0c}canvas{display:block;width:100%}</style></head>"
                   '<body><canvas id="stage"></canvas><script>' + engine + "</script>"
                   "<script>new ElleryKinetic(document.getElementById('stage')," + payload + ").start();</script>"
                   "</body></html>")
            data = doc.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        if path == "/api/export":
            _, sess = self.session()
            if sess["tier"] != "pro":
                return self.send_json(403, {"ok": False, "error": "Export Clean Code is a Pro feature."})
            html = body.get("html")
            if not isinstance(html, str) or not html.strip():
                return self.send_json(400, {"ok": False, "error": "Nothing to export — render a story first."})
            palette = body.get("palette")
            if not (isinstance(palette, list) and len(palette) == 3 and all(HEX_RE.match(str(c)) for c in palette)):
                palette = ["#ffffff", "#9a9aa0", "#5c5c62"]
            doc = (
                "<!-- Generated via Ellery AI Engine - Built by Ishaan Jha -->\n<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"UTF-8\">"
                "<title>Data Story — exported from Ellery AI</title>"
                f"<style>:root{{--viz-1:{palette[0]};--viz-2:{palette[1]};--viz-3:{palette[2]}}}"
                "body{background:#0a0c10;color:#f5f7fa;font-family:sans-serif}</style></head>"
                f"<body><div class=\"canvas\">{html}</div></body></html>"
            )
            data = doc.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        if path == "/api/dev/reset":
            sid, _ = self.session()
            if sid:
                SESSIONS.pop(sid, None)
            return self.send_json(200, {"ok": True, **limits_for("free")}, clear_sid=True)

        return self.send_json(404, {"ok": False, "error": "Not found."})


if __name__ == "__main__":
    print(f"Ellery mock API (dev test double) → http://localhost:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
