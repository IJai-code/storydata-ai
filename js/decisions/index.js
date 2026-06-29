// Ellery Decision Engine — public entry point.
//
// Importing this module registers the built-in decision rules (side-effect
// imports below) and exposes the engine API. To add a rule in future: drop a
// file in ./rules that calls registerDecisionRule(), then add a single import
// line here. No other file changes — the engine, existing rules, and the
// Discovery / Relationship Engines stay untouched.

import './rules/inventory-risk.js';
import './rules/concentration.js';
import './rules/anomaly-cluster.js';
import './rules/investigation.js';
import './rules/opportunity.js';

export { runDecisions, DECISION_ENGINE_VERSION } from './engine.js';
export { createDecision, URGENCY, IMPACT, urgencyRank, impactRank } from './decision.js';
export { registerDecisionRule, getDecisionRules } from './registry.js';
