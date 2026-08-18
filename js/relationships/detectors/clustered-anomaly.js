// When a bunch of anomalies show up together — outliers plus availability flags
// — it usually means one root cause, not a pile of unrelated noise. If two or
// more of them point at the same column, we call that out. Under two: skip.
import { registerRelationship } from '../registry.js';
import { createRelationship, TONE } from '../relationship.js';
import { justifyOver } from '../../derive/build.js';

const MIN_SIGNALS = 2;

registerRelationship({
  name: 'clustered-anomaly',
  detect({ discoveries }) {
    const anomalies = discoveries.filter(
      (d) =>
        d.type === 'outlier' ||
        // availability flags, but NOT the composite "health" summary (not an anomaly)
        (d.type === 'availability' &&
          d.metadata.key !== 'health' &&
          (d.metadata.tone === 'critical' || d.metadata.tone === 'warn'))
    );
    if (anomalies.length < 2) return [];

    // Find any column shared by 2+ anomalies (deterministic: first by sorted key).
    const colCount = new Map();
    for (const a of anomalies) {
      for (const c of a.metadata.columns || []) colCount.set(c, (colCount.get(c) || 0) + 1);
    }
    const shared = [...colCount.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .map(([c]) => c);

    const confidence = anomalies.reduce((a, d) => a + d.confidence, 0) / anomalies.length;
    const where = shared.length ? ` concentrated on ${shared[0]}` : '';

    return [
      createRelationship({
        type: 'clustered-anomaly',
        title: 'Clustered anomalies',
        summary: `${anomalies.length} anomaly signals detected${where} — likely a single underlying issue rather than isolated noise.`,
        confidence,
        importance: Math.min(0.8, 0.45 + 0.1 * anomalies.length),
        supporting: anomalies.map((a) => a.id),
        evidence: { count: anomalies.length, sharedColumns: shared, types: [...new Set(anomalies.map((a) => a.type))].sort() },
        metadata: { detector: 'clustered-anomaly', key: 'clustered-anomaly', tone: TONE.WARN },
        justification: justifyOver({
          // Selection is recorded, not re-run: these are the anomalies the rule
          // cited, and the count is over exactly them.
          supports: anomalies.map((a) => a.id),
          build: (g) => {
            const members = g.reduce('list', anomalies.map((a) => g.claim(a.id)));
            // Shared fields come from each support's own recorded witness, so
            // "concentrated on X" is checkable rather than decorative.
            const fields = g.reduce('list', anomalies.map((a) => g.claim(a.id, '@fields')));
            return g.record({
              count: g.reduce('count', [members]),
              sharedColumns: g.reduce('sharedFields', [fields]),
              meets: g.reduce('atLeast', [g.reduce('count', [members]), g.param('min-signals', MIN_SIGNALS)]),
            });
          },
          policy: {
            rule: 'Group anomaly signals that land on the same fields; report the cluster once at least the minimum are present.',
            params: `signals ≥ ${MIN_SIGNALS}`,
            source: 'relationships/detectors/clustered-anomaly.js',
          },
          confidence: { value: confidence, note: 'the mean confidence of the clustered signals' },
          asserts: { count: anomalies.length, sharedColumns: shared, meets: true },
        }),
      }),
    ];
  },
});
