// Ellery AI — secure backend. Sessions are server-side; the browser only
// holds an opaque httpOnly cookie. All tier decisions (row caps, layout
// access, watermark, export, Live Simulation) are enforced here, so flipping
// variables in the browser console cannot unlock Pro features or un-cap data.

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import { ingest } from './ingest/normalize.js';
import { tierOf, limitsFor, rowCapFor, validateSandboxCard } from './tier.js';
import { buildExportDocument, buildInteractiveDocument } from './export.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const GATED_DIR = path.join(__dirname, 'gated');
const PORT = Number(process.env.PORT) || 4173;

// Pro-only modules, served per-session. Allowlist — never serve arbitrary
// filenames from a request parameter.
const GATED_FILES = new Set(['map.js', 'simulation.js']);

const IS_PROD = process.env.NODE_ENV === 'production';

const app = express();
app.use(cors({
  origin: 'https://ijai-code.github.io',
  credentials: true
}));
app.disable('x-powered-by');
// Trust the platform's TLS-terminating proxy (Render/Railway/Fly/etc.) so
// secure cookies and req.protocol resolve correctly in production.
app.set('trust proxy', 1);
app.use(express.json({ limit: '8mb' }));

app.use(
  session({
    name: 'ellery.sid',
    // A per-boot random secret works for the preview (sessions reset on
    // restart). In production, set SESSION_SECRET (stable) and move to a
    // persistent session store; the in-memory store is single-process only.
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // Secure cookies once served over HTTPS (NODE_ENV=production); stays
      // off in local dev so the http://localhost session still works.
      secure: IS_PROD,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

/* ---------- API ---------- */

// Current session: tier + the limits the UI should reflect.
app.get('/api/session', (req, res) => {
  res.json({ ok: true, ...limitsFor(tierOf(req)) });
});

// Data ingestion. The cap comes from the session — a free session can never
// receive more than FREE_ROW_CAP rows, no matter what the client claims.
app.post('/api/ingest', (req, res) => {
  const raw = req.body?.raw;
  if (typeof raw !== 'string') {
    return res.status(400).json({ ok: false, warnings: ['Request must include a raw data string.'] });
  }
  const result = ingest(raw, rowCapFor(tierOf(req)));
  res.status(result.ok ? 200 : 422).json(result);
});

// Sandbox checkout: validates the test card server-side and upgrades the
// session. Card fields are checked in memory only — never logged or stored.
// Replace with a Stripe Checkout session before accepting real payments.
app.post('/api/checkout/sandbox', (req, res, next) => {
  const verdict = validateSandboxCard(req.body || {});
  if (!verdict.ok) {
    return res.status(402).json({ ok: false, error: verdict.error });
  }
  req.session.tier = 'pro';
  req.session.save((err) => {
    if (err) return next(err);
    res.json({ ok: true, ...limitsFor('pro') });
  });
});

// Share preview — available to every tier. The watermark is injected here,
// server-side, so a free client cannot produce an unbranded share file.
app.post('/api/share', (req, res) => {
  const result = buildExportDocument({ ...(req.body || {}), watermark: true });
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error });
  }
  res.type('html').send(result.doc);
});

// Interactive Presentation Link — Pro only. Compiles the dataset plus the
// kinetic physics engine into one self-contained, watermark-free HTML file.
app.post('/api/export/interactive', async (req, res, next) => {
  if (tierOf(req) !== 'pro') {
    return res.status(403).json({ ok: false, error: 'Interactive presentation export is a Pro feature.' });
  }
  try {
    const result = await buildInteractiveDocument(req.body?.dataset);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error });
    }
    res.type('html').send(result.doc);
  } catch (err) {
    next(err);
  }
});

// Export Clean Code — Pro only, watermark-free, enforced here.
app.post('/api/export', (req, res) => {
  if (tierOf(req) !== 'pro') {
    return res.status(403).json({ ok: false, error: 'Export Clean Code is a Pro feature.' });
  }
  const result = buildExportDocument({ ...(req.body || {}), watermark: false });
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error });
  }
  res.type('html').send(result.doc);
});

// Dev helper for funnel testing: drop the session back to free. Registered
// only outside production so the preview keeps it but launches don't expose
// a reset endpoint.
if (!IS_PROD) {
  app.post('/api/dev/reset', (req, res, next) => {
    if (!req.session) {
      return res.json({ ok: true, ...limitsFor('free') });
    }
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('ellery.sid');
      res.json({ ok: true, ...limitsFor('free') });
    });
  });
}

/* ---------- Gated Pro modules ---------- */
// Premium code (Insight Map renderer, Live Simulation engine) is only
// delivered to Pro sessions — a free browser never receives it.

app.get('/gated/:file', (req, res) => {
  if (!GATED_FILES.has(req.params.file)) {
    return res.status(404).json({ ok: false, error: 'Not found.' });
  }
  if (tierOf(req) !== 'pro') {
    return res.status(403).json({ ok: false, error: 'This feature ships with the Pro plan.' });
  }
  res.type('application/javascript');
  res.sendFile(path.join(GATED_DIR, req.params.file));
});

/* ---------- Static frontend ---------- */

app.use(express.static(PUBLIC_DIR, { index: 'index.html' }));

/* ---------- Errors ---------- */

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Not found.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, error: 'That dataset is too large to upload.' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: 'Malformed request body.' });
  }
  console.error('[ellery] unexpected error:', err);
  res.status(500).json({ ok: false, error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`Ellery AI secure server → http://localhost:${PORT}`);
});
