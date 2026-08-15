// A Relationship ties two or more discoveries together into one bigger signal —
// "revenue is concentrated", say. Like a Discovery it's just frozen data: no
// DOM, no UI, and it never touches the raw dataset. It points at discoveries by
// id and keeps the numbers it pulled from them. Same shape language as Discovery
// on purpose, so the engines downstream only have to learn one.
//
// Fields: id, type, title, summary, confidence, importance, supporting (the
// discovery ids it was built from), evidence, metadata.

// Same bands as the Discovery Engine so the two scores line up.
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

// Make a frozen Relationship; blows up early if a rule skipped type or title.
export function createRelationship({
  type,
  title,
  summary = '',
  confidence = 1,
  importance = IMPORTANCE.MEDIUM,
  supporting = [],
  evidence = {},
  metadata = {},
  justification = null,
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
    // A composed justification: `claim` supports and an op graph over their
    // values. Same envelope as a Discovery's, so one verify/pull handles both.
    justification,
  });
}

// Same little number formatter the discovery side uses, kept local on purpose.
export function formatNumber(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(v ?? '—');
  const rounded = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
  return rounded.toLocaleString('en-US');
}
