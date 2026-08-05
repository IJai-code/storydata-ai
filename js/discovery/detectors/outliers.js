// The one record that sits furthest from the mean on the primary metric, if it's
// past 2 sigma. The further out it is, the more confident we are about it.
import { registerDetector } from '../registry.js';
import { createDiscovery, IMPORTANCE, TONE, formatNumber } from '../discovery.js';
import { justify, record } from '../../derive/build.js';

const SIGMA = 2; // π: how far past the mean a record must sit to be flagged

registerDetector({
  name: 'outliers',
  detect({ dataset, profile }) {
    const m = profile.roles.metric;
    const labelCol = profile.roles.label;
    if (!m || !labelCol) return [];
    const stats = profile.statsByKey[m.key];
    if (!stats || stats.count < 4 || !stats.stddev) return [];

    let best = null;
    let bestZ = SIGMA; // threshold
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
        justification: justify({
          build: (g) => {
            const c = g.column(m.key);
            const z = g.reduce('zscore', [
              g.cell(dataset, best.index, m.key),
              g.stat('mean', [c]),
              g.stat('stddev', [c]),
            ]);
            return g.reduce('exceeds', [z, g.param('sigma-threshold', SIGMA)]);
          },
          witness: record(dataset, best.index, [m.key]),
          asserts: true,
          policy: {
            rule: 'Flag the record whose distance from the mean exceeds the σ threshold.',
            params: `threshold = ${SIGMA.toFixed(1)}σ`,
            source: 'discovery/detectors/outliers.js',
          },
          confidence: {
            value: Math.min(1, 0.5 + (best.z - 2) / 2),
            note: 'scales with distance past 2σ: min(1, 0.5 + (z − 2) / 2)',
          },
        }),
      }),
    ];
  },
});
