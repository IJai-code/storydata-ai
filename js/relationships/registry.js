// Same registry pattern as the discovery side: a rule is { name, detect(ctx) }
// and registers itself on import, so a new rule is just a new file.

const rules = [];

export function registerRelationship(rule) {
  if (!rule || typeof rule.detect !== 'function' || !rule.name) {
    throw new Error('registerRelationship expects { name, detect(ctx) }');
  }
  if (rules.some((r) => r.name === rule.name)) return; // seen it already
  rules.push(rule);
}

// Name-sorted for a stable run order; the engine re-ranks by importance after.
export function getRelationshipRules() {
  return [...rules].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
