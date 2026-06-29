// Same registry idea as the other two engines. A rule is { name, decide(ctx) }
// and signs itself up on import; a new rule is just a new file under ./rules.

const rules = [];

export function registerDecisionRule(rule) {
  if (!rule || typeof rule.decide !== 'function' || !rule.name) {
    throw new Error('registerDecisionRule expects { name, decide(ctx) }');
  }
  if (rules.some((r) => r.name === rule.name)) return; // already registered
  rules.push(rule);
}

// Sorted by name for a stable run; the engine re-ranks by urgency/impact anyway.
export function getDecisionRules() {
  return [...rules].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
