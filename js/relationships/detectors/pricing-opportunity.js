// Good margin but soft sales = room to move on price or promo. It needs a
// margin-ish discovery and a low-sales one to work with. The discovery layer
// doesn't surface that pair yet, so for now this just stays quiet — the slot's
// here for when it does.
import { registerRelationship } from '../registry.js';
import { createRelationship, TONE, formatNumber } from '../relationship.js';

const isMargin = (d) => (d.metadata.tags || []).includes('margin') || /\bmargin\b/i.test(d.title);
const isLowSales = (d) =>
  d.type === 'extreme' && d.metadata.direction === 'min' && /\b(sales|units?|sold|volume)\b/i.test(d.title);

registerRelationship({
  name: 'pricing-opportunity',
  detect({ discoveries }) {
    const margin = discoveries.find(isMargin);
    const lowSales = discoveries.find(isLowSales);
    if (!margin || !lowSales) return []; // tolerate missing inputs, continue

    return [
      createRelationship({
        type: 'pricing-opportunity',
        title: 'Pricing opportunity',
        summary: `${lowSales.evidence.label} has healthy margin but trails on ${lowSales.title.toLowerCase()} (${formatNumber(lowSales.evidence.value)}) — a candidate for price or promotion changes.`,
        confidence: Math.min(margin.confidence, lowSales.confidence),
        importance: 0.55,
        supporting: [margin.id, lowSales.id],
        evidence: { marginDiscovery: margin.id, salesValue: lowSales.evidence.value, record: lowSales.evidence.label },
        metadata: { detector: 'pricing-opportunity', key: 'pricing-opportunity', tone: TONE.OK },
      }),
    ];
  },
});
