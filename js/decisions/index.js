// Public surface. Importing it registers the built-in rules (the imports below
// do that) and re-exports the engine. Another rule = another file under ./rules
// plus one import line; the engines upstream don't care.

import './rules/inventory-risk.js';
import './rules/concentration.js';
import './rules/anomaly-cluster.js';
import './rules/investigation.js';
import './rules/opportunity.js';

export { runDecisions, DECISION_ENGINE_VERSION } from './engine.js';
export { createDecision, URGENCY, IMPACT, urgencyRank, impactRank } from './decision.js';
export { registerDecisionRule, getDecisionRules } from './registry.js';
