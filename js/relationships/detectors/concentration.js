// Rule: concentration — value (revenue/metric) leans heavily on a few records
// or a single group. Built from existing discoveries: the category share from
// the distribution "top-by-metric" discovery, and the max-vs-mean ratio from
// the extreme + central-tendency discoveries.
import { registerRelationship } from '../registry.js';
import { createRelationship, IMPORTANCE, TONE, formatNumber } from '../relationship.js';

const CATEGORY_SHARE_MIN = 35; // % of the metric total held by the top group
const TOP_HEAVY_RATIO = 2.5; // top record value ÷ mean

registerRelationship({
  name: 'concentration',
  detect({ discoveries, byKeyPrefix, find }) {
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
