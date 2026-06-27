// Rule: clustered-anomaly — several anomaly signals at once (statistical
// outliers + availability flags) suggest one underlying issue rather than
// isolated noise. If two or more anomaly discoveries reference the same column,
// that shared column is highlighted. Needs at least two anomalies; otherwise no-op.
import { registerRelationship } from '../registry.js';
import { createRelationship, TONE } from '../relationship.js';

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
      }),
    ];
  },
});
