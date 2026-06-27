// Ellery Relationship Engine — the standardized Relationship object.
//
// A Relationship is a higher-order finding: it connects two or more existing
// discoveries into a single meaningful signal (e.g. "revenue is concentrated").
// It is pure data — no DOM, no rendering, no UI. It never re-reads the raw
// dataset; it only references discoveries by id and carries structured evidence
// derived from their outputs. This mirrors the Discovery object on purpose, so
// future Narrative / Recommendation engines consume one consistent shape.
//
// @typedef {Object} Relationship
// @property {string}   id          Stable identifier (type + key).
// @property {string}   type        Relationship family, e.g. 'concentration' | 'inventory-risk'.
// @property {string}   title       Short human label.
// @property {string}   summary     One-line plain-language statement.
// @property {number}   confidence  0..1 deterministic certainty.
// @property {number}   importance  0..1 ranking weight.
// @property {string[]} supporting  Ids of the discoveries this was built from.
// @property {Object}   evidence    Structured supporting data (values pulled from discoveries).
// @property {Object}   metadata    { detector, tone, tags, ... } — hints, never required by the core.

// Importance bands (kept parallel to the Discovery Engine for comparable scoring).
export const IMPORTANCE = Object.freeze({
  CRITICAL: 0.95,
  HIGH: 0.75,
  MEDIUM: 0.5,
  LOW: 0.3,
  MINOR: 0.15,
});

export const TONE = Object.freeze({
  CRITICAL: 'critical',
  WARN: 'warn',
  OK: 'ok',
  NEUTRAL: 'neutral',
});

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * Build a validated, immutable Relationship. Throws on missing essentials so a
 * malformed rule fails loudly in development.
 */
export function createRelationship({
  type,
  title,
  summary = '',
  confidence = 1,
  importance = IMPORTANCE.MEDIUM,
  supporting = [],
  evidence = {},
  metadata = {},
}) {
  if (!type || !title) throw new Error('createRelationship requires both a type and a title');
  const id = metadata.id || `${type}:${metadata.key ?? title}`;
  return Object.freeze({
    id,
    type,
    title,
    summary: String(summary),
    confidence: clamp01(confidence),
    importance: clamp01(importance),
    supporting: Object.freeze([...supporting]),
    evidence: Object.freeze({ ...evidence }),
    metadata: Object.freeze({ tone: TONE.NEUTRAL, tags: [], ...metadata, id }),
  });
}

/** Deterministic, locale-stable number formatting for summaries. */
export function formatNumber(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(v ?? '—');
  const rounded = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
  return rounded.toLocaleString('en-US');
}
