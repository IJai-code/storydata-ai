// Rule: inventory-risk — supply exposure on the value leader.
// Verdict: high impact (revenue at stake); urgency scales with how much is
// unavailable; directly actionable, no investigation needed.
import { registerDecisionRule } from '../registry.js';
import { createDecision, URGENCY, IMPACT } from '../decision.js';
import { assess } from '../assess.js';

registerDecisionRule({
  name: 'inventory-risk',
  decide(ctx) {
    return ctx.relationshipsByType('inventory-risk').map((rel) => {
      const a = assess(rel, ctx.discoveryById, { investigationRequired: false });
      const frac = rel.evidence.total ? rel.evidence.unavailable / rel.evidence.total : 0;
      const urgency = frac >= 0.3 || rel.metadata.tone === 'critical' ? URGENCY.HIGH : URGENCY.MEDIUM;
      return createDecision({
        type: 'inventory-risk',
        title: rel.title,
        summary: rel.summary,
        urgency,
        impact: IMPACT.HIGH,
        confidence: a.confidence,
        actionability: a.actionability,
        investigationRequired: false,
        supportingRelationships: [rel.id],
        supportingDiscoveries: a.supportingDiscoveries,
        evidence: {
          unavailable: rel.evidence.unavailable,
          total: rel.evidence.total,
          leader: rel.evidence.leader,
          unavailableShare: Math.round(frac * 100) / 100,
          evidenceStrength: a.evidenceStrength,
        },
        metadata: { rule: 'inventory-risk', key: `inventory-risk:${rel.id}`, tone: 'critical' },
      });
    });
  },
});
