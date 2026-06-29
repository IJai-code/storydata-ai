// Ellery Decision Engine — the standardized Decision object.
//
// A Decision is a triage verdict over an existing relationship: how urgent it
// is, how much impact it carries, how trustworthy the evidence is, how directly
// it can be acted on, and whether it needs investigation first. It generates NO
// recommendations and NO new prose — it assesses. Pure data: no DOM, no
// rendering, no UI. It references relationships and discoveries by id and never
// re-reads the raw dataset. This mirrors the Discovery / Relationship objects so
// future Recommendation / Narrative engines consume one consistent shape.
//
// @typedef {Object} Decision
// @property {string}   id
// @property {string}   type
// @property {string}   title
// @property {string}   summary
// @property {'low'|'medium'|'high'|'critical'} urgency
// @property {'low'|'medium'|'high'}            impact
// @property {number}   confidence            0..1 (evidence/confidence quality)
// @property {number}   actionability         0..1 (how directly it can be acted on)
// @property {boolean}  investigationRequired
// @property {string[]} supportingRelationships  relationship ids
// @property {string[]} supportingDiscoveries    discovery ids (the provenance chain)
// @property {Object}   evidence
// @property {Object}   metadata

export const URGENCY = Object.freeze({ LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CRITICAL: 'critical' });
export const IMPACT = Object.freeze({ LOW: 'low', MEDIUM: 'medium', HIGH: 'high' });

const URGENCY_RANK = Object.freeze({ low: 1, medium: 2, high: 3, critical: 4 });
const IMPACT_RANK = Object.freeze({ low: 1, medium: 2, high: 3 });

export const urgencyRank = (u) => URGENCY_RANK[u] || 0;
export const impactRank = (i) => IMPACT_RANK[i] || 0;

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * Build a validated, immutable Decision. Throws on missing essentials or an
 * unknown urgency/impact band so a malformed rule fails loudly in development.
 */
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
