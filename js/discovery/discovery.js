// A Discovery is one observation about a dataset — plain, frozen data and
// nothing else. Fields: id, type, title, summary, confidence, importance,
// evidence, metadata. Whatever renders or narrates it later reads these; this
// file has no idea any of that exists.

// Importance bands. Detectors can use any value in [0,1]; these just keep the
// numbers comparable between them.
export const IMPORTANCE = Object.freeze({
  CRITICAL: 0.95,
  HIGH: 0.75,
  MEDIUM: 0.5,
  LOW: 0.3,
  MINOR: 0.15,
});

// Severity — separate axis from importance. The UI turns it into colour.
export const TONE = Object.freeze({
  CRITICAL: 'critical',
  WARN: 'warn',
  OK: 'ok',
  NEUTRAL: 'neutral',
});

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

// Build a frozen Discovery. We throw early (rather than coerce) if a detector
// forgott type or title — a malformed finding downstream is way harder to trace.
export function createDiscovery({
  type,
  title,
  summary = '',
  confidence = 1,
  importance = IMPORTANCE.MEDIUM,
  evidence = {},
  metadata = {},
  justification = null,
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
    // The Claim's chain to ground (supports + op graph + π). Null until a
    // detector migrates; pull.js falls back to its legacy path for those.
    justification,
  });
}

// Our own number formatter for summaries — deterministic, and deliberately not
// borrowed from the render layer.
export function formatNumber(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(v ?? '—');
  const rounded = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
  return rounded.toLocaleString('en-US');
}
