// Stockouts landing right where the money is. Pairs an "out of stock" (or
// quantity-depleted) discovery with whatever leads the metric — the top category,
// or failing that the single biggest record. In short: revenue exposed to
// stockouts.
import { registerRelationship } from '../registry.js';
import { createRelationship, TONE } from '../relationship.js';

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
      }),
    ];
  },
});
