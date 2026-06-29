// Decision-rule registry — the extension point.
//
// A rule is { name: string, decide(ctx) -> Decision[] }, where
// ctx = { discoveries, relationships, discoveryById, relationshipsByType }.
// Rules self-register on import; adding one never requires editing existing
// rules or the engine.

const rules = [];

export function registerDecisionRule(rule) {
  if (!rule || typeof rule.decide !== 'function' || !rule.name) {
    throw new Error('registerDecisionRule expects { name, decide(ctx) }');
  }
  if (rules.some((r) => r.name === rule.name)) return; // idempotent under repeated imports
  rules.push(rule);
}

// Name-sorted so a run is deterministic regardless of import order; the engine
// still ranks the resulting decisions by urgency/impact.
export function getDecisionRules() {
  return [...rules].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
