// Local demo/preview server. Serves the current working-tree frontend AND a
// same-origin stub of the API (real ingest, Pro session, gated Insight Map),
// so the app runs fully offline with no Render cold-start. Local dev only —
// safe to delete. Run:  node tools/preview-server.mjs   → http://localhost:8130
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingest } from '../server/ingest/normalize.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8130;

const PRO = {
  ok: true, tier: 'pro', price: 12.99, maxRows: null,
  layouts: ['kinetic', 'timeline', 'cards', 'nodes', 'map'],
  watermark: false, export: true,
};
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.png': 'image/png', '.ico': 'image/x-icon',
};
const body = (req) => new Promise((res) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => res(d)); });

http.createServer(async (req, res) => {
  const p = new URL(req.url, `http://localhost:${PORT}`).pathname;
  res.setHeader('cache-control', 'no-store');

  if (p === '/api/session') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(PRO)); }
  if (p === '/api/ingest' && req.method === 'POST') {
    const raw = JSON.parse((await body(req)) || '{}').raw || '';
    const result = ingest(raw, 100000);
    res.statusCode = result.ok ? 200 : 422;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify(result));
  }
  if (p === '/api/checkout/sandbox' && req.method === 'POST') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(PRO)); }
  if (p.startsWith('/gated/')) {
    const f = path.join(ROOT, 'server', p);
    if (fs.existsSync(f)) { res.setHeader('content-type', 'text/javascript'); return res.end(fs.readFileSync(f)); }
    res.statusCode = 404; return res.end('{}');
  }
  if (p.startsWith('/api/')) { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ ok: true })); }

  // Point the frontend at THIS server instead of the production backend.
  if (p === '/js/api.js') {
    const src = fs.readFileSync(path.join(ROOT, 'js/api.js'), 'utf8')
      .replace('https://ellery-backend.onrender.com', `http://localhost:${PORT}`);
    res.setHeader('content-type', 'text/javascript'); return res.end(src);
  }

  let file = path.join(ROOT, p === '/' ? 'index.html' : decodeURIComponent(p));
  if (file.startsWith(ROOT) && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('Not found'); }
  res.setHeader('content-type', MIME[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
}).listen(PORT, () => console.log(`Ellery preview → http://localhost:${PORT}/  (Ctrl-C to stop)`));
