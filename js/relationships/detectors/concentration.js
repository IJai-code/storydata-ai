// "Too many eggs in one basket" — most of the metric riding on one group or a
// handful of records. Two ways to spot it: the top group's share (from the
// distribution discovery) and how far the single biggest record sits above the
// average (extreme vs central-tendency).
import { registerRelationship } from '../registry.js';
import { createRelationship, TONE, formatNumber } from '../relationship.js';
import { justifyOver } from '../../derive/build.js';

// These two thresholds are judgement calls, not science. 35% felt like the point
// where "one group carries this" stops being noise, and 2.5x mean is roughly
// where a single record starts to skew the picture. Tune if real data disagrees.
const CATEGORY_SHARE_MIN = 35; // top group's share of the metric total
const TOP_HEAVY_RATIO = 2.5; // biggest record ÷ mean

registerRelationship({
  name: 'concentration',
  detect({ byKeyPrefix, find }) {
    const out = [];

    // (a) One category dominates the metric total.
    const top = byKeyPrefix('top-by-metric:')[0];
    if (top && typeof top.evidence.share === 'number' && top.evidence.share >= CATEGORY_SHARE_MIN) {
      const share = top.evidence.share;
      out.push(
        createRelationship({
          type: 'concentration',
          title: 'Concentration risk',
          summary: `${top.evidence.value} accounts for ${share}% of the total — value is concentrated in one group.`,
          confidence: 1,
          importance: Math.min(0.85, 0.45 + (share - CATEGORY_SHARE_MIN) / 100),
          supporting: [top.id],
          evidence: { kind: 'category-share', group: top.evidence.value, share, metricColumn: top.evidence.metricColumn },
          metadata: { detector: 'concentration', key: 'concentration:category', tone: share >= 60 ? TONE.CRITICAL : TONE.WARN },
          justification: justifyOver({
            supports: [top.id],
            // Every quantity the summary states, plus the predicate outcome.
            // `group` and `share` are projected from the supporting Discovery's
            // own asserted value, which verification re-derives from cells.
            build: (g) => {
              const shareOf = g.claim(top.id, 'share');
              return g.record({
                group: g.claim(top.id, 'value'),
                share: shareOf,
                meets: g.reduce('atLeast', [shareOf, g.param('share-min', CATEGORY_SHARE_MIN)]),
              });
            },
            policy: {
              rule: 'Flag a category holding at least the share threshold of the metric total.',
              params: `share ≥ ${CATEGORY_SHARE_MIN}%`,
              source: 'relationships/detectors/concentration.js',
            },
            confidence: { value: 1, note: 'a direct comparison against the supporting finding' },
            asserts: { group: top.evidence.value, share, meets: true },
          }),
        })
      );
    }

    // (b) A single record towers over the average.
    const maxD = find((d) => d.type === 'extreme' && d.metadata.direction === 'max');
    const avgD = find((d) => d.type === 'central-tendency' && (d.metadata.tags || []).includes('metric'));
    if (
      maxD &&
      avgD &&
      typeof maxD.evidence.value === 'number' &&
      typeof avgD.evidence.mean === 'number' &&
      avgD.evidence.mean > 0
    ) {
      const ratio = maxD.evidence.value / avgD.evidence.mean;
      if (ratio >= TOP_HEAVY_RATIO) {
        out.push(
          createRelationship({
            type: 'concentration',
            title: 'Top-heavy distribution',
            summary: `${maxD.evidence.label} is ${ratio.toFixed(1)}× the average (${formatNumber(maxD.evidence.value)} vs ${formatNumber(avgD.evidence.mean)}) — a few records dominate.`,
            confidence: 1,
            importance: Math.min(0.8, 0.4 + (ratio - TOP_HEAVY_RATIO) * 0.1),
            supporting: [maxD.id, avgD.id],
            evidence: {
              kind: 'max-vs-mean',
              leader: maxD.evidence.label,
              max: maxD.evidence.value,
              mean: avgD.evidence.mean,
              ratio: Math.round(ratio * 100) / 100,
            },
            metadata: { detector: 'concentration', key: 'concentration:record', tone: TONE.WARN },
          })
        );
      }
    }

    return out;
  },
});
