// Public surface for the discovery engine. Importing this pulls in the built-in
// detectors (they register themselves) and re-exports everything callers need.
// Adding a detector later = drop a file in ./detectors and add one import below.

import './detectors/extremes.js';
import './detectors/central-tendency.js';
import './detectors/distribution.js';
import './detectors/availability.js';
import './detectors/outliers.js';

export { runDiscovery, DISCOVERY_ENGINE_VERSION } from './engine.js';
export { profileDataset } from './profile.js';
export { createDiscovery, IMPORTANCE, TONE, formatNumber } from './discovery.js';
export { registerDetector, getDetectors } from './registry.js';
export { resolveDomain, DOMAINS } from './domains.js';
