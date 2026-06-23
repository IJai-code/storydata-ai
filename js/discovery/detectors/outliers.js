// Detector: outliers — the single record that sits furthest from the mean on
// the primary metric (|z| > 2). Confidence scales with how extreme it is.
import { registerDetector } from '../registry.js';
import { createDiscovery, IMPORTANCE, TONE, formatNumber } from '../discovery.js';

registerDetector({
  name: 'outliers',
  detect({ dataset, profile }) {
    const m = profile.roles.metric;
    const labelCol = profile.roles.label;
    if (!m || !labelCol) return [];
    const stats = profile.statsByKey[m.key];
    if (!stats || stats.count < 4 || !stats.stddev) return [];

    let best = null;
    let bestZ = 2; // threshold
    dataset.rows.forEach((row, index) => {
      const v = row[m.key];
      if (typeof v !== 'number') return;
      const z = Math.abs((v - stats.mean) / stats.stddev);
      if (z > bestZ) {
        bestZ = z;
        best = { row, index, z, value: v };
      }
    });
    if (!best) return [];

    return [
      createDiscovery({
        type: 'outlier',
        title: 'Notable outlier',
        summary: `${String(best.row[labelCol.key] ?? '—')} sits ${best.z.toFixed(1)}σ from the mean ${m.label.toLowerCase()} (${formatNumber(best.value)}).`,
        importance: IMPORTANCE.MEDIUM,
        confidence: Math.min(1, 0.5 + (best.z - 2) / 2),
        evidence: { column: m.key, value: best.value, z: best.z, rowIndex: best.index, mean: stats.mean, stddev: stats.stddev },
        metadata: { detector: 'outliers', key: `outlier:${m.key}`, columns: [m.key], tone: TONE.WARN },
      }),
    ];
  },
});
