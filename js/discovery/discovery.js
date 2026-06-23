// Ellery Discovery Engine — the standardized Discovery object.
//
// A Discovery is a single, self-describing observation about a dataset. It is
// pure data: it knows nothing about CSS, layouts, or components. Presentation
// layers (and future Narrative / Recommendation engines) consume these objects;
// they never reach back into the engine.
//
// @typedef {Object} Discovery
// @property {string} id          Stable identifier (type + key) for dedupe/reference.
// @property {string} type        Detector family, e.g. 'extreme' | 'outlier' | 'availability'.
// @property {string} title       Short human label, e.g. 'Highest revenue'.
// @property {string} summary     One-line plain-language statement.
// @property {number} confidence  0..1 deterministic certainty.
// @property {number} importance  0..1 ranking weight (engine sorts on this).
// @property {Object} evidence    Structured supporting data (raw values, row indices, column keys).
// @property {Object} metadata    { detector, columns, tone, tags, ... } — hints, never required by the core.

// Suggested importance bands. Detectors may compute anything in [0,1]; these
// keep scoring legible and comparable across detectors.
export const IMPORTANCE = Object.freeze({
  CRITICAL: 0.95,
  HIGH: 0.75,
  MEDIUM: 0.5,
  LOW: 0.3,
  MINOR: 0.15,
});

// Semantic severity, orthogonal to importance. Presentation maps these to color.
export const TONE = Object.freeze({
  CRITICAL: 'critical',
  WARN: 'warn',
  OK: 'ok',
  NEUTRAL: 'neutral',
});

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * Build a validated, immutable Discovery. Throws on missing essentials so
 * malformed detectors fail loudly in development rather than silently.
 */
export function createDiscovery({
  type,
  title,
  summary = '',
  confidence = 1,
  importance = IMPORTANCE.MEDIUM,
  evidence = {},
  metadata = {},
}) {
  if (!type || !title) throw new Error('createDiscovery requires both a type and a title');
  const id = metadata.id || `${type}:${metadata.key ?? title}`;
  return Object.freeze({
    id,
    type,
    title,
    summary: String(summary),
    confidence: clamp01(confidence),
    importance: clamp01(importance),
    evidence: Object.freeze({ ...evidence }),
    metadata: Object.freeze({ tone: TONE.NEUTRAL, tags: [], ...metadata, id }),
  });
}

/**
 * Deterministic, locale-stable number formatting for summaries. Kept inside the
 * engine so analysis never depends on the rendering layer's formatters.
 */
export function formatNumber(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(v ?? '—');
  const rounded = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
  return rounded.toLocaleString('en-US');
}
