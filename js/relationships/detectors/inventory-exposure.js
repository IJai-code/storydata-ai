// Stockouts landing right where the money is. Pairs an "out of stock" (or
// quantity-depleted) discovery with whatever leads the metric — the top category,
// or failing that the single biggest record. In short: revenue exposed to
// stockouts.
import { registerRelationship } from '../registry.js';
import { createRelationship, TONE } from '../relationship.js';
import { justifyOver } from '../../derive/build.js';

registerRelationship({
  name: 'inventory-exposure',
  detect({ byKeyPrefix, find }) {
    const critical = find(
      (d) => d.type === 'availability' && (d.metadata.key === 'status:critical' || d.metadata.key === 'qty:zero')
    );
    if (!critical) return [];

    // Where the value concentrates: prefer category leader, else the top record.
    const leader =
      byKeyPrefix('top-by-metric:')[0] || find((d) => d.type === 'extreme' && d.metadata.direction === 'max');
    if (!leader) return [];

    const count = Number(critical.evidence.count) || 0;
    const total = Number(critical.evidence.total) || 0;
    if (!count) return [];
    const leaderName = leader.type === 'distribution' ? leader.evidence.value : leader.evidence.label;

    return [
      createRelationship({
        type: 'inventory-risk',
        title: 'Inventory risk',
        summary: `${count} of ${total} records are unavailable while ${leaderName} carries the most value — revenue is exposed to stockouts.`,
        confidence: Math.min(critical.confidence, leader.confidence),
        importance: Math.min(0.95, 0.6 + 0.4 * (total ? count / total : 0)),
        supporting: [critical.id, leader.id],
        evidence: {
          unavailable: count,
          total,
          leader: leaderName,
          metricColumn: leader.evidence.metricColumn || leader.evidence.column || null,
        },
        metadata: { detector: 'inventory-exposure', key: 'inventory-risk', tone: TONE.CRITICAL },
        justification: justifyOver({
          supports: [critical.id, leader.id],
          build: (g) => {
            const unavailable = g.claim(critical.id, 'count');
            return g.record({
              unavailable,
              total: g.claim(critical.id, 'total'),
              // The leader is whichever finding carries the value here; the rule
              // knows which it cited, so it names the matching field.
              leader: g.claim(leader.id, leader.type === 'distribution' ? 'value' : 'label'),
              meets: g.reduce('atLeast', [unavailable, g.param('min-unavailable', 1)]),
            });
          },
          policy: {
            rule: 'Pair unavailable stock with whatever leads the metric, so exposure is stated against where the value sits.',
            params: 'at least one unavailable record',
            source: 'relationships/detectors/inventory-exposure.js',
          },
          confidence: { value: Math.min(critical.confidence, leader.confidence), note: 'weakest of the two supporting findings' },
          asserts: { unavailable: count, total, leader: leaderName, meets: true },
        }),
      }),
    ];
  },
});
