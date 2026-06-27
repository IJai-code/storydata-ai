// Relationship-rule registry — the extension point.
//
// A rule is { name: string, detect(ctx) -> Relationship[] }, where
// ctx = { report, discoveries, byType, byKey, find, all }. Rules self-register
// on import; adding one never requires editing existing rules or the engine.

const rules = [];

export function registerRelationship(rule) {
  if (!rule || typeof rule.detect !== 'function' || !rule.name) {
    throw new Error('registerRelationship expects { name, detect(ctx) }');
  }
  if (rules.some((r) => r.name === rule.name)) return; // idempotent under repeated imports
  rules.push(rule);
}

// Name-sorted so a run is deterministic regardless of import order; the engine
// still ranks the resulting relationships by importance.
export function getRelationshipRules() {
  return [...rules].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
