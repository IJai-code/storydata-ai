// The "typical" value — mean and median — for the main numeric columns.
import { registerDetector } from '../registry.js';
import { createDiscovery, IMPORTANCE, TONE, formatNumber } from '../discovery.js';
import { justify, wholeColumn } from '../../derive/build.js';

const POLICY = {
  rule: 'Report the mean and median of the numeric column.',
  params: 'descriptive — no threshold',
  source: 'discovery/detectors/central-tendency.js',
};
const CERTAIN = { value: 1, note: 'a direct count or ordering over the snapshot — nothing estimated' };

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
          justification: justify({
            build: (g) => {
              const c = g.column(col.key);
              return g.reduce('describe', [g.stat('mean', [c]), g.stat('median', [c]), g.stat('stddev', [c])]);
            },
            witness: wholeColumn(col.key, [col.key]),
            asserts: { mean: col.stats.mean, median: col.stats.median, stddev: col.stats.stddev },
            policy: POLICY,
            confidence: CERTAIN,
          }),
        })
      );
    };
    add(profile.roles.metric, 'metric');
    if (profile.roles.price && profile.roles.price !== profile.roles.metric) add(profile.roles.price, 'price');
    return out;
  },
});
