# Ellery AI — System Context

## Architecture Overview

Ellery AI is a web application with separated frontend and backend:

### Frontend
- Hosted on GitHub Pages
- Located at repository root (NOT /public)
- Entry point: index.html
- Assets:
  - /css
  - /js

### Backend
- Node.js + Express server
- Located in /server
- Deployed on Render
- Base URL: https://ellery-backend.onrender.com

---

## Core API

### Session Endpoint
- GET /api/session
- Returns tier info and feature flags

---

## Key Systems

### 1. Tier System
- Free vs Pro gating handled server-side
- Never modify client-side gating logic as authoritative

### 2. Export System
- MP4 export via MediaRecorder
- Uses H.264 + AAC encoding
- Free tier includes watermark "Captured with Ellery Studio"
- Must NOT include personal attribution text

### 3. Rendering Engine
- Kinetic / timeline / cards / nodes layouts
- Lives in /js/render/

---

## Critical Constraints

DO NOT:
- Move frontend back into /public
- Break Render deployment structure
- Remove or bypass tier system
- Modify API routes without explicit intent

---

## Deployment

- Frontend: GitHub Pages
- Backend: Render
- Communication via fetch('/api/...') with CORS enabled

---

## Stability Rule

Any change must preserve:
- API compatibility
- Export system integrity
- Deployment structure# ELLERY AI — PRODUCT CONSTITUTION & ENGINEERING RULES

## Core Mission

Ellery AI transforms messy information into presentation-ready animated visual systems.

Users should be able to:

1. Import messy data.
2. Instantly understand it visually.
3. Interact with it meaningfully.
4. Export it into presentations and shareable experiences.

Every design decision must support one or more of these goals.

---

## Product Principles

Every feature must satisfy at least one of the following:

* Make data easier to understand.
* Make presentations more engaging.
* Make insights easier to discover.
* Make exports more valuable.
* Make storytelling with data more effective.

If a feature does not satisfy one of these goals, do not build it.

---

## Product Positioning

Ellery AI is:

* A presentation visualization platform.
* A data storytelling tool.
* An animated information canvas.
* A presentation enhancement system.

Ellery AI is NOT:

* A spreadsheet replacement.
* A dashboard platform.
* A generic chart builder.
* A traditional BI tool.
* Another chatbot.

---

## Physics Philosophy

Physics is never decorative.

Motion must communicate:

* ranking
* relationships
* grouping
* comparison
* hierarchy
* transitions
* change over time

Avoid movement that exists only because it looks cool.

Every animation should teach the viewer something.

---

## Visualization Ownership

Each visualization mode must have a unique purpose.

### Branching Mindmap

Responsible for:

* hierarchy
* parent-child structures
* dependency relationships
* concept maps
* knowledge maps

### Kinetic Rank Board

Responsible for:

* ranking
* ordering
* comparison
* movement between rankings
* change visibility
* sorting stories

Do not duplicate functionality between visualization modes.

---

## Export Philosophy

Exports are first-class features.

Every visualization must answer:

"Why would somebody place this inside a presentation?"

If there is no compelling answer, reconsider the feature.

Exports should create presentation assets that look professional immediately.

---

## User Experience Rules

A first-time user should understand a visualization within 30 seconds.

Requirements:

* Plain English labels.
* Minimal jargon.
* No unexplained symbols.
* Clear onboarding.
* Helpful empty states.
* Obvious interactions.

If a feature requires extensive explanation, simplify it.

---

## Visual Layout Refinement

Structure node maps into organized horizontal left-to-right systems.

### Column Layout

Far Left Column:

* Core dataset root container.

Middle Column:

* Primary parsed category bridges.

Far Right Column:

* Individual records, leaves, milestones, and endpoints.

Layouts should feel intentional and organized.

---

## Card Design Rules

Nodes must render as clean horizontal information cards.

Requirements:

* Background: #0B0B0C
* Border: 1px solid rgba(255,255,255,0.12)
* Sharp edges
* Clean spacing
* Professional appearance

Typography:

* Compact
* Readable
* Consistent
* Center-aligned where appropriate

---

## Physics Constraints

Dragging cards may display elastic tension.

Upon release:

* Cards must return to their assigned locations.
* No overlap.
* No permanent disorder.
* No broken layouts.

The user may explore the system but cannot accidentally destroy organization.

---

## Tooltip Rules

No information may become inaccessible due to truncation.

If content is shortened:

* Hover reveals full content.
* Tooltip must remain readable.
* Tooltip must remain on-screen.
* Tooltip must support long labels.

Users must always have access to complete information.

---

## Tutorial System

Include a top-bar tutorial system.

Required sections:

* Microsoft PowerPoint
* Google Slides
* Apple Keynote

Explain:

* How to export
* How to embed
* How to loop animations
* How to present exported assets

Documentation should be concise and visual.

---

## MP4 Export Standards

MP4 exports must contain meaningful movement.

Avoid static recordings.

Preferred structure:

1. Initial state
2. Transition
3. Reorganization
4. Final resolved state

The animation should tell a story.

Examples:

* chaos → order
* unsorted → ranked
* disconnected → organized

The viewer should immediately understand what changed.

---

## Performance Standards

Prioritize:

* Smooth interaction
* Fast rendering
* Responsive exports
* Stable frame rates

Measure before optimizing.

Avoid premature optimization.

---

## Engineering Standards

Assume all code will eventually become public.

Requirements:

* No secrets
* No API keys
* No credentials
* No private data

Favor:

* maintainability
* readability
* documentation
* modular architecture

Avoid:

* hacks
* duplicated logic
* unexplained magic numbers

---

## GitHub Readiness

The repository should always be capable of becoming public.

Document:

* major systems
* architecture decisions
* export pipeline
* physics engine
* parsing systems

Future contributors should be able to understand the project.

---

## Decision Filter

Before implementing any feature, ask:

1. Does this improve understanding?
2. Does this improve presentations?
3. Does this improve storytelling?
4. Does this improve exports?
5. Does this improve usability?

If the answer to all five is "no," do not build it.

---

## Final Rule

Prefer:

* one excellent visualization
* one memorable interaction
* one compelling export

over ten mediocre features.

Ellery should feel focused, professional, and presentation-first.
