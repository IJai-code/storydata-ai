// A Decision is the triage call on a relationship: how urgent, how much impact,
// how solid the evidence is, how directly you can act, and whether you should
// dig in first. It doesn't recommend anything and doesn't write new prose — it
// grades. Frozen data, no UI, points at relationships/discoveries by id, never
// re-opens the dataset. Same shape language as Discovery and Relationship.
//
// Fields: id, type, title, summary, urgency (low|medium|high|critical), impact
// (low|medium|high), confidence, actionability, investigationRequired,
// supportingRelationships, supportingDiscoveries (the provenance chain),
// evidence, metadata.

export const URGENCY = Object.freeze({ LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CRITICAL: 'critical' });
export const IMPACT = Object.freeze({ LOW: 'low', MEDIUM: 'medium', HIGH: 'high' });

const URGENCY_RANK = Object.freeze({ low: 1, medium: 2, high: 3, critical: 4 });
const IMPACT_RANK = Object.freeze({ low: 1, medium: 2, high: 3 });

export const urgencyRank = (u) => URGENCY_RANK[u] || 0;
export const impactRank = (i) => IMPACT_RANK[i] || 0;

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

// Make a frozen Decision. Throws on a missing type/title or an urgency/impact
// outside the known bands — better to fail loud than ship a bad verdict.
export function createDecision({
  type,
  title,
  summary = '',
  urgency = URGENCY.MEDIUM,
  impact = IMPACT.MEDIUM,
  confidence = 1,
  actionability = 0.5,
  investigationRequired = false,
  supportingRelationships = [],
  supportingDiscoveries = [],
  evidence = {},
  metadata = {},
}) {
  if (!type || !title) throw new Error('createDecision requires both a type and a title');
  if (!URGENCY_RANK[urgency]) throw new Error(`createDecision: unknown urgency "${urgency}"`);
  if (!IMPACT_RANK[impact]) throw new Error(`createDecision: unknown impact "${impact}"`);
  const id = metadata.id || `${type}:${metadata.key ?? title}`;
  return Object.freeze({
    id,
    type,
    title,
    summary: String(summary),
    urgency,
    impact,
    confidence: clamp01(confidence),
    actionability: clamp01(actionability),
    investigationRequired: !!investigationRequired,
    supportingRelationships: Object.freeze([...supportingRelationships]),
    supportingDiscoveries: Object.freeze([...supportingDiscoveries]),
    evidence: Object.freeze({ ...evidence }),
    metadata: Object.freeze({ tags: [], ...metadata, id }),
  });
}
