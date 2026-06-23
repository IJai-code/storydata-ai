// Ellery Discovery Engine — public entry point.
//
// Importing this module registers the built-in detectors (side-effect imports
// below) and exposes the engine API. To add a detector in future: drop a file
// in ./detectors that calls registerDetector(), then add a single import line
// here. No other file changes — the engine, profiler, and existing detectors
// stay untouched.

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
