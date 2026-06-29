// Upside rather than risk. Nothing's on fire, so low urgency; medium impact;
// act without investigation. Stays quiet until the relationship layer feeds it.
import { registerDecisionRule } from '../registry.js';
import { createDecision, URGENCY, IMPACT } from '../decision.js';
import { assess } from '../assess.js';

registerDecisionRule({
  name: 'opportunity',
  decide(ctx) {
    return ctx.relationshipsByType('pricing-opportunity').map((rel) => {
      const a = assess(rel, ctx.discoveryById, { investigationRequired: false });
      return createDecision({
        type: 'pricing-opportunity',
        title: rel.title,
        summary: rel.summary,
        urgency: URGENCY.LOW,
        impact: IMPACT.MEDIUM,
        confidence: a.confidence,
        actionability: a.actionability,
        investigationRequired: false,
        supportingRelationships: [rel.id],
        supportingDiscoveries: a.supportingDiscoveries,
        evidence: { ...rel.evidence, evidenceStrength: a.evidenceStrength },
        metadata: { rule: 'opportunity', key: `pricing-opportunity:${rel.id}`, tone: 'ok' },
      });
    });
  },
});
