// Detector: central tendency — the typical value of the key numeric columns.
import { registerDetector } from '../registry.js';
import { createDiscovery, IMPORTANCE, TONE, formatNumber } from '../discovery.js';

registerDetector({
  name: 'central-tendency',
  detect({ profile }) {
    const out = [];
    const add = (col, tag) => {
      if (!col || col.type !== 'number' || !col.stats.count) return;
      const l = col.label.toLowerCase();
      out.push(
        createDiscovery({
          type: 'central-tendency',
          title: `Average ${l}`,
          summary: `Mean ${l} is ${formatNumber(col.stats.mean)} (median ${formatNumber(col.stats.median)}).`,
          importance: IMPORTANCE.LOW,
          confidence: 1,
          evidence: { column: col.key, mean: col.stats.mean, median: col.stats.median, stddev: col.stats.stddev },
          metadata: { detector: 'central-tendency', key: `avg:${col.key}`, columns: [col.key], tone: TONE.NEUTRAL, tags: [tag] },
        })
      );
    };
    add(profile.roles.metric, 'metric');
    if (profile.roles.price && profile.roles.price !== profile.roles.metric) add(profile.roles.price, 'price');
    return out;
  },
});
