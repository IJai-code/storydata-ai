// A shaky signal the relationship layer already flagged. Low urgency, low impact,
// needs a look, low actionability — basically: check it before trusting it.
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
