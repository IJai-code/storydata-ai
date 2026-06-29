// Rule: needs-investigation — a weak/fragile signal flagged by the Relationship
// Engine. Verdict: low urgency, low impact, investigation required, and low
// actionability — look before acting.
import { registerDecisionRule } from '../registry.js';
import { createDecision, URGENCY, IMPACT } from '../decision.js';
import { assess } from '../assess.js';

registerDecisionRule({
  name: 'investigation',
  decide(ctx) {
    return ctx.relationshipsByType('needs-investigation').map((rel) => {
      const a = assess(rel, ctx.discoveryById, { investigationRequired: true });
      return createDecision({
        type: 'needs-investigation',
        title: rel.title,
        summary: rel.summary,
        urgency: URGENCY.LOW,
        impact: IMPACT.LOW,
        confidence: a.confidence,
        actionability: a.actionability,
        investigationRequired: true,
        supportingRelationships: [rel.id],
        supportingDiscoveries: a.supportingDiscoveries,
        evidence: { ...rel.evidence, evidenceStrength: a.evidenceStrength },
        metadata: { rule: 'investigation', key: `needs-investigation:${rel.id}`, tone: 'neutral' },
      });
    });
  },
});
