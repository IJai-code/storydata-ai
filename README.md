# Ellery

Ellery reads your data, tells you plainly what's true, and lets you pull any
claim all the way down to the exact, fingerprinted evidence that proves it.

It is a reasoning instrument, not a chart builder. You load a CSV, JSON or plain
text file and Ellery opens with a ranked **Case File** — its conclusions, in
English, before you touch a visualization. Every conclusion can be traced to the
records behind it, re-derived from those records on demand, and checked against
a content fingerprint of the data it was computed from.

There is no model in the truth path. Findings are a deterministic function of the
data and the policy applied to it: same snapshot, same policy, same conclusion.

> **Status:** early access. Sign-in is a local workspace label, not
> authentication, and billing is not wired up — see
> [Preview limitations](#preview-limitations). The reasoning, ingestion, Pull,
> verification and export pipelines are real.

---

## What it does

### Findings first — the Case File

Load data and Ellery ranks what it found: extremes, outliers, distribution,
central tendency, availability, and concentration. The most important claim leads
as the headline. When the data is unremarkable, it says so instead of inventing
drama.

### The Pull

Click any finding and the Case File descends into it, one layer at a time:

```
Finding → Evidence → Derivation → Policy → Confidence → the records → Ground
```

The bottom layer is a fingerprinted snapshot. Each record carries its own content
fingerprint, and opening one shows its raw cells and its address on that snapshot.
A traced finding stays lit across every lens.

### Re-check

Each trace has a **Re-check this finding** control. It re-derives the claim from
the fingerprinted records and reports whether it reproduces. This is a real
recomputation compared against what the detector asserted — not a stored flag.
Tamper with a cell and only the findings that actually depend on it fail.

### Two fingerprints

Ground shows a **procedure** fingerprint and a **result** fingerprint. The
procedure names the computation and is independent of the data; the result binds
it to this snapshot. Together they distinguish "the data changed" from "the
reasoning changed."

### Composed claims

Some findings rest on other findings rather than directly on records —
"concentration risk", for example, stands on the finding that one category leads
the metric. These are marked *from N findings* in the list, and their trace opens
with a **Rests on** layer naming what they are built from. Each of those is a
finding in its own right, so the Pull keeps going until it reaches records.

### Lenses

Visualizations are alternate renderings of the same Case File, not a separate
product: Findings, Kinetic Rank, Timeline, Cards, Mindmap, and Insight Map (Pro).
Kinetic Rank uses Verlet physics to serve comparison and ranking.

### Exports

PNG for slides, a narrated MP4 of the live briefing via `MediaRecorder`, and a
self-contained interactive HTML file. Cases save to the browser and reopen from
the Cases dashboard, named after the claim that led them.

---

## Running it locally

Requires **Node ≥ 18**.

```bash
npm install
npm run dev      # → http://localhost:8130
```

`npm run dev` starts `tools/preview-server.mjs`, which serves the frontend and a
same-origin stub of the API using the real ingestion pipeline, so the app runs
fully offline with no backend cold start.

`npm start` runs the actual Express backend on port 4173 (`PORT` to change it).

Sign-in asks only for a name and email; both are stored locally as a workspace
label. Click an example dataset, or paste your own CSV, TSV, JSON or notes.

### Tests

```bash
npm test          # golden output + cross-tier contract tests
npm run lint      # ESLint over server, frontend and tools
```

- **Golden tests** (`tools/test/run.mjs`) pin the entire truth path for a set of
  fixtures: ingestion, discovery, snapshot fingerprints and every layer the Pull
  exposes. The engine is deterministic, so any diff is a real change in what
  Ellery concludes. `npm run test:update` refreshes the baselines and should only
  be run when a change in output is intended.
- **Invariants** run before anything is compared or written: every finding must
  carry a justification, assert a value, and verify against its own evidence. A
  `--update` cannot bless a finding that fails them.
- **Contract tests** (`tools/test/contract.mjs`) cover behaviour a snapshot can't
  express: the three verification failure modes, compositional failure
  propagation from ground upward, and that a claim which states a wrong number
  fails even when its supports verify and its predicate still holds.

---

## Repository structure

The frontend is a zero-build static site served from the repository root. The
backend is a small Express app that owns sessions and enforces every tier limit.

```
index.html, app/, css/       static frontend (GitHub Pages)
js/
  app.js                     entry point — session → panel/canvas/auth
  api.js                     fetch wrapper; every server call goes through here
  state.js                   pub/sub store
  discovery/                 detectors + dataset profiling (the Discovery tier)
    detectors/               extremes, central-tendency, distribution,
                             availability, outliers
  relationships/             rules that compose Discoveries into claims
    detectors/               concentration, clustered-anomaly, inventory-exposure,
                             fragile-outlier, pricing-opportunity
  derive/                    the derivation graph
    graph.js                 node identity, evaluation, verify, Pull traversal
    build.js                 the detector-facing API (justify / justifyOver)
    project.js               witness → rows, and op-keyed derivation prose
    fingerprint.js           snapshot, row and cell fingerprints
  render/
    pull.js                  the Pull: claims, focus, provenance, verification
    layouts/findings.js      the Case File and the trace
    kinetic-engine.js        Kinetic Rank physics + briefing camera
    canvas.js, png.js, video.js, util.js, watermark.js
  tier/                      UI mirror of session limits (display only)
  ui/                        panel, auth gate, tutorial, toasts
server/
  server.js                  Express app: sessions, static serving, API routes
  tier.js                    authoritative tier policy
  ingest/                    detect → parse → normalize (tolerant, never throws)
  export.js                  document assembler for the export routes
  gated/                     Pro-only modules, served only to Pro sessions
tools/
  preview-server.mjs         local dev server (frontend + stub API)
  test/                      golden fixtures, baselines, and contract tests
docs/derivation-graph.md     the derivation graph specification
```

**Key design rule:** the frontend never decides access. `tier/gates.js` only
mirrors what `/api/session` reported so the UI can paint locks; the server
re-checks every limit on every request.

### Data flow

```
raw input → POST /api/ingest → detect → parse → normalize → dataset
          → discovery + relationships → Case File → Pull → snapshot
```

---

## API

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/session` | GET | Current tier and the limits the UI should reflect |
| `/api/ingest` | POST | Parse raw data; row cap applied from the session |
| `/api/checkout/sandbox` | POST | Simulated upgrade (test card only) |
| `/api/share` | POST | HTML export, watermark injected server-side |
| `/api/export` | POST | Watermark-free HTML export (Pro) |
| `/api/export/interactive` | POST | Standalone interactive HTML (Pro) |
| `/gated/:file` | GET | Pro-only JS modules, 403 to free sessions |

---

## Deployment

The frontend is served from GitHub Pages at the repository root. The backend runs
on Render at `https://ellery-backend.onrender.com`, with CORS restricted to the
Pages origin.

The backend needs a **stateful Node host** because sessions and tier gating live
in a single Express process with an in-memory store.

```
Build command:  npm install
Start command:  npm start          # honours $PORT
```

Set `NODE_ENV=production` (enables secure cookies; `trust proxy` is already on)
and a stable `SESSION_SECRET`. See `.env.example`.

---

## Preview limitations

Intentional for early access, and to be replaced before a real launch:

- **Sign-in is not authentication.** It stores a display name and email locally
  to label the workspace. Nothing is transmitted. Swap in a real identity
  provider.
- **Checkout is a sandbox.** `/api/checkout/sandbox` accepts only the Stripe test
  card, never stores card data, and flips the session in memory. While early
  access is on, every Pro feature is granted to everyone at the gate.
- **Sessions are in-memory and single-process.** Add a persistent store before
  scaling horizontally.

---

## Conventions

- ES modules, no bundler, no framework on the frontend.
- ESLint flat config (`npm run lint`) — kept clean.
- The Kinetic engine is deliberately a classic script with one global so the
  identical file powers the live canvas, the MP4 recorder, and the embedded
  interactive export.
- Nothing in the truth path may use `Date.now()`, `Math.random()`, unpinned
  locale formatting, or any network or model call.

---

## License

MIT — see [LICENSE](LICENSE).

## Credit

Ellery — designed and engineered by **Ishaan Jha**.
