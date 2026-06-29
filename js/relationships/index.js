// Public surface. Importing it registers the built-in rules (they pull
// themselves in below) and re-exports the engine. New rule = new file in
// ./detectors + one import line here; nothing else moves.

import './detectors/concentration.js';
import './detectors/inventory-exposure.js';
import './detectors/clustered-anomaly.js';
import './detectors/fragile-outlier.js';
import './detectors/pricing-opportunity.js';

export { runRelationships, RELATIONSHIP_ENGINE_VERSION } from './engine.js';
export { createRelationship, IMPORTANCE, TONE, formatNumber } from './relationship.js';
export { registerRelationship, getRelationshipRules } from './registry.js';
