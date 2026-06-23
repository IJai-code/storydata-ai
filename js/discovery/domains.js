// Domain descriptors — the ONLY place domain-specific vocabulary lives.
//
// The engine and detectors stay domain-agnostic: they operate on semantic roles
// (metric, category, status, quantity, price, name, identifier, temporal) and a
// status classifier. A domain supplies the name-hints that map columns to roles,
// the status vocabulary, and a metric-priority ordering. Retail is simply the
// first supported domain; add another by appending to DOMAINS — no engine change.
//
// @typedef {Object} Domain
// @property {string} id
// @property {string} label
// @property {Object<string, RegExp[]>} hints        role -> column-name patterns
// @property {?{critical:RegExp[],warn:RegExp[],ok:RegExp[]}} statusVocab
// @property {RegExp[]} metricPriority                ordered preference for the primary metric

const GENERIC = {
  id: 'generic',
  label: 'General',
  hints: {},
  statusVocab: null,
  metricPriority: [],
};

const RETAIL = {
  id: 'retail',
  label: 'Retail / Inventory',
  hints: {
    name: [/\b(name|product|title|item)\b/i],
    identifier: [/\b(sku|upc|ean|code)\b/i, /^id$/i],
    category: [/categor|segment|class|\btype\b|group|brand|department/i],
    status: [/status|state|availability/i],
    price: [/price|cost|rate|\bfee\b|msrp/i],
    quantity: [/stock|inventory|qty|quantity|units?\b|on[-\s]?hand|count/i],
    metric: [/revenue|sales|gross|amount|total/i],
  },
  statusVocab: {
    critical: [/out[-\s]?of[-\s]?stock|sold[-\s]?out|\bout\b|discontinued|unavailable|backordered/i],
    warn: [/\blow\b|limited|backorder|reorder|aging/i],
    ok: [/in[-\s]?stock|available|active|healthy|\bok\b/i],
  },
  metricPriority: [/revenue|sales/i, /gross|amount|total/i, /inventory|stock/i, /units?\b|count/i],
};

// Order matters only for tie-breaks; resolveDomain scores explicitly.
export const DOMAINS = [RETAIL, GENERIC];

export const GENERIC_DOMAIN = GENERIC;

/**
 * Choose the most specific domain whose name-hints match the dataset's columns.
 * Requires at least two distinct role matches before claiming a specialised
 * domain, so a stray "type" column won't masquerade as retail.
 */
export function resolveDomain(columns) {
  let best = GENERIC;
  let bestScore = 0;
  for (const domain of DOMAINS) {
    if (domain === GENERIC) continue;
    let score = 0;
    for (const role of Object.keys(domain.hints)) {
      const matched = columns.some((c) =>
        domain.hints[role].some((re) => re.test(c.label) || re.test(c.key))
      );
      if (matched) score += 1;
    }
    if (score > bestScore) {
      best = domain;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best : GENERIC;
}
