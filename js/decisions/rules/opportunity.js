// Rule: pricing-opportunity — an upside signal rather than a risk.
// Verdict: low urgency (nothing is on fire), medium impact, actionable without
// investigation. No-ops until the Relationship Engine surfaces the signal.
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
