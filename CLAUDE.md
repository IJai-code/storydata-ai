# Ellery — System Context & Engineering Rules

## Identity

Ellery reads your data, tells you plainly what's true, and lets you pull any
claim all the way down to the exact, fingerprinted evidence that proves it.

The category is **accountable conclusions**. Ellery is a reasoning instrument.

Ellery is NOT:

- a chart builder
- a dashboard platform
- a spreadsheet replacement
- a BI tool
- a chatbot

Visualizations exist, but they are lenses onto conclusions — never the product
itself.

---

## The two axioms

These govern the reasoning layer. Do not weaken them.

**J — Grounded Justification.** A conclusion is inseparable from a traversable
chain of evidence to fingerprinted ground. Nothing downstream may assert more
than the chain proves.

**P — Procedural Origin.** A conclusion is the reproducible output of an explicit
deterministic procedure, not an author's judgement. Same evidence + same policy =
same conclusion.

---

## Core experience

```
Landing → Continue → Load data → Analyze → Case File → Finding → Pull → evidence
```

- **Case File** — the findings-first home surface. Ranked conclusions in plain
  English, headline first. Calm data gets said so, not dramatized.
- **The Pull** — the signature interaction. Finding → Evidence → Derivation →
  Policy → Confidence → records → Ground.
- **Ground** — a fingerprinted snapshot. Records carry their own content
  fingerprints.
- **Re-check** — re-derives a claim from its records and reports whether it
  reproduces. Must remain a real recomputation, never a stored flag.
- **Composed claims** — Relationships rest on other findings and are marked as
  such; their trace opens with a "Rests on" layer. They are another kind of
  claim in the same Case File, not a separate surface.

---

## Truth-path rules

The truth path is `server/ingest/` → `js/discovery/` → `js/relationships/` →
`js/derive/` → `js/render/pull.js`.

NEVER introduce into it:

- `Date.now()` or any clock
- `Math.random()`
- unpinned locale formatting
- iteration order that depends on anything but the data
- network calls, model calls, or AI of any kind
- arbitrary external state

Float arithmetic is order-sensitive. Ops that mirror `discovery/profile.js` must
be bit-identical to it, not merely equivalent.

Architecture of the reasoning layer is specified in `docs/derivation-graph.md`
(Claim ← Support*, node identity, witness, verify semantics, fingerprints). Do
not redesign it without a demonstrated contradiction with J or P.

No detector-specific provenance code. Presentation and verification dispatch on
the operation algebra, never on which detector produced a claim.

---

## Architecture

### Frontend
- Zero build. Plain ES modules served as static files.
- Hosted on GitHub Pages, **at the repository root** (NOT `/public`).
- Entry points: `index.html`, `app/index.html`. Assets in `/css`, `/js`.

### Backend
- Node + Express in `/server`, deployed on Render.
- Base URL: `https://ellery-backend.onrender.com`, CORS restricted to the Pages
  origin.
- `GET /api/session` returns tier info and feature flags.

### Commands
```bash
npm run dev     # local dev server (frontend + stub API) → :8130
npm start       # the real Express backend → :4173
npm test        # golden output + contract tests
npm run lint    # ESLint over server, frontend and tools
```

`npm run test:update` regenerates golden baselines. Only run it when a change in
output is intended — never to make a failing test pass.

---

## Key systems

**Tier system.** Free vs Pro is enforced server-side. Client-side gating is a
display mirror only and is never authoritative.

**Export system.** PNG, MP4 via MediaRecorder (H.264 + AAC), and self-contained
interactive HTML. Free tier carries the watermark "Captured with Ellery Studio".
No personal attribution text.

**Rendering engine.** Lenses live in `/js/render/`: Findings, Kinetic Rank,
Timeline, Cards, Mindmap, Insight Map (Pro). The Kinetic engine is deliberately a
classic script with one global so the identical file powers the live canvas, the
MP4 recorder, and the embedded interactive export.

---

## Removed features

Do not reintroduce without explicit intent:

- **Live Simulation** — deleted.
- **The Decision tier** — prototyped and removed. It would attach as `{of:'claim'}`
  supports over Relationships and needs no new machinery if it returns.

---

## Visualization ownership

Each lens has one job. Do not duplicate between them.

- **Kinetic Rank** — ranking, ordering, comparison, movement between rankings,
  change over time.
- **Branching Mindmap** — hierarchy, parent-child structure, dependencies.

Motion is never decorative. Animation must communicate ranking, relationships,
grouping, comparison, hierarchy, or change. If it exists only because it looks
good, remove it.

---

## Interface rules

- A first-time user should understand a view within 30 seconds.
- Plain English labels. No unexplained symbols. Helpful empty states.
- Records and fields — not rows and columns.
- Cases, not "stories", in user-facing copy.
- Cards: `#0B0B0C` background, `1px solid rgba(255,255,255,0.12)` border, sharp
  edges, compact readable type.
- Dragging may show elastic tension, but cards return to assigned positions. The
  user can explore the layout but cannot destroy it.
- No information may become inaccessible through truncation. If content is
  shortened, hover reveals it, and the tooltip stays on-screen and readable.
- Phoenix-orange editorial aesthetic; monochrome leads, brand colour is used
  sparingly.
- `prefers-reduced-motion` is respected.

---

## Engineering standards

Assume this repository will be public.

- No secrets, keys, credentials, or private data.
- Favour deletion over addition. Prefer simplifying to rewriting.
- No duplicated logic, no unexplained magic numbers, no temporary scaffolding
  left behind.
- Comments should carry engineering reasoning a maintainer needs — constraints,
  invariants, non-obvious ordering. Not narration of what the line does.
- Keep `npm test` and `npm run lint` green.

---

## Stability rule

Any change must preserve:

- the truth path's determinism and its golden/contract coverage
- API compatibility
- export system integrity
- deployment structure (frontend at root, backend in `/server`)

---

## Decision filter

Before building anything, ask:

1. Does it make what's true easier to see?
2. Does it make a conclusion more traceable or more checkable?
3. Does it make the evidence easier to reach?
4. Does it make the product simpler?

If the answer to all four is no, do not build it.

Prefer one excellent conclusion, one memorable interaction, and one compelling
export over ten mediocre features.
