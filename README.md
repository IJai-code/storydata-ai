# Ellery AI

Turn raw data — CSV, JSON, or plain notes — into quiet, interactive,
presentation-ready briefings. Ellery classifies what you import, renders it
on a physics-driven canvas you can interrogate by hand, and exports it as a
narrated MP4, a still PNG, or a self-contained interactive HTML file.

Built as a zero-build static frontend served by a small Express backend that
enforces all tier limits server-side.

> **Status:** preview / MVP. The auth gate and checkout are deliberately
> simulated (see [Preview limitations](#preview-limitations)). The
> visualization, ingestion, Briefing Mode, and export pipelines are real.

---

## Screenshots

<!-- Add images to docs/ and reference them here before publishing. -->

| Kinetic Rank board | Briefing Mode | Exported MP4 |
| --- | --- | --- |
| _`docs/kinetic-rank.png`_ | _`docs/briefing-mode.png`_ | _`docs/briefing-export.gif`_ |

---

## Features

- **Tolerant ingestion** — CSV/TSV, JSON (including nested objects → hierarchy),
  and free-text notes. The parser repairs ragged rows, infers column types, and
  never throws; unrecoverable input degrades to a readable text dataset.
- **Kinetic Rank** — the flagship canvas. Cards are physically ranked; *sort
  pulses* re-rank them with spring inertia, *drag-to-compare* shows live
  differences, and *click-to-pin* sets a baseline. Verlet physics serves
  comprehension, not decoration.
- **Briefing Mode** — Ellery classifies the dataset (performance, timeline,
  operations, knowledge, structured system map, or uniform) and authors a
  narrated briefing: a cinematic title card (`MISSION BRIEFING` for operational
  data, `DATA BRIEFING` otherwise), insight scenes each prefaced by *why* they
  matter, and a closing Key Findings card. Degenerate data gets honest
  captions, never invented insights.
- **Four layouts** — Kinetic Rank, Interactive Timeline, Data Card Grid,
  Branching Mindmap (plus a Pro Insight Map).
- **Exports** — PNG for slides, a narrated MP4 of the live briefing, and (Pro) a
  watermark-free standalone interactive HTML file.
- **Local saves** — briefings (with their scene sequence) persist to the browser.
- **Monochrome operations-center design system** — matte canvas, hairline
  dividers, telemetry-style labels, `prefers-reduced-motion` respected.

## Example use cases

- **Business analytics** — revenue, growth, and customer metrics: identify
  leaders, laggards, and the gaps between them.
- **Engineering systems** — component readiness and subsystem status across an
  operation; a `MISSION BRIEFING` of where things stand.
- **Scientific datasets** — measurements across conditions and controls, ranked
  and grouped with honest handling of equal results.
- **Research projects** — trials and observations summarized with the strongest
  and weakest results called out.
- **Meeting notes** — recurring themes, important dates, and action items pulled
  from free text.
- **Mission planning** — milestones and workstreams grouped over a timeline.

Three of these ship as one-click example datasets (Startup metrics, Mission
operations, Research data).

---

## Quick start

Requires **Node ≥ 18**.

```bash
npm install
npm start            # → http://localhost:4173
```

`PORT=8080 npm start` to change the port. `npm run lint` runs ESLint over the
server and frontend.

No Node available? `npm run dev:mock` starts a Python test double of the same
HTTP contract (dev only — the Express server is the real implementation).

Once running: sign in on the gate (any name, valid-looking email, 8+ char
password — accounts are simulated locally), then click an **example dataset** to see the
full experience, or paste your own CSV/JSON/notes.

---

## Architecture

Zero build step on the frontend: plain ES modules served as static files. The
backend is an Express app that owns sessions and enforces every tier limit.

```
public/                     static frontend (served by Express)
  index.html
  css/                      design tokens, layout, components, animations
  js/
    app.js                  entry point — wires session → panel/canvas/auth
    api.js                  fetch wrapper; every server call goes through here
    state.js                single source of truth (pub/sub store)
    ingest/                 (none — ingestion runs server-side; see below)
    render/
      canvas.js             renderer lifecycle + export/share orchestration
      kinetic-engine.js     Kinetic Rank physics + Briefing camera engine
      layouts/              timeline, cards, nodes (mindmap), kinetic
      png.js                client-side PNG snapshot
      video.js              MediaRecorder MP4 capture
      util.js, watermark.js
    tier/
      gates.js              UI mirror of session limits (display only)
      paywall.js            upgrade modal + sandbox checkout
    ui/                     panel, auth gate, tutorial, toasts
server/
  server.js                 Express app: sessions, static serving, API routes
  tier.js                   authoritative tier policy + sandbox card validation
  ingest/                   detect → parse → normalize pipeline (tolerant)
  export.js                 document assembler for /api/export, /api/share,
                            and the Pro interactive HTML
  gated/                    Pro-only modules (Insight Map renderer, Live
                            Simulation engine) — served only to Pro sessions
tools/mock_api.py           dev test double of the API contract (no Node needed)
```

**Key design rule:** the frontend never decides access. `gates.js` only mirrors
what `/api/session` reported so the UI can paint locks; the server re-checks
every limit on every request. The Kinetic engine is a classic script with one
global so the *identical* file powers the live canvas, the MP4 recorder, and the
embedded Pro interactive export.

### Data flow

```
raw input → POST /api/ingest → detect → parse → normalize → dataset (capped
            by the session's tier) → state store → canvas renderer → exports
```

---

## API

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/session` | GET | Current tier + the limits the UI should reflect |
| `/api/ingest` | POST | Parse raw data; row cap applied from the session |
| `/api/checkout/sandbox` | POST | Simulated upgrade (test card only) |
| `/api/share` | POST | HTML export, watermark injected server-side (any tier) |
| `/api/export` | POST | Watermark-free HTML export (Pro) |
| `/api/export/interactive` | POST | Standalone interactive HTML with engine (Pro) |
| `/gated/:file` | GET | Pro-only JS modules, 403 to free sessions |

---

## Tiers

| | Free | Pro ($12.99/mo) |
| --- | --- | --- |
| Rows per briefing | 150 | unlimited |
| Layouts | Kinetic Rank, Timeline, Card Grid, Branching Mindmap | + Insight Map |
| Briefing Mode | ✓ | ✓ |
| Save briefings locally | ✓ | ✓ |
| Share preview (HTML) | ✓ — watermarked | ✓ |
| Export PNG for slides | ✓ — attribution stamp | ✓ — clean |
| Export narrated MP4 | ✓ — attribution caption | ✓ — clean |
| Interactive Presentation Link (HTML) | — | ✓ |
| Export Clean Code | — | ✓ |
| Live Simulation Mode | — | ✓ |

Limits are enforced server-side per request — flipping client variables changes
pixels, not access.

---

## Export capabilities

- **PNG** — 2× client-side canvas/SVG snapshot, transparent margins so it drops
  into slides cleanly. Free tier gets a low-opacity attribution stamp.
- **MP4** — records the live briefing (title card → narrated scenes → Key Findings)
  via `MediaRecorder` at 60 FPS. Falls back to WebM where H.264 recording is
  unsupported (Safari/Firefox); the UI flags this since Keynote/PowerPoint need
  MP4. Free tier bakes in an attribution caption.
- **Interactive HTML (Pro)** — embeds the physics engine + data into one
  self-contained, dependency-free file with a "Play Briefing" button.

A tabbed **"How to Embed in Slides"** guide (PowerPoint / Google Slides /
Keynote) ships in the top bar.

---

## Deployment

Ellery needs a **stateful Node host** (Render, Railway, Fly.io, a VM) because
sessions and tier gating run in a single Express process with an in-memory
store. Vercel/Netlify's serverless model would require moving sessions to an
external store first.

```
Build command:  npm install
Start command:  npm start          # honours $PORT
```

Set `NODE_ENV=production` (enables secure cookies; `trust proxy` is already on)
and a stable `SESSION_SECRET`. See `.env.example`.

---

## Preview limitations

These are intentional for the preview and must be replaced before a real launch:

- **Auth is simulated.** The gate validates input shape and stores a display
  name locally; the password is never sent or stored. It is a UX flow, not a
  security boundary. Swap in a real identity provider.
- **Checkout is a sandbox.** `/api/checkout/sandbox` accepts only the Stripe
  test card `4242 4242 4242 4242`, never stores card data, and flips the session
  to Pro in memory. Replace with Stripe Checkout + webhooks.
- **Sessions are in-memory and single-process.** Add a persistent store before
  scaling horizontally.

---

## Roadmap

- Real authentication (OAuth/email) replacing the simulated gate.
- Stripe Checkout + webhooks replacing the sandbox route.
- Persistent session/store + horizontal scaling.
- Server-side rendered exports for headless/automated generation.
- Date parsing for year-less notes (e.g. "May 12") in the ingestion layer.

---

## Project conventions

- ES modules, no bundler, no framework on the frontend.
- ESLint flat config (`npm run lint`) — kept clean.
- The Kinetic engine is intentionally a classic script (one global) so it can be
  embedded verbatim into exports.

---

## License

MIT — see [LICENSE](LICENSE).

## Credit

Ellery Studio — designed & engineered by **Ishaan Jha**.
