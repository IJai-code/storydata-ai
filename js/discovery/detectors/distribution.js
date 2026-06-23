// Detector: distribution — how records spread across the primary category, and
// which group dominates the metric.
import { registerDetector } from '../registry.js';
import { createDiscovery, IMPORTANCE, TONE, formatNumber } from '../discovery.js';

registerDetector({
  name: 'distribution',
  detect({ dataset, profile }) {
    const cat = profile.roles.category;
    if (!cat) return [];
    const out = [];
    const cl = cat.label.toLowerCase();
    const top = cat.stats.top || [];

    if (top.length) {
      out.push(
        createDiscovery({
          type: 'distribution',
          title: `Largest ${cl}`,
          summary: `${top[0][0]} is the largest ${cl} with ${top[0][1]} ${top[0][1] === 1 ? 'record' : 'records'}.`,
          importance: IMPORTANCE.MEDIUM,
          confidence: 1,
          evidence: { column: cat.key, value: top[0][0], count: top[0][1], groups: top.length },
          metadata: { detector: 'distribution', key: `largest:${cat.key}`, columns: [cat.key], tone: TONE.NEUTRAL },
        })
      );
      out.push(
        createDiscovery({
          type: 'distribution',
          title: `${cat.label} spread`,
          summary: `Records span ${top.length} ${cl} ${top.length === 1 ? 'group' : 'groups'}.`,
          importance: IMPORTANCE.MINOR,
          confidence: 1,
          evidence: { column: cat.key, groups: top.length },
          metadata: { detector: 'distribution', key: `spread:${cat.key}`, columns: [cat.key], tone: TONE.NEUTRAL },
        })
      );
    }

    const m = profile.roles.metric;
    if (m) {
      const totals = new Map();
      for (const row of dataset.rows) {
        const v = row[m.key];
        if (typeof v !== 'number') continue;
        const k = String(row[cat.key] ?? '—');
        totals.set(k, (totals.get(k) || 0) + v);
      }
      const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
      if (ranked.length) {
        const grand = ranked.reduce((a, [, t]) => a + t, 0);
        const share = grand > 0 ? Math.round((ranked[0][1] / grand) * 100) : 0;
        out.push(
          createDiscovery({
            type: 'distribution',
            title: `Top ${cl} by ${m.label.toLowerCase()}`,
            summary: `${ranked[0][0]} drives ${formatNumber(ranked[0][1])} of ${m.label.toLowerCase()}${share ? ` (${share}% of total)` : ''}.`,
            importance: IMPORTANCE.MEDIUM,
            confidence: 1,
            evidence: { categoryColumn: cat.key, metricColumn: m.key, value: ranked[0][0], total: ranked[0][1], share },
            metadata: { detector: 'distribution', key: `top-by-metric:${cat.key}:${m.key}`, columns: [cat.key, m.key], tone: TONE.OK },
          })
        );
      }
    }
    return out;
  },
});
