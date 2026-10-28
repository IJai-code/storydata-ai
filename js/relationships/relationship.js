// A Relationship ties two or more discoveries into one claim — "revenue is
// concentrated", say. It never reads the dataset: it points at discoveries by id.
// It shares the Discovery importance bands so the two rank on one scale.

import { IMPORTANCE, TONE, clamp01 } from '../discovery/discovery.js';

export { IMPORTANCE, TONE };

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

// One formatter for every tier. A Relationship quotes numbers that a Discovery
// already stated, so a second copy could only ever drift from it.
export { formatNumber } from '../discovery/discovery.js';
