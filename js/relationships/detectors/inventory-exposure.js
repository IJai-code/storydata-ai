// Rule: inventory-risk — availability problems coincide with where the value
// sits. Built from an availability "out of stock" (or quantity-depleted)
// discovery plus the leading metric discovery (top category by metric, else the
// single highest record). Surfaces "revenue is exposed to stockouts".
import { registerRelationship } from '../registry.js';
import { createRelationship, TONE } from '../relationship.js';

registerRelationship({
  name: 'inventory-exposure',
  detect({ discoveries, byKeyPrefix, find }) {
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
