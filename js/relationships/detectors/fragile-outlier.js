// An outlier that sits only just past the line. A shaky anomaly is a "go look at
// this", not something to act on automatically. Only reads outliers.
//
// It thresholds on z, not on the outlier's confidence score. Confidence is how
// strongly the system presents a finding — presentation, not a fact about the
// data — so letting it decide what is true would put a display concern in the
// truth path. The two are equivalent anyway: confidence = min(1, 0.5 + (z−2)/2),
// so the old `confidence < 0.7` line is exactly `z < 2.4`.
import { registerRelationship } from '../registry.js';
import { createRelationship, TONE } from '../relationship.js';
import { justifyOver } from '../../derive/build.js';

const FRAGILE_Z = 2.4;

registerRelationship({
  name: 'fragile-outlier',
  detect({ byType }) {
    const out = [];
    for (const o of byType('outlier')) {
      const z = o.evidence.z;
      if (typeof z !== 'number' || z >= FRAGILE_Z) continue;
      // The outlier names its own record; take the label from the claim rather
      // than guessing, so what we state is what verification will re-derive.
      const label = o.justification?.asserts?.label ?? 'A record';
      out.push(
        createRelationship({
          type: 'needs-investigation',
          title: 'Needs investigation',
          summary: `${label} sits ${z.toFixed(1)}σ from the mean — under the ${FRAGILE_Z}σ line where the signal firms up, so investigate before acting on it.`,
          confidence: 1, // we are confident this warrants review
          importance: 0.4,
          supporting: [o.id],
          evidence: { z, value: o.evidence.value, column: o.evidence.column },
          metadata: { detector: 'fragile-outlier', key: `needs-investigation:${o.id}`, tone: TONE.NEUTRAL },
          justification: justifyOver({
            supports: [o.id],
            build: (g) => {
              const zOf = g.claim(o.id, 'z');
              return g.record({
                label: g.claim(o.id, 'label'),
                z: zOf,
                meets: g.reduce('below', [zOf, g.param('fragile-z', FRAGILE_Z)]),
              });
            },
            policy: {
              rule: 'Flag an outlier that clears the detection line only narrowly, so it is reviewed rather than acted on.',
              params: `z < ${FRAGILE_Z}σ`,
              source: 'relationships/detectors/fragile-outlier.js',
            },
            confidence: { value: 1, note: 'a direct comparison against the supporting finding' },
            asserts: { label, z, meets: true },
          }),
        })
      );
    }
    return out;
  },
});
