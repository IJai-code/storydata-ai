// Detector: extremes — the records that lead and trail on the primary metric.
import { registerDetector } from '../registry.js';
import { createDiscovery, IMPORTANCE, TONE, formatNumber } from '../discovery.js';

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
      }),
      createDiscovery({
        type: 'extreme',
        title: `Lowest ${ml}`,
        summary: `${nameOf(bottom.row)} trails on ${ml} at ${formatNumber(bottom.row[m.key])}.`,
        importance: IMPORTANCE.MEDIUM,
        confidence: 1,
        evidence: { column: m.key, value: bottom.row[m.key], rowIndex: bottom.index, label: nameOf(bottom.row) },
        metadata: { detector: 'extremes', key: `min:${m.key}`, columns: [m.key], tone: TONE.NEUTRAL, direction: 'min' },
      }),
    ];
  },
});
