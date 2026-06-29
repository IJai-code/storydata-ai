// Value riding on a few records/groups. High impact (a lot leans on a little);
// medium urgency, bumped to high when it's really lopsided. Act without digging.
import { registerDecisionRule } from '../registry.js';
import { createDecision, URGENCY, IMPACT } from '../decision.js';
import { assess } from '../assess.js';

registerDecisionRule({
  name: 'concentration',
  decide(ctx) {
    return ctx.relationshipsByType('concentration').map((rel) => {
      const a = assess(rel, ctx.discoveryById, { investigationRequired: false });
      const severe = rel.metadata.tone === 'critical' || Number(rel.evidence.share) >= 60;
      return createDecision({
        type: 'concentration',
        title: rel.title,
        summary: rel.summary,
        urgency: severe ? URGENCY.HIGH : URGENCY.MEDIUM,
        impact: IMPACT.HIGH,
        confidence: a.confidence,
        actionability: a.actionability,
        investigationRequired: false,
        supportingRelationships: [rel.id],
        supportingDiscoveries: a.supportingDiscoveries,
        evidence: { ...rel.evidence, evidenceStrength: a.evidenceStrength },
        metadata: { rule: 'concentration', key: `concentration:${rel.id}`, tone: severe ? 'critical' : 'warn' },
      });
    });
  },
});
