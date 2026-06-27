// Ellery Relationship Engine — public entry point.
//
// Importing this module registers the built-in relationship rules (side-effect
// imports below) and exposes the engine API. To add a rule in future: drop a
// file in ./detectors that calls registerRelationship(), then add a single
// import line here. No other file changes — the engine, existing rules, and the
// entire Discovery Engine stay untouched.

import './detectors/concentration.js';
import './detectors/inventory-exposure.js';
import './detectors/clustered-anomaly.js';
import './detectors/fragile-outlier.js';
import './detectors/pricing-opportunity.js';

export { runRelationships, RELATIONSHIP_ENGINE_VERSION } from './engine.js';
export { createRelationship, IMPORTANCE, TONE, formatNumber } from './relationship.js';
export { registerRelationship, getRelationshipRules } from './registry.js';
