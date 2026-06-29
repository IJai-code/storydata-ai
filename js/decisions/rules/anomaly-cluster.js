// A cluster of anomalies. Call it medium/medium, and flag it for investigation —
// there's a root cause to find before anyone acts on it.
import { registerDecisionRule } from '../registry.js';
import { createDecision, URGENCY, IMPACT } from '../decision.js';
import { assess } from '../assess.js';

registerDecisionRule({
  name: 'anomaly-cluster',
  decide(ctx) {
    return ctx.relationshipsByType('clustered-anomaly').map((rel) => {
      const a = assess(rel, ctx.discoveryById, { investigationRequired: true });
      return createDecision({
        type: 'clustered-anomaly',
        title: rel.title,
        summary: rel.summary,
        urgency: URGENCY.MEDIUM,
        impact: IMPACT.MEDIUM,
        confidence: a.confidence,
        actionability: a.actionability,
        investigationRequired: true,
        supportingRelationships: [rel.id],
        supportingDiscoveries: a.supportingDiscoveries,
        evidence: { ...rel.evidence, evidenceStrength: a.evidenceStrength },
        metadata: { rule: 'anomaly-cluster', key: `clustered-anomaly:${rel.id}`, tone: 'warn' },
      });
    });
  },
});
