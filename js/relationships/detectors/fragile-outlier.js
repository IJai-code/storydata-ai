// An outlier the discovery layer wasn't very sure about. A shaky anomaly is a
// "go look at this," not something to act on automatically. Only reads outliers.
import { registerRelationship } from '../registry.js';
import { createRelationship, TONE } from '../relationship.js';

const LOW_CONFIDENCE = 0.7;

registerRelationship({
  name: 'fragile-outlier',
  detect({ byType }) {
    const out = [];
    for (const o of byType('outlier')) {
      if (o.confidence < LOW_CONFIDENCE) {
        out.push(
          createRelationship({
            type: 'needs-investigation',
            title: 'Needs investigation',
            summary: `${o.evidence.label || 'A record'} looks like an outlier but the signal is weak (${Math.round(o.confidence * 100)}% confidence) — investigate before acting on it.`,
            confidence: 1, // we are confident this warrants review
            importance: 0.4,
            supporting: [o.id],
            evidence: { z: o.evidence.z, value: o.evidence.value, outlierConfidence: o.confidence, column: o.evidence.column },
            metadata: { detector: 'fragile-outlier', key: `needs-investigation:${o.id}`, tone: TONE.NEUTRAL },
          })
        );
      }
    }
    return out;
  },
});
