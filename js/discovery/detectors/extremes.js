// Who's on top and who's at the bottom of the primary metric.
import { registerDetector } from '../registry.js';
import { createDiscovery, IMPORTANCE, TONE, formatNumber } from '../discovery.js';
import { justify, record } from '../../derive/build.js';

const POLICY = {
  rule: 'Order the metric across all records; surface the highest and lowest.',
  params: 'ordering only — no threshold',
  source: 'discovery/detectors/extremes.js',
};
const CERTAIN = { value: 1, note: 'a direct count or ordering over the snapshot — nothing estimated' };

registerDetector({
  name: 'extremes',
  detect({ dataset, profile }) {
    const m = profile.roles.metric;
    const labelCol = profile.roles.label;
    if (!m || !labelCol) return [];

    const indexed = dataset.rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => typeof row[m.key] === 'number');
    if (indexed.length < 2) return [];

    const sorted = [...indexed].sort((a, b) => b.row[m.key] - a.row[m.key] || a.index - b.index);
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];
    const ml = m.label.toLowerCase();
    const nameOf = (r) => String(r[labelCol.key] ?? '—');

    return [
      createDiscovery({
        type: 'extreme',
        title: `Highest ${ml}`,
        summary: `${nameOf(top.row)} leads on ${ml} at ${formatNumber(top.row[m.key])}.`,
        importance: IMPORTANCE.HIGH,
        confidence: 1,
        evidence: { column: m.key, value: top.row[m.key], rowIndex: top.index, label: nameOf(top.row) },
        metadata: { detector: 'extremes', key: `max:${m.key}`, columns: [m.key], tone: TONE.OK, direction: 'max' },
        justification: justify({
          build: (g) => g.stat('max', [g.column(m.key)]),
          witness: record(dataset, top.index, [m.key]),
          asserts: top.row[m.key],
          policy: POLICY,
          confidence: CERTAIN,
        }),
      }),
      createDiscovery({
        type: 'extreme',
        title: `Lowest ${ml}`,
        summary: `${nameOf(bottom.row)} trails on ${ml} at ${formatNumber(bottom.row[m.key])}.`,
        importance: IMPORTANCE.MEDIUM,
        confidence: 1,
        evidence: { column: m.key, value: bottom.row[m.key], rowIndex: bottom.index, label: nameOf(bottom.row) },
        metadata: { detector: 'extremes', key: `min:${m.key}`, columns: [m.key], tone: TONE.NEUTRAL, direction: 'min' },
        justification: justify({
          build: (g) => g.stat('min', [g.column(m.key)]),
          witness: record(dataset, bottom.index, [m.key]),
          asserts: bottom.row[m.key],
          policy: POLICY,
          confidence: CERTAIN,
        }),
      }),
    ];
  },
});
